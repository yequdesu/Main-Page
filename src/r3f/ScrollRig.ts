import { SCROLL_RIG } from '../types'

// smoothstep(t) = 3t² - 2t³
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

// clamp + normalize: 将 sp 映射到 [start, end] → [0, 1]
export function clamped(sp: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (sp - start) / (end - start)))
}

// 集中导出所有阈值（唯一真相源）
// 援引：R3F Rig 模式 — 集中定义 scroll → 3D 变换映射
export const {
  SCENE_CENTER_Z,
  WHITE_OUT_THRESHOLD, WHITE_OUT_END,
  GRID_START, VERTICAL_START,
  TEXT_START, GRID_SHIFT_START,
  ORBIT_RADII, ORBIT_COUNT,
  FOCUS_TIMEOUT, IDLE_RESET_DELAY,
} = SCROLL_RIG
