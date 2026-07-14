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
  WHITE_OUT_THRESHOLD, WHITE_OUT_END,
  GRID_START, VERTICAL_START,
  TEXT_START, GRID_SHIFT_START,
  ORBIT_RADII, ORBIT_COUNT,
  FOCUS_TIMEOUT, IDLE_RESET_DELAY,
} = SCROLL_RIG

// ============================================================
// Scene background manager
//
// The Act 1 -> Act 2 transition is now represented by the local beam sweep
// post-process. The scene manager keeps the theme background and normal fog
// lifecycle, but does not apply a full-screen white-out.
// ============================================================
let _themeBlend = 0 // 0=night, 1=day

/** App.tsx GSAP tween 每帧更新，驱�?scene 背景平滑过渡 */
export function setThemeBlend(v: number) { _themeBlend = v }

const _bgNightTarget = new Color('#050811')   // night: Act 3 �?Act 1 一�?
const _bgDayTarget = new Color('#f1f5f9')     // day: 白雾过渡至亮�?
const _bgTargetColor = new Color()
const _fogColor = new Color()

export function sceneApplyWhiteOut(scene: Scene, sp: number): void {
  _bgTargetColor.copy(_bgNightTarget).lerp(_bgDayTarget, _themeBlend)
  scene.background = _bgTargetColor

  let fogDensity = 0.02
  if (sp >= TIMELINE.fogFade.start && sp < TIMELINE.fogFade.end) {
    const fogFade = clamped(sp, TIMELINE.fogFade.start, TIMELINE.fogFade.end)
    fogDensity = 0.02 * (1.0 - fogFade)
  } else if (sp >= TIMELINE.fogFade.end) {
    fogDensity = 0  // 0.65 后完全除�?
  }

  if (fogDensity > 0.001) {
    if (!scene.fog) {
      scene.fog = new FogExp2(_bgTargetColor, fogDensity)
    }
    if (scene.fog) {
      const fog = scene.fog as FogExp2
      _fogColor.copy(_bgTargetColor)
      fog.color.copy(_fogColor)
      fog.density = fogDensity
    }
  } else {
    scene.fog = null
  }
}
