import { useEffect, useRef, useCallback, useState } from 'react'
import { gsap } from 'gsap'
import { useScrollStore } from '../stores/scrollStore'
import { setThemeBlend, WHITE_OUT_THRESHOLD, WHITE_OUT_END } from '../r3f/ScrollRig'
import { NIGHT_ACT1, NIGHT_ACT3, DAY_ACT1, DAY_ACT3, scrollThemeVars, blendThemeVars } from './palettes'

// ============================================================
// useDayNight — day/night 主题运行时 Hook
//
// 两层更新策略（均保持 React 控制）：
//
//   Scroll 驱动 — TerminalBar useEffect [scrollProgress] →
//                  handleThemeUpdate(sp) → --tw-* CSS 变量
//                  scrollT 夹紧至 Act 2 (0.40–0.55)，Act 1/3 保持端点色
//
//   Command 驱动 — setDayNight() → themeKey 递增 →
//                  TerminalBar 立即重渲染 → handleThemeUpdate 读最新 blend
//
// Scene 背景：GSAP tween → setThemeBlend → ScrollRig._themeBlend → useFrame 读
// Body 背景： data-theme 属性 → CSS transition 0.5s
// ============================================================

export function useDayNight(): { handleThemeUpdate: (sp: number) => Record<string, string>; themeKey: number } {
  const dayNight = useScrollStore(s => s.dayNight)
  const blendRef = useRef(dayNight === 'day' ? 1 : 0)
  const sceneBlendRef = useRef({ v: dayNight === 'day' ? 1 : 0 })
  const tweenRef = useRef<gsap.core.Tween | null>(null)
  const [themeKey, setThemeKey] = useState(0)

  // ---- data-theme attribute → CSS 主题切换 ----
  useEffect(() => {
    document.documentElement.dataset.theme = dayNight
  }, [dayNight])

  // ---- day/night 命令 → 终端即时响应 + Scene GSAP 平滑过渡 ----
  useEffect(() => {
    const target = dayNight === 'day' ? 1 : 0
    tweenRef.current?.kill()

    // 终端：立即切换 blend，通过 themeKey 通知 TerminalBar 重渲染
    blendRef.current = target
    setThemeKey(k => k + 1)

    // Scene 背景：GSAP 平滑过渡（独立于终端，零 React re-render）
    tweenRef.current = gsap.to(sceneBlendRef.current, {
      v: target,
      duration: 0.6,
      ease: 'power2.inOut',
      onUpdate: () => setThemeBlend(sceneBlendRef.current.v),
    })
    return () => { tweenRef.current?.kill() }
  }, [dayNight])

  // ---- TerminalBar onThemeUpdate 回调 ----
  const handleThemeUpdate = useCallback((sp: number) => {
    // Act 1：强制 night 色板，忽略 dayNight 选择（dark ocean 场景需暗色终端）
    // 进入 Act 2 后恢复实际 blend 值，scroll 回 Act 1 时立即切回 night
    const blend = sp < WHITE_OUT_THRESHOLD ? 0 : blendRef.current
    const raw = sp <= WHITE_OUT_THRESHOLD ? 0 : sp >= WHITE_OUT_END ? 1 : (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)
    const scrollT = raw * raw * (3 - 2 * raw)
    const nightCss = scrollThemeVars(NIGHT_ACT1, NIGHT_ACT3, scrollT)
    const dayCss = scrollThemeVars(DAY_ACT1, DAY_ACT3, scrollT)
    return blendThemeVars(nightCss, dayCss, blend)
  }, [])

  return { handleThemeUpdate, themeKey }
}
