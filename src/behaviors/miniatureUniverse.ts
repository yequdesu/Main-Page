import { SCROLL_RIG } from '../types'

export const MINIATURE_CUBE_SIZE = 64
export const MINIATURE_CUBE_HALF_SIZE = MINIATURE_CUBE_SIZE / 2
export const MINIATURE_PIVOT = [0, -0.65, -24] as const
export const MINIATURE_TILT = [-0.10, 0.42, 0.025] as const
export const MINIATURE_TUMBLE_TURNS = [0.06, 0.32, 0.045] as const

const OCEAN_UNCHANGED_HALF_WIDTH = 28
const OCEAN_CONTAINED_HALF_WIDTH = 31.5
const OCEAN_SOFT_CAP_DISTANCE = 8

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep01(value: number): number {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function smootherstep01(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function rangeProgress(value: number, start: number, end: number): number {
  return clamp01((value - start) / (end - start))
}

export interface MiniatureTransform {
  progress: number
  containment: number
  scale: number
  rotation: readonly [number, number, number]
  wireOpacity: number
  wireDrawProgress: number
  whiteFillProgress: number
  faceAlignProgress: number
  canvasHandoffProgress: number
}

export function getMiniatureTransform(scrollProgress: number): MiniatureTransform {
  const miniatureScroll = Math.min(scrollProgress, SCROLL_RIG.MINIATURE_END)
  const progress = rangeProgress(
    miniatureScroll,
    SCROLL_RIG.MINIATURE_START,
    SCROLL_RIG.SQUARE_TRANSITION_END,
  )
  const containment = smoothstep01(rangeProgress(miniatureScroll, SCROLL_RIG.MINIATURE_START, 0.49))
  const tumbleProgress = smootherstep01(rangeProgress(miniatureScroll, 0.40, 0.50))
  const whiteFillProgress = smoothstep01(rangeProgress(miniatureScroll, 0.50, 0.55))
  const canvasHandoffProgress = smoothstep01(rangeProgress(scrollProgress, 0.55, 0.56))
  const acceleratedShrink = Math.pow(rangeProgress(miniatureScroll, 0.40, 0.55), 0.68)
  const finalScaleExponent = -3 * 0.75 * 0.75
  const tau = Math.PI * 2

  return {
    progress,
    containment,
    scale: Math.pow(10, finalScaleExponent * acceleratedShrink),
    rotation: tumbleProgress === 0
      ? [0, 0, 0]
      : [
          tau * MINIATURE_TUMBLE_TURNS[0] * tumbleProgress,
          tau * MINIATURE_TUMBLE_TURNS[1] * tumbleProgress,
          tau * MINIATURE_TUMBLE_TURNS[2] * tumbleProgress,
        ],
    wireOpacity: scrollProgress >= 0.40 && scrollProgress <= 0.55 ? 1 : 0,
    wireDrawProgress: smoothstep01(rangeProgress(scrollProgress, 0.40, 0.50)),
    whiteFillProgress,
    faceAlignProgress: whiteFillProgress,
    canvasHandoffProgress,
  }
}

export function containOceanX(x: number, containment: number): number {
  const amount = clamp01(containment)
  const absX = Math.abs(x)
  if (absX <= OCEAN_UNCHANGED_HALF_WIDTH || amount <= 0) return x

  const cappedMagnitude = OCEAN_UNCHANGED_HALF_WIDTH +
    (OCEAN_CONTAINED_HALF_WIDTH - OCEAN_UNCHANGED_HALF_WIDTH) *
      (1 - Math.exp(-(absX - OCEAN_UNCHANGED_HALF_WIDTH) / OCEAN_SOFT_CAP_DISTANCE))
  const containedX = Math.sign(x) * cappedMagnitude
  return x + (containedX - x) * amount
}

export function getContainedBeamDepthScale(containment: number): number {
  return 1 + (0.42 - 1) * clamp01(containment)
}
