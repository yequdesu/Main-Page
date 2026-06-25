import { type Scene, Color, FogExp2 } from 'three'
import { SCROLL_RIG } from '../types'
import { TIMELINE } from '../composition/timeline'

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
// themeBlend: 0=night (暗色不白化), 1=day (白雾过渡至亮色)
//   由 App.tsx GSAP tween 驱动，实现 day↔night 平滑过渡
// ============================================================
let _themeBlend = 0 // 0=night, 1=day

/** App.tsx GSAP tween 每帧更新，驱动 scene 背景平滑过渡 */
export function setThemeBlend(v: number) { _themeBlend = v }

const _bgBaseColor = new Color('#050811')
const _bgNightTarget = new Color('#050811')   // night: Act 3 与 Act 1 一致
const _bgDayTarget = new Color('#f1f5f9')     // day: 白雾过渡至亮色
const _bgTargetColor = new Color()
const _bgLerpColor = new Color()

export function sceneApplyWhiteOut(scene: Scene, sp: number): void {
  const wof = clamped(sp, TIMELINE.whiteOut.start, TIMELINE.whiteOut.end)
  _bgTargetColor.copy(_bgNightTarget).lerp(_bgDayTarget, _themeBlend)
  _bgLerpColor.copy(_bgBaseColor).lerp(_bgTargetColor, wof)
  scene.background = _bgLerpColor

  let fogDensity = 0.02
  if (sp >= TIMELINE.whiteOut.start && sp < TIMELINE.whiteOut.end) {
    fogDensity = 0.02 + wof * 0.08
  } else if (sp >= TIMELINE.fogFade.start && sp < TIMELINE.fogFade.end) {
    const fogFade = clamped(sp, TIMELINE.fogFade.start, TIMELINE.fogFade.end)
    fogDensity = 0.10 * (1.0 - fogFade)
  } else if (sp >= TIMELINE.fogFade.end) {
    fogDensity = 0  // 0.65 后完全除雾
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
