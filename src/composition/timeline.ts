import { SCROLL_RIG } from '../types'

export type TimelineDirection = 'forward' | 'backward' | 'still'

export interface TimelineRange {
  id: string
  start: number
  end: number
  reversible: boolean
  description?: string
}

function defineRange(
  id: string,
  start: number,
  end: number,
  description?: string,
  reversible = true,
): TimelineRange {
  if (end < start) {
    throw new Error(`Invalid timeline range "${id}": end must be >= start`)
  }
  return { id, start, end, reversible, description }
}

export const TIMELINE = {
  act1OceanVoyage: defineRange('act1OceanVoyage', 0, SCROLL_RIG.MINIATURE_END, 'Act 1 ocean voyage and miniature-universe exit'),
  act2SquareTransition: defineRange('act2SquareTransition', SCROLL_RIG.MINIATURE_END, SCROLL_RIG.ACT3_START, 'Act 2 square-contour terminal-layout transition'),
  act3ContentPhase: defineRange('act3ContentPhase', SCROLL_RIG.ACT3_START, 1.0, 'Act 3 content macro phase'),
  miniatureShrink: defineRange(
    'miniatureShrink',
    SCROLL_RIG.MINIATURE_START,
    SCROLL_RIG.MINIATURE_END,
    'Act 1 scene continuously shrinks into a framed miniature universe',
  ),
  cubeDrawAndTumble: defineRange('cubeDrawAndTumble', 0.40, 0.50, 'Cube edges draw while the miniature tumbles on three axes'),
  cubeWhiteFill: defineRange('cubeWhiteFill', 0.50, 0.55, 'Cube settles face-on and fills to pure white'),
  squareSeedShrink: defineRange('squareSeedShrink', 0.55, 0.56, 'Screen-space square takes over and shrinks slightly'),
  squareBfsWave: defineRange('squareBfsWave', 0.56, 0.70, 'Deterministic square wave expands to its 400-cell handoff radius'),
  squareTitleTyping: defineRange('squareTitleTyping', 0.58, 0.64, 'Centered bracket title types Earendel'),
  squareContourZoom: defineRange('squareContourZoom', 0.70, 0.80, 'Frozen square contour canvas zooms out to the Act 3 terminal framing'),
  squarePlanetContourReveal: defineRange('squarePlanetContourReveal', 0.75, 0.80, 'Peripheral planet square contours fade into the terminal framing'),
  squareTitleFade: defineRange('squareTitleFade', 0.64, 0.72, 'Earendel title shrinks with the logical canvas and fades out'),
  squareAct3Crossfade: defineRange('squareAct3Crossfade', 0.80, SCROLL_RIG.ACT3_START, 'Square contours crossfade into matching Act 3 geometry'),
  act3OrbitResume: defineRange('act3OrbitResume', SCROLL_RIG.ACT3_START, 0.90, 'Frozen terminal layout smoothly resumes orbit motion'),
  act2ThemeReveal: defineRange('act2ThemeReveal', SCROLL_RIG.MINIATURE_END, 0.63, 'Theme background and lighting return beneath the square wave'),
  wavesAct3Fade: defineRange('wavesAct3Fade', SCROLL_RIG.ACT3_START, 1.0, 'Ocean fades as Act 3 shifts in'),
  orbitLineReveal: defineRange('orbitLineReveal', SCROLL_RIG.ACT3_START, 1.0, 'Decorative gyroscope lines reveal after the square-contour handoff'),
  planetVisible: defineRange('planetVisible', 0.58, 1.0, 'Main planets and central star publish their terminal layout'),
  orbitGlow: defineRange('orbitGlow', 0.94, 1.0, 'Orbit rings and planet glow fade in'),
  brandTitle: defineRange('brandTitle', SCROLL_RIG.TEXT_START, 0.92, 'Brand title scroll-driven reveal'),
  act3Shift: defineRange('act3Shift', SCROLL_RIG.ACT3_START, 1.0, 'Act 3 scene shift and DOM overlay phase'),
} as const

export type TimelineKey = keyof typeof TIMELINE

export function getRange(key: TimelineKey): TimelineRange {
  return TIMELINE[key]
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t)
}

export function progress(key: TimelineKey, sp: number): number {
  const range = getRange(key)
  const span = range.end - range.start
  if (span === 0) return sp >= range.end ? 1 : 0
  return clamp01((sp - range.start) / span)
}

export function smoothProgress(key: TimelineKey, sp: number): number {
  return smoothstep01(progress(key, sp))
}

export function contains(key: TimelineKey, sp: number): boolean {
  const range = getRange(key)
  return sp >= range.start && sp <= range.end
}

export function direction(prevSp: number, nextSp: number): TimelineDirection {
  if (nextSp > prevSp) return 'forward'
  if (nextSp < prevSp) return 'backward'
  return 'still'
}

export function snapshotTimeline(sp: number) {
  return Object.fromEntries(
    Object.entries(TIMELINE).map(([key, range]) => [
      key,
      {
        active: sp >= range.start && sp <= range.end,
        progress: progress(key as TimelineKey, sp),
        smooth: smoothProgress(key as TimelineKey, sp),
        reversible: range.reversible,
      },
    ]),
  ) as Record<TimelineKey, { active: boolean; progress: number; smooth: number; reversible: boolean }>
}
