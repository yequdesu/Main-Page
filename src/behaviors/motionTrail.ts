export interface MotionPoint {
  x: number
  y: number
}

export interface MotionTrailConfig {
  width: number
  height: number
  duration: number
  finalRadius: number
  trailSpacing: number
  shrinkRate: number
  waypointCount: number
  randomness: number
  margin?: number
  bounds?: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

export interface MotionPathSample {
  point: MotionPoint
  distance: number
}

export interface MotionPath {
  seed: number
  controlPoints: MotionPoint[]
  samples: MotionPathSample[]
  totalLength: number
}

export interface TrailCircle {
  id: number
  point: MotionPoint
  radius: number
  emittedRadius: number
  birthTime: number
}

export interface CircleConnector {
  firstPositive: MotionPoint
  secondPositive: MotionPoint
  secondNegative: MotionPoint
  firstNegative: MotionPoint
}

export interface MotionTrailFrame {
  progress: number
  distanceProgress: number
  speed: number
  main: {
    point: MotionPoint
    radius: number
  }
  trail: TrailCircle[]
}

const TAU = Math.PI * 2

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function nextRandom(state: { value: number }): number {
  let x = state.value | 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  state.value = x | 0
  return (x >>> 0) / 0x1_0000_0000
}

function catmullRom(
  p0: MotionPoint,
  p1: MotionPoint,
  p2: MotionPoint,
  p3: MotionPoint,
  t: number,
): MotionPoint {
  const t2 = t * t
  const t3 = t2 * t
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
      + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
      + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
      + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
      + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  }
}

export function smootherstep(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Integral of a normalized sin-squared bell velocity profile. */
export function bellDistanceProgress(value: number): number {
  const t = clamp(value, 0, 1)
  return t - Math.sin(TAU * t) / TAU
}

/** Derivative of bellDistanceProgress; zero at both endpoints. */
export function bellSpeed(value: number): number {
  const t = clamp(value, 0, 1)
  return 1 - Math.cos(TAU * t)
}

export function inverseBellDistanceProgress(progress: number): number {
  const target = clamp(progress, 0, 1)
  let low = 0
  let high = 1
  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) * 0.5
    if (bellDistanceProgress(mid) < target) low = mid
    else high = mid
  }
  return (low + high) * 0.5
}

export function createMotionPath(
  start: MotionPoint,
  end: MotionPoint,
  config: MotionTrailConfig,
  seed: number,
): MotionPath {
  const random = { value: seed || 0x6d2b79f5 }
  const dx = end.x - start.x
  const dy = end.y - start.y
  const directDistance = Math.max(1, Math.hypot(dx, dy))
  const dirX = dx / directDistance
  const dirY = dy / directDistance
  const normalX = -dirY
  const normalY = dirX
  const margin = Math.max(config.finalRadius + 10, config.margin ?? 28)
  const minX = config.bounds?.minX ?? Math.min(margin, config.width * 0.45)
  const minY = config.bounds?.minY ?? Math.min(margin, config.height * 0.45)
  const maxX = config.bounds?.maxX ?? Math.max(minX, config.width - minX)
  const maxY = config.bounds?.maxY ?? Math.max(minY, config.height - minY)
  const waypointCount = Math.max(0, Math.round(config.waypointCount))
  const controlPoints: MotionPoint[] = [start]

  for (let i = 1; i <= waypointCount; i += 1) {
    const t = i / (waypointCount + 1)
    const baseX = lerp(start.x, end.x, t)
    const baseY = lerp(start.y, end.y, t)
    const alongOffset = (nextRandom(random) * 2 - 1) * directDistance * config.randomness * 0.55
    const sideOffset = (nextRandom(random) * 2 - 1) * directDistance * config.randomness
    controlPoints.push({
      x: clamp(baseX + dirX * alongOffset + normalX * sideOffset, minX, maxX),
      y: clamp(baseY + dirY * alongOffset + normalY * sideOffset, minY, maxY),
    })
  }
  controlPoints.push(end)

  const samples: MotionPathSample[] = [{ point: { ...start }, distance: 0 }]
  let totalLength = 0
  let previous = start
  const subdivisions = 96

  for (let segment = 0; segment < controlPoints.length - 1; segment += 1) {
    const p0 = controlPoints[Math.max(0, segment - 1)]
    const p1 = controlPoints[segment]
    const p2 = controlPoints[segment + 1]
    const p3 = controlPoints[Math.min(controlPoints.length - 1, segment + 2)]
    for (let step = 1; step <= subdivisions; step += 1) {
      const raw = catmullRom(p0, p1, p2, p3, step / subdivisions)
      const point = {
        x: clamp(raw.x, minX, maxX),
        y: clamp(raw.y, minY, maxY),
      }
      totalLength += Math.hypot(point.x - previous.x, point.y - previous.y)
      samples.push({ point, distance: totalLength })
      previous = point
    }
  }

  return { seed, controlPoints, samples, totalLength }
}

export function createSampledMotionPath(
  points: readonly MotionPoint[],
  seed = 0,
): MotionPath {
  const controlPoints = points.map((point) => ({ ...point }))
  if (controlPoints.length === 0) {
    controlPoints.push({ x: 0, y: 0 })
  }

  const samples: MotionPathSample[] = [{ point: { ...controlPoints[0] }, distance: 0 }]
  let totalLength = 0
  for (let index = 1; index < controlPoints.length; index += 1) {
    const previous = controlPoints[index - 1]
    const point = controlPoints[index]
    totalLength += Math.hypot(point.x - previous.x, point.y - previous.y)
    samples.push({ point: { ...point }, distance: totalLength })
  }

  return { seed, controlPoints, samples, totalLength }
}

export function pointAtPathProgress(path: MotionPath, progress: number): MotionPoint {
  if (path.samples.length === 0 || path.totalLength <= 0) {
    return path.controlPoints[0] ?? { x: 0, y: 0 }
  }
  const target = clamp(progress, 0, 1) * path.totalLength
  let low = 0
  let high = path.samples.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) * 0.5)
    if (path.samples[mid].distance < target) low = mid + 1
    else high = mid
  }
  const upper = path.samples[low]
  const lower = path.samples[Math.max(0, low - 1)]
  const span = upper.distance - lower.distance
  const t = span > 0 ? (target - lower.distance) / span : 0
  return {
    x: lerp(lower.point.x, upper.point.x, t),
    y: lerp(lower.point.y, upper.point.y, t),
  }
}

/**
 * Returns the quadrilateral bounded by the two external common tangents of a
 * pair of circles. Filling it together with both circles produces a continuous
 * variable-radius capsule whose silhouette is tangent at every join.
 */
export function getCircleConnector(
  first: { point: MotionPoint; radius: number },
  second: { point: MotionPoint; radius: number },
): CircleConnector | null {
  const dx = second.point.x - first.point.x
  const dy = second.point.y - first.point.y
  const distance = Math.hypot(dx, dy)
  const radiusDelta = first.radius - second.radius

  if (distance <= Math.abs(radiusDelta) || distance <= 0.000001) return null

  const directionX = dx / distance
  const directionY = dy / distance
  const perpendicularX = -directionY
  const perpendicularY = directionX
  const alongNormal = radiusDelta / distance
  const acrossNormal = Math.sqrt(Math.max(0, 1 - alongNormal * alongNormal))
  const positiveNormal = {
    x: directionX * alongNormal + perpendicularX * acrossNormal,
    y: directionY * alongNormal + perpendicularY * acrossNormal,
  }
  const negativeNormal = {
    x: directionX * alongNormal - perpendicularX * acrossNormal,
    y: directionY * alongNormal - perpendicularY * acrossNormal,
  }

  return {
    firstPositive: {
      x: first.point.x + positiveNormal.x * first.radius,
      y: first.point.y + positiveNormal.y * first.radius,
    },
    secondPositive: {
      x: second.point.x + positiveNormal.x * second.radius,
      y: second.point.y + positiveNormal.y * second.radius,
    },
    secondNegative: {
      x: second.point.x + negativeNormal.x * second.radius,
      y: second.point.y + negativeNormal.y * second.radius,
    },
    firstNegative: {
      x: first.point.x + negativeNormal.x * first.radius,
      y: first.point.y + negativeNormal.y * first.radius,
    },
  }
}

export function getMotionTrailFrame(
  path: MotionPath,
  config: MotionTrailConfig,
  elapsedTime: number,
): MotionTrailFrame {
  const duration = Math.max(0.001, config.duration)
  const time = Math.max(0, elapsedTime)
  const progress = clamp(time / duration, 0, 1)
  const distanceProgress = bellDistanceProgress(progress)
  const mainRadius = config.finalRadius * smootherstep(progress)
  const mainPoint = pointAtPathProgress(path, distanceProgress)
  const trail: TrailCircle[] = []
  const spacing = Math.max(0.5, config.trailSpacing)
  const travelledDistance = path.totalLength * distanceProgress
  const stampCount = Math.floor(travelledDistance / spacing)

  for (let id = 1; id <= stampCount; id += 1) {
    const pathDistance = Math.min(path.totalLength, id * spacing)
    const stampDistanceProgress = path.totalLength > 0 ? pathDistance / path.totalLength : 0
    const birthProgress = inverseBellDistanceProgress(stampDistanceProgress)
    const birthTime = birthProgress * duration
    const emittedRadius = config.finalRadius * smootherstep(birthProgress)
    const radius = Math.max(0, emittedRadius - Math.max(0, config.shrinkRate) * (time - birthTime))
    if (radius <= 0) continue
    trail.push({
      id,
      point: pointAtPathProgress(path, stampDistanceProgress),
      radius,
      emittedRadius,
      birthTime,
    })
  }

  return {
    progress,
    distanceProgress,
    speed: path.totalLength * bellSpeed(progress) / duration,
    main: { point: mainPoint, radius: mainRadius },
    trail,
  }
}
