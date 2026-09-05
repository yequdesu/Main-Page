/** Map legacy downstream milestones once, never the application's scroll value. */
export const afterMiniature = (value: number): number =>
  0.65 + (value - 0.55) * 0.35 / 0.45

/** Preserve the old miniature trajectory, stretching its two phases separately. */
export const miniatureSourceProgress = (value: number): number =>
  value <= 0.25 ? value : value <= 0.50
    ? 0.25 + (value - 0.25) * 0.20 / 0.25
    : 0.45 + (Math.min(value, 0.65) - 0.50) * 0.10 / 0.15
