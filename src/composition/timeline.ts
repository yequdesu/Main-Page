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
  act2GridTransition: defineRange('act2GridTransition', SCROLL_RIG.MINIATURE_END, SCROLL_RIG.GRID_SHIFT_START, 'Act 2 grid transition macro phase'),
  act3ContentPhase: defineRange('act3ContentPhase', SCROLL_RIG.GRID_SHIFT_START, 1.0, 'Act 3 content macro phase'),
  miniatureShrink: defineRange(
    'miniatureShrink',
    SCROLL_RIG.MINIATURE_START,
    SCROLL_RIG.MINIATURE_END,
    'Act 1 scene continuously shrinks into a framed miniature universe',
  ),
  act2ThemeReveal: defineRange('act2ThemeReveal', SCROLL_RIG.MINIATURE_END, 0.68, 'Theme background and lighting return after the miniature disappears'),
  wavesCascade: defineRange('wavesCascade', 0.24, 0.72, 'Ocean waves cascade into the grid transition'),
  wavesAct3Fade: defineRange('wavesAct3Fade', SCROLL_RIG.GRID_SHIFT_START, 1.0, 'Ocean fades as Act 3 shifts in'),
  gridExtend: defineRange('gridExtend', 0.60, SCROLL_RIG.GRID_SHIFT_START, 'Grid lines extend from near to far'),
  gridRetract: defineRange('gridRetract', SCROLL_RIG.GRID_SHIFT_START, 0.95, 'Grid lines retract as planets take over'),
  orbitLineReveal: defineRange('orbitLineReveal', SCROLL_RIG.GRID_SHIFT_START, 1.0, 'Orbit and gyroscope line draw/retract'),
  windChimeDrop: defineRange('windChimeDrop', 0.60, 0.75, 'Star and planets drop from the upper anchor'),
  windChimeRetract: defineRange('windChimeRetract', 0.75, 0.88, 'Wind chime guide lines retract'),
  planetVisible: defineRange('planetVisible', 0.60, 1.0, 'Main planets and central star can be visible'),
  orbitGlow: defineRange('orbitGlow', 0.94, 1.0, 'Orbit rings and planet glow fade in'),
  brandTitle: defineRange('brandTitle', SCROLL_RIG.TEXT_START, 0.92, 'Brand title scroll-driven reveal'),
  act3Shift: defineRange('act3Shift', SCROLL_RIG.GRID_SHIFT_START, 1.0, 'Act 3 scene shift and DOM overlay phase'),
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
