/**
 * 场景级主题色定义 �?day/night 统一管理�?
 *
 * 所有非终端�?-tw-*）的 JS 可访问颜色集中于此�?
 * CSS 侧对应变量定义在 theme.css �?:root / [data-theme="day"] 中�?
 */

export type DayNight = 'night' | 'day'

// ============================================================
// 色值定�?
// ============================================================

interface ThemePair { night: string; day: string }

export const SCENE_COLORS: Record<string, ThemePair> = {
  /** 轨道参考线 + 陀螺仪装饰环（OrbitRings / OrbitalRing�?*/
  orbit:  { night: '#cbd5e1', day: '#64748b' },

  /** label �?planet 引导虚线（PlanetLabelGuideLines�?*/
  guideLine: { night: 'rgba(200, 210, 225, 0.45)', day: 'rgba(60, 72, 90, 0.35)' },
}

// ============================================================
// 工具函数
// ============================================================

/** 根据 day/night 模式获取主题色�?*/
export function themeColor(key: keyof typeof SCENE_COLORS, dayNight: DayNight): string {
  return SCENE_COLORS[key][dayNight]
}
