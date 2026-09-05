// The former page had 79 viewport heights of usable scroll (80 minus viewport).
// Keep Act1's 70% distance; double both later acts: 0.7 + 2 * 0.3 = 1.3.
export const PAGE_DISTANCE_SCALE = 1.3
export const PAGE_HEIGHT_VH = 1 + 79 * PAGE_DISTANCE_SCALE
export const act1Progress = (value: number): number => value / PAGE_DISTANCE_SCALE
export const previousPageProgress = (value: number): number =>
  value <= act1Progress(0.7) ? value * PAGE_DISTANCE_SCALE
    : 0.7 + (value * PAGE_DISTANCE_SCALE - 0.7) / 2

/** Map legacy downstream milestones once, never the application's scroll value. */
export const afterMiniature = (value: number): number =>
  value === 1 ? 1 : (0.70 + (value - 0.55) * 0.60 / 0.45) / PAGE_DISTANCE_SCALE

/** Preserve the old miniature trajectory, stretching its two phases separately. */
export const miniatureSourceProgress = (value: number): number =>
  value <= act1Progress(0.25) ? value * PAGE_DISTANCE_SCALE : value <= act1Progress(0.50)
    ? 0.25 + (value * PAGE_DISTANCE_SCALE - 0.25) * 0.20 / 0.25
    : 0.45 + (Math.min(value * PAGE_DISTANCE_SCALE, 0.70) - 0.50) * 0.10 / 0.20
