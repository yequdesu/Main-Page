import type { LayoutBox, Point2 } from '../composition/coordinate'
import {
  bellDistanceProgress,
  smootherstep,
} from './motionTrail'

export type ScreenEdge = 'top' | 'right' | 'bottom' | 'left'

export interface AbsorptionTrailSpec {
  id: number
  side: ScreenEdge
  edgePosition: number
  start: number
  end: number
  radius: number
  tailLength: number
  tailSamples: number
}

export interface AbsorptionCircle {
  point: Point2
  radius: number
}

export interface AbsorptionTrailFrame {
  active: boolean
  progress: number
  start: Point2
  target: Point2
  circles: AbsorptionCircle[]
}

export interface AbsorptionTrailBatch {
  seed: number
  finalArrival: number
  specs: AbsorptionTrailSpec[]
}

export const ABSORPTION_TRAIL_START = 0.46
export const ABSORPTION_TRAIL_END = 0.57
export const ABSORPTION_TRAIL_COUNT = 160
export const ABSORPTION_FINAL_ARRIVAL_MIN = 0.56
export const ABSORPTION_FINAL_ARRIVAL_MAX = 0.57

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

/** Normalized event density: sparse at both ends and densest at the midpoint. */
export function getAbsorptionSpawnDensity(phase: number): number {
  const t = clamp(phase, 0, 1)
  const wave = Math.sin(Math.PI * t)
  return wave * wave
}

/**
 * A supplied seed keeps one generated batch reversible. The runtime chooses a
 * fresh seed on each page load, while tests and replay can inject a known seed.
 */
export function buildAbsorptionTrailSpecs(
  count = ABSORPTION_TRAIL_COUNT,
  seed = 0x51a7c3e1,
  finalArrival = 0.568,
): AbsorptionTrailSpec[] {
  const safeCount = Math.max(1, Math.round(count))
  const random = { value: seed || 0x51a7c3e1 }
  const sides: ScreenEdge[] = ['top', 'right', 'bottom', 'left']
  const firstArrival = 0.472
  const lastArrival = clamp(
    finalArrival,
    ABSORPTION_FINAL_ARRIVAL_MIN,
    ABSORPTION_FINAL_ARRIVAL_MAX - 0.000001,
  )
  const arrivalPhases: number[] = []
  if (safeCount === 1) {
    arrivalPhases.push(1)
  } else {
    // Rejection sampling makes this function the literal spawn-count envelope:
    // few accepted events near 0/1, many around 0.5.
    arrivalPhases.push(0)
    while (arrivalPhases.length < safeCount - 1) {
      const candidate = nextRandom(random)
      if (nextRandom(random) <= getAbsorptionSpawnDensity(candidate)) {
        arrivalPhases.push(candidate)
      }
    }
    arrivalPhases.sort((a, b) => a - b)
    arrivalPhases.push(1)
  }

  return Array.from({ length: safeCount }, (_, id) => {
    const arrivalT = arrivalPhases[id]
    const end = lerp(firstArrival, lastArrival, arrivalT)
    const duration = 0.0055 + nextRandom(random) * 0.0115
    return {
      id,
      side: sides[Math.floor(nextRandom(random) * sides.length)],
      edgePosition: 0.035 + nextRandom(random) * 0.93,
      start: Math.max(ABSORPTION_TRAIL_START, end - duration),
      end,
      radius: 1.15 + nextRandom(random) * 4.1,
      tailLength: 0.045 + nextRandom(random) * 0.105,
      tailSamples: 7 + Math.floor(nextRandom(random) * 7),
    }
  })
}

export function buildRandomAbsorptionTrailBatch(seed: number): AbsorptionTrailBatch {
  const random = { value: seed || 0x51a7c3e1 }
  const count = 128 + Math.floor(nextRandom(random) * 65)
  const finalArrival = ABSORPTION_FINAL_ARRIVAL_MIN +
    nextRandom(random) * (ABSORPTION_FINAL_ARRIVAL_MAX - ABSORPTION_FINAL_ARRIVAL_MIN)
  return {
    seed,
    finalArrival,
    specs: buildAbsorptionTrailSpecs(count, random.value, finalArrival),
  }
}

function getSpawnPoint(
  spec: AbsorptionTrailSpec,
  width: number,
  height: number,
): Point2 {
  const margin = Math.max(28, Math.min(width, height) * 0.045)
  if (spec.side === 'top') return { x: width * spec.edgePosition, y: -margin }
  if (spec.side === 'right') return { x: width + margin, y: height * spec.edgePosition }
  if (spec.side === 'bottom') return { x: width * spec.edgePosition, y: height + margin }
  return { x: -margin, y: height * spec.edgePosition }
}

function getVisibleTargetBox(box: LayoutBox, width: number, height: number): LayoutBox {
  const minX = clamp(box.x, 1, width - 1)
  const minY = clamp(box.y, 1, height - 1)
  const maxX = clamp(box.x + box.width, 1, width - 1)
  const maxY = clamp(box.y + box.height, 1, height - 1)
  if (maxX > minX + 1 && maxY > minY + 1) {
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }
  const centerX = clamp(box.x + box.width * 0.5, 2, width - 2)
  const centerY = clamp(box.y + box.height * 0.5, 2, height - 2)
  return { x: centerX - 1, y: centerY - 1, width: 2, height: 2 }
}

function getTargetPoint(
  box: LayoutBox,
): Point2 {
  return {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5,
  }
}

export function getAbsorptionTrailFrame(
  spec: AbsorptionTrailSpec,
  scrollProgress: number,
  width: number,
  height: number,
  cubeBounds: LayoutBox,
): AbsorptionTrailFrame {
  const start = getSpawnPoint(spec, width, height)
  const targetBox = getVisibleTargetBox(cubeBounds, width, height)
  const target = getTargetPoint(targetBox)
  const duration = Math.max(0.000001, spec.end - spec.start)
  const local = clamp((scrollProgress - spec.start) / duration, 0, 1)

  if (scrollProgress < spec.start || scrollProgress >= spec.end) {
    return { active: false, progress: local, start, target, circles: [] }
  }

  // The head reaches the frame slightly before the end; the remaining interval
  // collapses every trail sample into the contact point and shrinks it to zero.
  const travelLocal = clamp(local / 0.86, 0, 1)
  const distance = bellDistanceProgress(travelLocal)
  const collapse = smootherstep(clamp((local - 0.78) / 0.22, 0, 1))
  const growth = smootherstep(clamp(local / 0.16, 0, 1))
  const radiusScale = growth * (1 - collapse)
  const availableTail = Math.min(spec.tailLength, distance)
  const tailSpan = availableTail * (1 - collapse)
  const circles: AbsorptionCircle[] = []

  for (let sample = spec.tailSamples; sample >= 0; sample -= 1) {
    const behind = sample / Math.max(1, spec.tailSamples)
    const sampleDistance = Math.max(0, distance - tailSpan * behind)
    const taper = 1 - behind * 0.86
    circles.push({
      point: {
        x: lerp(start.x, target.x, sampleDistance),
        y: lerp(start.y, target.y, sampleDistance),
      },
      radius: spec.radius * radiusScale * taper,
    })
  }

  return { active: true, progress: local, start, target, circles }
}
