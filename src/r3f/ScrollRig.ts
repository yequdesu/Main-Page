import { type Scene, Color, FogExp2 } from 'three'
import { SCROLL_RIG } from '../types'
import { TIMELINE } from '../composition/timeline'

// smoothstep(t) = 3t² - 2t³
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

// clamp + normalize: �?sp 映射�?[start, end] �?[0, 1]
export function clamped(sp: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (sp - start) / (end - start)))
}

// 集中导出所有阈值（唯一真相源）
export const {
  SCENE_CENTER_Z,
  MINIATURE_START, MINIATURE_END, SQUARE_TRANSITION_END,
  TEXT_START, ACT3_START,
  ORBIT_RADII, ORBIT_COUNT,
  FOCUS_TIMEOUT, IDLE_RESET_DELAY,
} = SCROLL_RIG

// ============================================================
// Scene manager: Act 2 theme reveal after the miniature universe disappears.
// themeBlend: 0=night (暗色不白�?, 1=day (白雾过渡至亮�?
//   �?App.tsx GSAP tween 驱动，实�?day↔night 平滑过渡
// ============================================================
let _themeBlend = 0 // 0=night, 1=day

/** App.tsx GSAP tween 每帧更新，驱�?scene 背景平滑过渡 */
export function setThemeBlend(v: number) { _themeBlend = v }

const _bgBaseColor = new Color('#050811')
const _bgNightTarget = new Color('#050811')   // night: Act 3 �?Act 1 一�?
const _bgDayTarget = new Color('#f1f5f9')     // day: 白雾过渡至亮�?
const _bgTargetColor = new Color()
const _bgLerpColor = new Color()

export function sceneApplyThemeTransition(scene: Scene, sp: number): void {
  const themeProgress = smoothstep(clamped(sp, TIMELINE.act2ThemeReveal.start, TIMELINE.act2ThemeReveal.end))
  _bgTargetColor.copy(_bgNightTarget).lerp(_bgDayTarget, _themeBlend)
  _bgLerpColor.copy(_bgBaseColor).lerp(_bgTargetColor, themeProgress)
  scene.background = _bgLerpColor

  const fogDensity = 0.02 * (1 - themeProgress)

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
