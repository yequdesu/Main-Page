import { afterMiniature, act1Progress, act1AnimationProgress, act1PageProgress, PRESENTATION_PACING as PACING } from './transitionTiming'
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
  cubeDrawAndTumble: defineRange('cubeDrawAndTumble', SCROLL_RIG.MINIATURE_START, act1Progress(0.50), 'Cube edges draw while the miniature tumbles on three axes'),
  cubeAbsorptionTrails: defineRange('cubeAbsorptionTrails', act1Progress(0.25), act1Progress(0.70), 'Spatial particle field, screen scans and inward collapse'),
  cubeParticleScan: defineRange('cubeParticleScan', act1PageProgress(act1Progress(0.40)), act1PageProgress(act1Progress(0.658)), 'Scan remaining stationary particles until the last collapse starts'),
  cubeWhiteFill: defineRange('cubeWhiteFill', act1Progress(0.50), SCROLL_RIG.MINIATURE_END, 'Cube settles face-on and fills to pure white'),
  squareSeedShrink: defineRange('squareSeedShrink', afterMiniature(0.55), afterMiniature(0.56), 'Screen-space square takes over and shrinks slightly'),
  squareBfsWave: defineRange('squareBfsWave', afterMiniature(0.56), afterMiniature(0.70), 'Deterministic square wave expands to its 400-cell handoff radius'),
  squareCircleMorph: defineRange('squareCircleMorph', afterMiniature(0.65), afterMiniature(0.665), 'Dense square wave morphs into a strict circular ring'),
  geometricOrbitExpand: defineRange('geometricOrbitExpand', afterMiniature(0.56), afterMiniature(0.56 + (0.65 - 0.56) * 0.36), 'Original square-wave expansion timing; extended orbit hold before retraction'),
  geometricOrbitRetract: defineRange('geometricOrbitRetract', PACING.geometricRetractEnd - (0.59 - afterMiniature(0.64)), PACING.geometricRetractEnd, 'Longer orbit hold; original retraction duration and easing, ending at 70%'),
  squareTitleTyping: defineRange('squareTitleTyping', afterMiniature(0.58), afterMiniature(0.64), 'Allura bracket title is handwritten by raster DFS trails'),
  squareContourZoom: defineRange('squareContourZoom', afterMiniature(0.70), afterMiniature(0.80), 'Frozen square contour canvas zooms out to the Act 3 terminal framing'),
  squarePlanetFlights: defineRange('squarePlanetFlights', afterMiniature(0.70), afterMiniature(0.80), 'Three circular trails fly from the central frame into the Act 3 planet targets'),
  squareOrbitFlights: defineRange('squareOrbitFlights', afterMiniature(PACING.orbitSourceStart), afterMiniature(PACING.orbitSourceEnd), 'Orbit tracing follows the main planet flight, retaining flight speed and stagger'),
  squareTitleFade: defineRange('squareTitleFade', afterMiniature(0.665), afterMiniature(0.745), 'Complete title holds through the strict-geometry charge gate before fading'),
  squareAct3Crossfade: defineRange('squareAct3Crossfade', afterMiniature(PACING.crossfadeSourceStart), SCROLL_RIG.ACT3_START, 'Completed white system holds before crossfading into Act 3'),
  act3OrbitResume: defineRange('act3OrbitResume', SCROLL_RIG.ACT3_START, afterMiniature(PACING.orbitResumeSourceEnd), 'Frozen terminal layout smoothly resumes orbit motion'),
  act2ThemeReveal: defineRange('act2ThemeReveal', SCROLL_RIG.MINIATURE_END, afterMiniature(0.63), 'Theme background and lighting return beneath the square wave'),
  wavesAct3Fade: defineRange('wavesAct3Fade', SCROLL_RIG.ACT3_START, 1.0, 'Ocean fades as Act 3 shifts in'),
  orbitLineReveal: defineRange('orbitLineReveal', afterMiniature(PACING.crossfadeSourceStart), SCROLL_RIG.ACT3_START, 'Completed Canvas orbit traces crossfade into stable Act 3 lines'),
  planetVisible: defineRange('planetVisible', afterMiniature(0.58), 1.0, 'Main planets and central star publish their terminal layout'),
  orbitGlow: defineRange('orbitGlow', afterMiniature(0.94), 1.0, 'Orbit rings and planet glow fade in'),
  brandTitle: defineRange('brandTitle', SCROLL_RIG.TEXT_START, afterMiniature(0.92), 'Brand title scroll-driven reveal'),
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
  const miniatureClock = key === 'miniatureShrink' || key === 'cubeDrawAndTumble' ||
    key === 'cubeWhiteFill' || key === 'cubeAbsorptionTrails' || key === 'cubeParticleScan'
  const clock = miniatureClock ? act1AnimationProgress : (value: number) => value
  const start = clock(range.start), end = clock(range.end)
  const span = end - start
  if (span === 0) return sp >= range.end ? 1 : 0
  return clamp01((clock(sp) - start) / span)
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
