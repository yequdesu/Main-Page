import { useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'
import { useScrollStore } from '../stores/scrollStore'
import { setThemeBlend } from '../r3f/ScrollRig'
import { NIGHT_ACT1, NIGHT_ACT3, DAY_ACT1, DAY_ACT3, scrollThemeVars, blendThemeVars } from './palettes'

// ============================================================
// useDayNight — day/night 主题运行时 Hook
//
// 完整的主题切换数据流：
//
//   user 输入 day/night 命令
//     → scrollStore.setDayNight()
//     → useScrollStore(s => s.dayNight) 触发重渲染
//     ├─ data-theme 写入 → theme.css [data-theme] 规则覆盖
//     │    └─ 影响：body bg, scroll hint, footer, brand text 等静态元素
//     │            过渡由 CSS transition: background-color 0.5s 驱动
//     └─ GSAP tween blendRef.current: 0↔1 (0.6s power2.inOut)
//          ├─ onUpdate → setThemeBlend() → ScrollRig._themeBlend
//          │    └─ 影响：Three.js scene 背景 + fog 平滑过渡
//          └─ handleThemeUpdate 每帧读取 blendRef.current
//               └─ 影响：TerminalBar --tw-* CSS 变量 crossfade
//
// 三层过渡时长统一 0.5~0.6s，确保视觉一致性。
//
// 色板定义见 ./palettes.ts，CSS 主题配置见 ./theme.css
// ============================================================

export function useDayNight(): { handleThemeUpdate: (sp: number) => Record<string, string> } {
  const dayNight = useScrollStore(s => s.dayNight)
  const blendRef = useRef(dayNight === 'day' ? 1 : 0)
  const tweenRef = useRef<gsap.core.Tween | null>(null)

  // ---- data-theme attribute → CSS 主题切换 ----
  useEffect(() => {
    document.documentElement.dataset.theme = dayNight
  }, [dayNight])

  // ---- GSAP blend tween → scene background + TerminalBar crossfade ----
  useEffect(() => {
    const target = dayNight === 'day' ? 1 : 0
    tweenRef.current?.kill()
    tweenRef.current = gsap.to(blendRef, {
      current: target,
      duration: 0.6,
      ease: 'power2.inOut',
      onUpdate: () => setThemeBlend(blendRef.current),
    })
    return () => { tweenRef.current?.kill() }
  }, [dayNight])

  // ---- TerminalBar onThemeUpdate 回调 ----
  const handleThemeUpdate = useCallback((sp: number) => {
    const blend = blendRef.current // 0=night, 1=day (GSAP tween 驱动)
    const scrollT = sp * sp * (3 - 2 * sp) // smoothstep
    const nightCss = scrollThemeVars(NIGHT_ACT1, NIGHT_ACT3, scrollT)
    const dayCss = scrollThemeVars(DAY_ACT1, DAY_ACT3, scrollT)
    return blendThemeVars(nightCss, dayCss, blend)
  }, [])

  return { handleThemeUpdate }
}
