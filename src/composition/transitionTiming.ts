// The former page had 79 viewport heights of usable scroll (80 minus viewport).
// Keep Act1's absolute distance; later acts are now twice their previous length.
export const DOWNSTREAM_DISTANCE_SCALE = 4
export const PAGE_DISTANCE_SCALE = 0.7 + DOWNSTREAM_DISTANCE_SCALE * 0.3
export const PAGE_HEIGHT_VH = 1 + 79 * PAGE_DISTANCE_SCALE
export const act1Progress = (value: number): number => value / PAGE_DISTANCE_SCALE

/** One reversible clock for all scroll-driven miniature effects. Page progress
 * and the scrollbar remain linear; wind and other ambient motion keep real time. */
export function act1AnimationProgress(pageProgress: number): number {
  const start = act1Progress(.25), middle = act1Progress(.50), end = act1Progress(.70)
  if (pageProgress <= start || pageProgress >= end) return pageProgress
  const lo = pageProgress < middle ? start : middle
  const hi = pageProgress < middle ? middle : end
  const t = (pageProgress - lo) / (hi - lo)
  return lo + (hi - lo) * t * t * (3 - 2 * t)
}

/** Inverse for sampling particle history/scan events in the shared clock. */
export function act1PageProgress(animationProgress: number): number {
  if (animationProgress <= act1Progress(.25) || animationProgress >= act1Progress(.70)) return animationProgress
  let lo = act1Progress(.25), hi = act1Progress(.70)
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (act1AnimationProgress(mid) < animationProgress) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export const PRESENTATION_PACING = {
  titleHold: .035,
  geometricRetractEnd: .70,
  orbitSourceStart: .765,
  orbitSourceEnd: .84,
  crossfadeSourceStart: .855,
  act3SourceStart: .905,
  orbitResumeSourceEnd: .955,
} as const
export const previousPageProgress = (value: number): number =>
  value <= act1Progress(0.7) ? value * PAGE_DISTANCE_SCALE
    : 0.7 + (value * PAGE_DISTANCE_SCALE - 0.7) / DOWNSTREAM_DISTANCE_SCALE

/** Map legacy downstream milestones once, never the application's scroll value. */
export const afterMiniature = (value: number): number =>
  value === 1 ? 1 : (0.70 + (value - 0.55) * (0.3 * DOWNSTREAM_DISTANCE_SCALE) / 0.45) / PAGE_DISTANCE_SCALE

/** Preserve the old miniature trajectory, stretching its two phases separately. */
export const miniatureSourceProgress = (value: number): number =>
  value <= act1Progress(0.25) ? value * PAGE_DISTANCE_SCALE : value <= act1Progress(0.50)
    ? 0.25 + (value * PAGE_DISTANCE_SCALE - 0.25) * 0.20 / 0.25
    : 0.45 + (Math.min(value * PAGE_DISTANCE_SCALE, 0.70) - 0.50) * 0.10 / 0.20
