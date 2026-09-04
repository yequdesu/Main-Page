import type { LayoutBox, Point2 } from '../composition/coordinate'
import { bellDistanceProgress, smootherstep } from './motionTrail'

export type ScreenEdge = 'top' | 'right' | 'bottom' | 'left'

export interface AbsorptionTrailSpec {
  id: number
  side: ScreenEdge
  edgePosition: number
  targetOffsetX: number
  targetOffsetY: number
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

export const ABSORPTION_TRAIL_START = 0.46
export const ABSORPTION_TRAIL_END = 0.50
export const ABSORPTION_TRAIL_COUNT = 14

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

/** Fixed-seed randomness keeps the screen-edge arrivals reversible while scrolling. */
export function buildAbsorptionTrailSpecs(
  count = ABSORPTION_TRAIL_COUNT,
  seed = 0x51a7c3e1,
): AbsorptionTrailSpec[] {
  const safeCount = Math.max(1, Math.round(count))
  const random = { value: seed || 0x51a7c3e1 }
  const sides: ScreenEdge[] = ['top', 'right', 'bottom', 'left']
  const firstArrival = 0.473
  const lastArrival = ABSORPTION_TRAIL_END - 0.00035

  return Array.from({ length: safeCount }, (_, id) => {
    const arrivalT = safeCount === 1 ? 1 : id / (safeCount - 1)
    const end = lerp(firstArrival, lastArrival, arrivalT)
    const duration = 0.0095 + nextRandom(random) * 0.0035
    return {
      id,
      side: sides[(id + Math.floor(nextRandom(random) * sides.length)) % sides.length],
      edgePosition: 0.07 + nextRandom(random) * 0.86,
      targetOffsetX: nextRandom(random) * 1.1 - 0.55,
      targetOffsetY: nextRandom(random) * 1.1 - 0.55,
      start: Math.max(ABSORPTION_TRAIL_START, end - duration),
      end,
      radius: 1.8 + nextRandom(random) * 2.2,
      tailLength: 0.075 + nextRandom(random) * 0.055,
      tailSamples: 8 + Math.floor(nextRandom(random) * 5),
    }
  })
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
  spec: AbsorptionTrailSpec,
  spawn: Point2,
  box: LayoutBox,
): Point2 {
  const aim = {
    x: box.x + box.width * (0.5 + spec.targetOffsetX * 0.5),
    y: box.y + box.height * (0.5 + spec.targetOffsetY * 0.5),
  }
  const dx = aim.x - spawn.x
  const dy = aim.y - spawn.y
  let t = 1
  if (spec.side === 'left') t = dx !== 0 ? (box.x - spawn.x) / dx : 1
  else if (spec.side === 'right') t = dx !== 0 ? (box.x + box.width - spawn.x) / dx : 1
  else if (spec.side === 'top') t = dy !== 0 ? (box.y - spawn.y) / dy : 1
  else t = dy !== 0 ? (box.y + box.height - spawn.y) / dy : 1
  return {
    x: lerp(spawn.x, aim.x, clamp(t, 0, 1)),
    y: lerp(spawn.y, aim.y, clamp(t, 0, 1)),
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
  const target = getTargetPoint(spec, start, targetBox)
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
