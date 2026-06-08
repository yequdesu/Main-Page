// ============================================================
//  ACT BOUNDARY THRESHOLDS
// ============================================================
export const WHITE_OUT_THRESHOLD = 0.40
export const WHITE_OUT_END      = 0.55
export const GRID_START         = 0.45
export const VERTICAL_START     = 0.58
export const TEXT_START         = 0.70
export const GRID_SHIFT_START   = 0.85
export const IDLE_RESET_DELAY   = 1.5

// ============================================================
//  UNIFIED SCENE CENTER
// ============================================================
export const SCENE_CENTER_Z = -16.0

// ============================================================
//  ACT 3 — ORBIT CONSTANTS
// ============================================================
export const ORBIT_COUNT = 4
export const ORBIT_RADII = [3.6, 5.0, 6.4, 22.0]
export const ELLIPSE_A = 22.0
export const ELLIPSE_E = 0.65
export const ELLIPSE_B = ELLIPSE_A * Math.sqrt(1 - ELLIPSE_E * ELLIPSE_E)
export const ELLIPSE_C = ELLIPSE_A * ELLIPSE_E
export const ELLIPSE_INCL = 0.45

// ============================================================
//  COLOR CONSTANTS
// ============================================================
export const BG_BASE       = '#050811'
export const BG_TARGET     = '#f1f5f9'
export const TARGET_COL    = '#94a3b8'
export const COLOR_ACT1    = '#f0f8ff'
export const COLOR_ACT3    = '#64748b'
export const ORBIT_NEAR    = '#475569'
export const ORBIT_FAR     = '#f1f5f9'

// ============================================================
//  UTILITY
// ============================================================
export function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

export function shortestDelta(from, to) {
  let d = to - from
  while (d > Math.PI)  d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}
