import type { Act3ContourTarget } from '../composition/coreAnchors'
import { TIMELINE, clamp01, progress, smoothProgress } from '../composition/timeline'
import { SQUARE_WAVE_SPACING, type SquareWaveSprite } from './squareWaveTransition'
import {
  createSampledMotionPath,
  getMotionTrailFrame,
  pointAtPathProgress,
  type MotionPath,
  type MotionTrailConfig,
  type MotionTrailFrame,
} from './motionTrail'

export const SQUARE_TITLE = 'Ēarendel'
export const SQUARE_TITLE_FONT_SCALE = 0.85
export const SQUARE_WAVE_HANDOFF_RADIUS_RATIO = 0.38
export const SQUARE_WAVE_HANDOFF_RADIUS_CELLS = 400
export const PLANET_FLIGHT_TIMINGS = [
  { start: 0.700, end: 0.784, seed: 0xea7e1001 },
  { start: 0.708, end: 0.792, seed: 0xea7e1002 },
  { start: 0.716, end: 0.800, seed: 0xea7e1003 },
] as const
export const PLANET_FLIGHT_LAUNCH_ANGLES = [
  -Math.PI * 0.5,
  -Math.PI * 0.5 + Math.PI * 2 / 3,
  -Math.PI * 0.5 + Math.PI * 4 / 3,
] as const
export const ORBIT_TRACE_TIMINGS = Array.from({ length: 6 }, (_, index) => ({
  start: 0.725 + index * 0.007,
  end: 0.765 + index * 0.007,
  seed: 0xea7e2001 + index,
}))
const PLANET_FLIGHT_ORBIT_ARC = Math.PI * 1.35
const PLANET_FLIGHT_ORBIT_FRACTION = 0.52
const PLANET_FLIGHT_PATH_SAMPLES = 384

export interface ContourPoint {
  /** Position in the fixed square-wave logical coordinate system. */
  x: number
  y: number
  opacity: number
  source: 'central'
}

export interface PlanetFlightTarget {
  trackIdx: number
  x: number
  y: number
  radius: number
}

export interface PlanetFlightPlan {
  trackIdx: number
  path: MotionPath
  config: MotionTrailConfig
}

export interface OrbitTracePlan {
  orbitIdx: number
  path: MotionPath
  orbitPath: MotionPath
  orbitStartDistance: number
  config: MotionTrailConfig
}

export interface SquareWaveCanvasTransform {
  generation: number
  zoom: number
  logicalSquareSize: number
  logicalSpacing: number
  screenRadius: number
}

export interface SquareContourLayout {
  centralX: number
  centralY: number
  initialCenterX: number
  initialCenterY: number
  handoffZoom: number
  terminalZoom: number
  logicalSquareSize: number
  logicalSpacing: number
  logicalCentralRadius: number
  centralSquares: ContourPoint[]
  planetTargets: PlanetFlightTarget[]
  orbitTargets: Array<Array<{ x: number; y: number }>>
}

export interface SquareContourTransform {
  focusX: number
  focusY: number
  zoom: number
  squareSize: number
  titleScale: number
}

export interface SquareContourTransitionFrame {
  active: boolean
  typedText: string
  titleFontPx: number
  titleAlpha: number
  contourAlpha: number
  zoomProgress: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function expLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / Math.max(0.0001, a), t)
}

function cubicBezier(
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const inverse = 1 - t
  const inverse2 = inverse * inverse
  const t2 = t * t
  return {
    x: inverse2 * inverse * start.x +
      3 * inverse2 * t * control1.x +
      3 * inverse * t2 * control2.x +
      t2 * t * end.x,
    y: inverse2 * inverse * start.y +
      3 * inverse2 * t * control1.y +
      3 * inverse * t2 * control2.y +
      t2 * t * end.y,
  }
}

export function smootherstep01(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Integral of a sin² velocity profile. Velocity is zero at both ends, peaks
 * once at the midpoint, then converges continuously to the handoff radius.
 */
export function getSquareWaveExpansionProgress(value: number): number {
  const t = clamp01(value)
  return t - Math.sin(Math.PI * 2 * t) / (Math.PI * 2)
}

export function getSquareTypedText(scrollProgress: number): string {
  const p = progress('squareTitleTyping', scrollProgress)
  if (p <= 0) return '*'
  const count = Math.min(SQUARE_TITLE.length, Math.max(1, Math.ceil(p * SQUARE_TITLE.length)))
  return SQUARE_TITLE.slice(0, count)
}

export function getSquareContourTransitionFrame(
  scrollProgress: number,
  viewportWidth: number,
  viewportHeight: number,
): SquareContourTransitionFrame {
  const initialFont = Math.max(72, Math.min(240, viewportWidth * 0.16, viewportHeight * 0.22)) *
    SQUARE_TITLE_FONT_SCALE
  const titleVisible = scrollProgress >= TIMELINE.squareTitleTyping.start &&
    scrollProgress < TIMELINE.squareTitleFade.end
  const contourAlpha = 1 - smoothProgress('squareAct3Crossfade', scrollProgress)
  return {
    active: scrollProgress >= TIMELINE.act2SquareTransition.start &&
      scrollProgress < TIMELINE.act2SquareTransition.end,
    typedText: getSquareTypedText(scrollProgress),
    titleFontPx: initialFont,
    titleAlpha: titleVisible ? 1 - smoothProgress('squareTitleFade', scrollProgress) : 0,
    contourAlpha,
    zoomProgress: progress('squareContourZoom', scrollProgress),
  }
}

export function getSquareWaveHandoffGeneration(): number {
  return SQUARE_WAVE_HANDOFF_RADIUS_CELLS
}

/**
 * Squares and their 1.1-cell spacing stay fixed in logical coordinates. Only
 * the view zoom changes while the front grows from radius 0 to radius 400.
 */
export function getSquareWaveCanvasTransform(
  waveProgress: number,
  viewportWidth: number,
  viewportHeight: number,
  logicalSquareSize: number,
): SquareWaveCanvasTransform {
  const t = getSquareWaveExpansionProgress(waveProgress)
  const generation = SQUARE_WAVE_HANDOFF_RADIUS_CELLS * t
  const logicalSpacing = logicalSquareSize * SQUARE_WAVE_SPACING
  const handoffLogicalRadius =
    SQUARE_WAVE_HANDOFF_RADIUS_CELLS * logicalSpacing + logicalSquareSize * 0.5
  const targetScreenRadius =
    Math.min(viewportWidth, viewportHeight) * SQUARE_WAVE_HANDOFF_RADIUS_RATIO
  const handoffZoom = Math.min(1, targetScreenRadius / Math.max(1, handoffLogicalRadius))

  // Reciprocal interpolation keeps the visible radius monotonic while the view
  // continuously pulls back, landing exactly on handoffZoom at generation 400.
  const zoom = 1 / lerp(1, 1 / Math.max(0.000001, handoffZoom), t)
  const logicalRadius = generation * logicalSpacing + logicalSquareSize * 0.5
  return {
    generation,
    zoom,
    logicalSquareSize,
    logicalSpacing,
    screenRadius: logicalRadius * zoom,
  }
}

export function buildSquareContourLayout(
  target: Act3ContourTarget,
  frozenWave: readonly SquareWaveSprite[],
  initialCenterX: number,
  initialCenterY: number,
  logicalSpacing: number,
  logicalSquareSize: number,
  handoffZoom: number,
): SquareContourLayout {
  const logicalCentralRadius = frozenWave.reduce(
    (max, sprite) => Math.max(
      max,
      Math.hypot(sprite.x, sprite.y) * logicalSpacing + logicalSquareSize * 0.5,
    ),
    logicalSquareSize,
  )
  const terminalZoom = Math.max(0.000001, target.central.r / logicalCentralRadius)

  const centralSquares: ContourPoint[] = frozenWave.map((sprite) => ({
    x: sprite.x * logicalSpacing,
    y: sprite.y * logicalSpacing,
    opacity: sprite.opacity,
    source: 'central',
  }))

  const planetTargets = target.planets.flatMap((planet, trackIdx) => {
    if (!planet.visible) return []
    return [{
      trackIdx,
      x: (planet.x - target.central.x) / terminalZoom,
      y: (planet.y - target.central.y) / terminalZoom,
      radius: planet.r / terminalZoom,
    }]
  })
  const orbitTargets = target.orbits.map((orbit) => orbit.points.map((point) => ({
    x: (point.x - target.central.x) / terminalZoom,
    y: (point.y - target.central.y) / terminalZoom,
  })))

  return {
    centralX: target.central.x,
    centralY: target.central.y,
    initialCenterX,
    initialCenterY,
    handoffZoom,
    terminalZoom,
    logicalSquareSize,
    logicalSpacing,
    logicalCentralRadius,
    centralSquares,
    planetTargets,
    orbitTargets,
  }
}

function rotateClosedPathToIndex(
  points: readonly { x: number; y: number }[],
  startIndex: number,
): Array<{ x: number; y: number }> {
  if (points.length === 0) return []
  const unique = [...points]
  if (unique.length > 1) {
    const first = unique[0]
    const last = unique[unique.length - 1]
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.000001) unique.pop()
  }
  const offset = Math.max(0, Math.min(unique.length - 1, startIndex))
  const rotated = [...unique.slice(offset), ...unique.slice(0, offset)]
  if (rotated.length > 0) rotated.push({ ...rotated[0] })
  return rotated
}

export function buildOrbitTracePlans(layout: SquareContourLayout): OrbitTracePlan[] {
  return layout.orbitTargets.map((orbit, orbitIdx) => {
    const timing = ORBIT_TRACE_TIMINGS[orbitIdx] ?? ORBIT_TRACE_TIMINGS[0]
    const launchAngle = -Math.PI * 0.5 + orbitIdx * Math.PI * 2 / 6
    const direction = { x: Math.cos(launchAngle), y: Math.sin(launchAngle) }
    let startIndex = 0
    let greatestProjection = Number.NEGATIVE_INFINITY
    orbit.forEach((point, index) => {
      const projection = point.x * direction.x + point.y * direction.y
      if (projection > greatestProjection) {
        greatestProjection = projection
        startIndex = index
      }
    })
    const orderedOrbit = rotateClosedPathToIndex(orbit, startIndex)
    const orbitStart = orderedOrbit[0] ?? {
      x: direction.x * layout.logicalCentralRadius * 2,
      y: direction.y * layout.logicalCentralRadius * 2,
    }
    const orbitNext = orderedOrbit[1] ?? orbitStart
    const tangentLength = Math.max(0.000001, Math.hypot(
      orbitNext.x - orbitStart.x,
      orbitNext.y - orbitStart.y,
    ))
    const tangent = {
      x: (orbitNext.x - orbitStart.x) / tangentLength,
      y: (orbitNext.y - orbitStart.y) / tangentLength,
    }
    const launchPoint = {
      x: direction.x * layout.logicalCentralRadius,
      y: direction.y * layout.logicalCentralRadius,
    }
    const approachDistance = Math.max(1, Math.hypot(
      orbitStart.x - launchPoint.x,
      orbitStart.y - launchPoint.y,
    ))
    const control1 = {
      x: launchPoint.x + direction.x * approachDistance * 0.32,
      y: launchPoint.y + direction.y * approachDistance * 0.32,
    }
    const control2 = {
      x: orbitStart.x - tangent.x * approachDistance * 0.28,
      y: orbitStart.y - tangent.y * approachDistance * 0.28,
    }
    const approachSampleCount = 64
    const approach = Array.from({ length: approachSampleCount + 1 }, (_, index) =>
      cubicBezier(
        launchPoint,
        control1,
        control2,
        orbitStart,
        index / approachSampleCount,
      ))
    const path = createSampledMotionPath([
      ...approach,
      ...orderedOrbit.slice(1),
    ], timing.seed)
    const orbitPath = createSampledMotionPath(orderedOrbit, timing.seed)
    const finalRadius = 0.72 / Math.max(0.000001, layout.terminalZoom)
    const config: MotionTrailConfig = {
      width: layout.centralX * 2,
      height: layout.centralY * 2,
      duration: 1,
      finalRadius,
      trailSpacing: Math.max(0.5, 1.4 / Math.max(0.000001, layout.handoffZoom)),
      shrinkRate: finalRadius * 3.2,
      waypointCount: 0,
      randomness: 0,
    }
    return {
      orbitIdx,
      path,
      orbitPath,
      orbitStartDistance: path.samples[approachSampleCount]?.distance ?? 0,
      config,
    }
  })
}

export function getOrbitTraceElapsed(scrollProgress: number, orbitIdx: number): number {
  const timing = ORBIT_TRACE_TIMINGS[orbitIdx] ?? ORBIT_TRACE_TIMINGS[0]
  return Math.max(0, (scrollProgress - timing.start) / (timing.end - timing.start))
}

export function getOrbitTraceRenderFrames(
  plan: OrbitTracePlan,
  scrollProgress: number,
  currentZoom: number,
  terminalZoom: number,
): { flight: MotionTrailFrame; ink: MotionTrailFrame | null } {
  const elapsed = getOrbitTraceElapsed(scrollProgress, plan.orbitIdx)
  // Persistent orbit ink covers the same path with circles at least as large
  // as the ephemeral flight trail. Keep only the visible approach history.
  const flight = getMotionTrailFrame(
    plan.path,
    plan.config,
    elapsed,
    plan.orbitStartDistance,
  )
  const radiusScale = terminalZoom / Math.max(0.000001, currentZoom)
  flight.main.radius *= radiusScale
  for (const circle of flight.trail) {
    circle.radius *= radiusScale
    circle.emittedRadius *= radiusScale
  }

  const travelledDistance = plan.path.totalLength * flight.distanceProgress
  if (travelledDistance <= plan.orbitStartDistance || plan.orbitPath.totalLength <= 0) {
    return { flight, ink: null }
  }
  const inkProgress = clamp01(
    (travelledDistance - plan.orbitStartDistance) /
    Math.max(0.000001, plan.path.totalLength - plan.orbitStartDistance),
  )
  const samples = plan.orbitPath.samples
  const targetDistance = plan.orbitPath.totalLength * inkProgress
  let lastIndex = 0
  while (lastIndex + 1 < samples.length && samples[lastIndex + 1].distance <= targetDistance) {
    lastIndex += 1
  }
  const radius = plan.config.finalRadius * radiusScale
  const trail = samples.slice(0, lastIndex + 1).map((sample, index) => ({
    id: index,
    point: sample.point,
    radius,
    emittedRadius: radius,
    birthTime: 0,
  }))
  const mainPoint = pointAtPathProgress(plan.orbitPath, inkProgress)
  return {
    flight,
    ink: {
      progress: inkProgress,
      distanceProgress: inkProgress,
      speed: 0,
      main: { point: mainPoint, radius },
      trail,
    },
  }
}

export function buildPlanetFlightPlans(layout: SquareContourLayout): PlanetFlightPlan[] {
  return layout.planetTargets.map((target) => {
    const timing = PLANET_FLIGHT_TIMINGS[target.trackIdx] ?? PLANET_FLIGHT_TIMINGS[0]
    const launchAngle = PLANET_FLIGHT_LAUNCH_ANGLES[target.trackIdx] ?? PLANET_FLIGHT_LAUNCH_ANGLES[0]
    const launchRadius = layout.logicalCentralRadius
    const exitAngle = launchAngle + PLANET_FLIGHT_ORBIT_ARC
    const exitRadius = launchRadius * 1.65
    const exitPoint = {
      x: Math.cos(exitAngle) * exitRadius,
      y: Math.sin(exitAngle) * exitRadius,
    }
    const targetDistance = Math.max(1, Math.hypot(target.x - exitPoint.x, target.y - exitPoint.y))
    const exitTangent = { x: -Math.sin(exitAngle), y: Math.cos(exitAngle) }
    const targetRadialLength = Math.max(1, Math.hypot(target.x, target.y))
    const targetRadial = {
      x: target.x / targetRadialLength,
      y: target.y / targetRadialLength,
    }
    const exitHandleLength = targetDistance * 0.36
    const arrivalHandleLength = targetDistance * 0.28
    const exitControl = {
      x: exitPoint.x + exitTangent.x * exitHandleLength,
      y: exitPoint.y + exitTangent.y * exitHandleLength,
    }
    const arrivalControl = {
      x: target.x - targetRadial.x * arrivalHandleLength,
      y: target.y - targetRadial.y * arrivalHandleLength,
    }
    const points = Array.from({ length: PLANET_FLIGHT_PATH_SAMPLES + 1 }, (_, index) => {
      const u = index / PLANET_FLIGHT_PATH_SAMPLES
      if (u <= PLANET_FLIGHT_ORBIT_FRACTION) {
        const orbitProgress = u / PLANET_FLIGHT_ORBIT_FRACTION
        const angle = launchAngle + PLANET_FLIGHT_ORBIT_ARC * orbitProgress
        const radius = lerp(
          launchRadius,
          exitRadius,
          smootherstep01(orbitProgress),
        )
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        }
      }

      const settleProgress = (u - PLANET_FLIGHT_ORBIT_FRACTION) /
        (1 - PLANET_FLIGHT_ORBIT_FRACTION)
      return cubicBezier(
        exitPoint,
        exitControl,
        arrivalControl,
        target,
        settleProgress,
      )
    })
    const config: MotionTrailConfig = {
      width: layout.centralX * 2,
      height: layout.centralY * 2,
      duration: 1,
      finalRadius: target.radius,
      // Keep samples at most three CSS pixels apart at the widest transition
      // view. As the canvas pulls back they only become denser, so the
      // variable-radius connectors cannot collapse into visible chords.
      trailSpacing: Math.max(0.5, 3 / Math.max(0.000001, layout.handoffZoom)),
      shrinkRate: target.radius * (8 / 3),
      waypointCount: 0,
      randomness: 0,
    }
    return {
      trackIdx: target.trackIdx,
      path: createSampledMotionPath(points, timing.seed),
      config,
    }
  })
}

export function getPlanetFlightElapsed(scrollProgress: number, trackIdx: number): number {
  const timing = PLANET_FLIGHT_TIMINGS[trackIdx] ?? PLANET_FLIGHT_TIMINGS[0]
  return Math.max(0, (scrollProgress - timing.start) / (timing.end - timing.start))
}

export function getPlanetFlightFrame(
  plan: PlanetFlightPlan,
  scrollProgress: number,
): MotionTrailFrame {
  return getMotionTrailFrame(
    plan.path,
    plan.config,
    getPlanetFlightElapsed(scrollProgress, plan.trackIdx),
  )
}

/**
 * Planet radii are authored for the terminal Act 3 projection. Compensating
 * them by the current canvas zoom prevents them from ballooning while the
 * logical viewport is still much closer to the central contour.
 */
export function getPlanetFlightRenderFrame(
  plan: PlanetFlightPlan,
  scrollProgress: number,
  currentZoom: number,
  terminalZoom: number,
): MotionTrailFrame {
  const frame = getPlanetFlightFrame(plan, scrollProgress)
  const radiusScale = terminalZoom / Math.max(0.000001, currentZoom)
  frame.main.radius *= radiusScale
  for (const circle of frame.trail) {
    circle.radius *= radiusScale
    circle.emittedRadius *= radiusScale
  }
  return frame
}

export function getSquareContourTransform(
  layout: SquareContourLayout,
  zoomProgress: number,
): SquareContourTransform {
  const t = smootherstep01(zoomProgress)
  const zoom = expLerp(layout.handoffZoom, layout.terminalZoom, t)
  return {
    focusX: lerp(layout.initialCenterX, layout.centralX, t),
    focusY: lerp(layout.initialCenterY, layout.centralY, t),
    zoom,
    squareSize: layout.logicalSquareSize * zoom,
    titleScale: zoom / layout.handoffZoom,
  }
}

export function projectContourPoint(
  point: Pick<ContourPoint, 'x' | 'y'>,
  _layout: SquareContourLayout,
  transform: SquareContourTransform,
): { x: number; y: number } {
  return {
    x: transform.focusX + point.x * transform.zoom,
    y: transform.focusY + point.y * transform.zoom,
  }
}

export function projectPlanetFlightCircle(
  circle: { point: { x: number; y: number }; radius: number },
  transform: SquareContourTransform,
): { x: number; y: number; radius: number } {
  return {
    x: transform.focusX + circle.point.x * transform.zoom,
    y: transform.focusY + circle.point.y * transform.zoom,
    radius: circle.radius * transform.zoom,
  }
}
