import { type Scene, Color, FogExp2 } from 'three'
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
export const {
  SCENE_CENTER_Z,
  WHITE_OUT_THRESHOLD, WHITE_OUT_END,
  GRID_START, VERTICAL_START,
  TEXT_START, GRID_SHIFT_START,
  ORBIT_RADII, ORBIT_COUNT,
  FOCUS_TIMEOUT, IDLE_RESET_DELAY,
} = SCROLL_RIG

// ============================================================
// Scene Manager — white-out transition
// 原 sceneApplyWhiteOut():168-196，逐字保留
// ============================================================
const _bgBaseColor = new Color('#050811')
const _bgTargetColor = new Color('#f1f5f9')
const _bgLerpColor = new Color()

export function sceneApplyWhiteOut(scene: Scene, sp: number): void {
  const wof = clamped(sp, WHITE_OUT_THRESHOLD, WHITE_OUT_END)
  _bgLerpColor.copy(_bgBaseColor).lerp(_bgTargetColor, wof)
  scene.background = _bgLerpColor

  let fogDensity = 0.02
  if (sp >= WHITE_OUT_THRESHOLD && sp < WHITE_OUT_END) {
    fogDensity = 0.02 + wof * 0.08
  } else if (sp >= WHITE_OUT_END) {
    const fadeProgress = clamped(sp, WHITE_OUT_END, GRID_SHIFT_START)
    fogDensity = 0.10 * (1.0 - fadeProgress)
  }

  if (fogDensity > 0.001) {
    if (!scene.fog) {
      scene.fog = new FogExp2(_bgLerpColor, fogDensity)
    }
    if (scene.fog) {
      const fog = scene.fog as FogExp2
      fog.color.copy(_bgLerpColor)
      fog.density = fogDensity
    }
  } else {
    scene.fog = null
  }
}
