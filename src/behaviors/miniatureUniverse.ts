import { SCROLL_RIG } from '../types'

export const MINIATURE_CUBE_SIZE = 64
export const MINIATURE_CUBE_HALF_SIZE = MINIATURE_CUBE_SIZE / 2
export const MINIATURE_PIVOT = [0, -0.65, -24] as const
export const MINIATURE_TILT = [-0.10, 0.42, 0.025] as const

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

function rangeProgress(value: number, start: number, end: number): number {
  return clamp01((value - start) / (end - start))
}

export interface MiniatureTransform {
  progress: number
  containment: number
  scale: number
  rotation: readonly [number, number, number]
  wireOpacity: number
}

export function getMiniatureTransform(scrollProgress: number): MiniatureTransform {
  const progress = rangeProgress(
    scrollProgress,
    SCROLL_RIG.MINIATURE_START,
    SCROLL_RIG.MINIATURE_END,
  )
  const containment = smoothstep01(rangeProgress(scrollProgress, SCROLL_RIG.MINIATURE_START, 0.49))
  const rotationProgress = smoothstep01(progress)
  const fadeIn = smoothstep01(rangeProgress(scrollProgress, 0.41, 0.45))
  const fadeOut = smoothstep01(rangeProgress(scrollProgress, 0.585, SCROLL_RIG.MINIATURE_END))

  return {
    progress,
    containment,
    scale: Math.pow(10, -3 * progress * progress),
    rotation: rotationProgress === 0
      ? [0, 0, 0]
      : [
          MINIATURE_TILT[0] * rotationProgress,
          MINIATURE_TILT[1] * rotationProgress,
          MINIATURE_TILT[2] * rotationProgress,
        ],
    wireOpacity: fadeIn * (1 - fadeOut),
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
