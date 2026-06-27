import { lerpHex, lerpRgba } from '../utils/color'

// ============================================================
// Day/Night 双色�?�?Plan B（偏移）
//
// 每个模式定义 Act1 (sp=0) �?Act3 (sp=1) 的终端色端点�?
// 运行时由 useDayNight.handleThemeUpdate �?scrollProgress
// + day/night blend 因子动态计�?--tw-* CSS 变量�?
//
// ⚠️ 色值与 theme.css �?:root / [data-theme="day"] �?
//    --tw-* 初始值必须保持同步。修改任一处需同步更新另一处�?
//    theme.css 覆盖首帧 JS 未接管期，本文件覆盖运行期�?
// ============================================================

export interface ThemeVars {
  echo: string; prefix: string; prompt: string
  placeholder: string; input: string
  cursorBright: string; cursorDim: string
  ring: string; ringOuter: string; ringActive: string
  glassBg: string
}

export const NIGHT_ACT1: ThemeVars = {
  echo: '#7c8aa0', prefix: '#64748b', prompt: '#0ea5e9',
  placeholder: 'rgba(255,255,255,0.15)', input: '#e2e8f0',
  cursorBright: '#e2e8f0', cursorDim: '#0ea5e9',
  ring: 'rgba(200,220,255,0.45)', ringOuter: 'rgba(180,210,255,0.14)',
  ringActive: 'rgba(180,210,255,0.30)', glassBg: 'rgba(15,20,35,0.05)',
}

export const NIGHT_ACT3: ThemeVars = {
  echo: '#94a3b8', prefix: '#78889a', prompt: '#38bdf8',
  placeholder: 'rgba(255,255,255,0.12)', input: '#cbd5e1',
  cursorBright: '#cbd5e1', cursorDim: '#38bdf8',
  ring: 'rgba(200,220,255,0.45)', ringOuter: 'rgba(180,210,255,0.14)',
  ringActive: 'rgba(180,210,255,0.30)', glassBg: 'rgba(15,20,35,0.05)',
}

export const DAY_ACT1: ThemeVars = {
  echo: '#475569', prefix: '#64748b', prompt: '#0369a1',
  placeholder: 'rgba(0,0,0,0.08)', input: '#1e293b',
  cursorBright: '#1e293b', cursorDim: '#0369a1',
  ring: 'rgba(30,64,175,0.30)', ringOuter: 'rgba(30,64,175,0.08)',
  ringActive: 'rgba(30,64,175,0.20)', glassBg: 'rgba(255,255,255,0.35)',
}

export const DAY_ACT3: ThemeVars = {
  echo: '#334155', prefix: '#475569', prompt: '#0284c7',
  placeholder: 'rgba(0,0,0,0.10)', input: '#0f172a',
  cursorBright: '#0f172a', cursorDim: '#0284c7',
  ring: 'rgba(30,64,175,0.30)', ringOuter: 'rgba(30,64,175,0.08)',
  ringActive: 'rgba(30,64,175,0.20)', glassBg: 'rgba(255,255,255,0.35)',
}

// ============================================================
// 色板插值函�?
// ============================================================

export function lerpThemeVars(a: ThemeVars, b: ThemeVars, t: number): Record<string, string> {
  return {
    '--tw-echo': lerpHex(a.echo, b.echo, t),
    '--tw-prefix': lerpHex(a.prefix, b.prefix, t),
    '--tw-prompt': lerpHex(a.prompt, b.prompt, t),
    '--tw-placeholder': lerpRgba(a.placeholder, b.placeholder, t),
    '--tw-input': lerpHex(a.input, b.input, t),
    '--tw-cursor-bright': lerpHex(a.cursorBright, b.cursorBright, t),
    '--tw-cursor-dim': lerpHex(a.cursorDim, b.cursorDim, t),
    '--tw-ring': lerpRgba(a.ring, b.ring, t),
    '--tw-ring-outer': lerpRgba(a.ringOuter, b.ringOuter, t),
    '--tw-ring-active': lerpRgba(a.ringActive, b.ringActive, t),
    '--tw-glass-bg': lerpRgba(a.glassBg, b.glassBg, t),
  }
}

/** 在色板内�?scroll 位置插值，返回 CSS 变量 map */
export function scrollThemeVars(act1: ThemeVars, act3: ThemeVars, scrollT: number) {
  return lerpThemeVars(act1, act3, scrollT)
}

/** 交叉 fade 两个色板结果：blend=0 �?a (night), blend=1 �?b (day) */
const _blendCache: Record<string, string> = {}

export function blendThemeVars(a: Record<string, string>, b: Record<string, string>, blend: number) {
  for (const key of Object.keys(a)) {
    _blendCache[key] = key.startsWith('--tw-ring') || key === '--tw-placeholder' || key === '--tw-glass-bg'
      ? lerpRgba(a[key], b[key], blend)
      : lerpHex(a[key], b[key], blend)
  }
  return _blendCache
}
