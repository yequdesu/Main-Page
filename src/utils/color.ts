// ============================================================
// 颜色插值工�?�?纯函数，零依�?
//
// 用于终端动态颜色过渡（�?scrollProgress 暗→亮平滑切换）
// 援引：线性色彩空间逐通道插�?�?CSS transition / GSAP 标准实现
// ============================================================

/** 在两个十六进制颜色字符串之间线性插�?*/
export function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const [ar, ag, ab] = p(a)
  const [br, bg, bb] = p(b)
  const rv = Math.round(ar + (br - ar) * t)
  const gv = Math.round(ag + (bg - ag) * t)
  const bv = Math.round(ab + (bb - ab) * t)
  return `#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`
}

/** 在两�?rgba() 字符串之间线性插值（�?alpha 通道�?*/
export function lerpRgba(a: string, b: string, t: number): string {
  const re = /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/
  const m = a.match(re)
  const n = b.match(re)
  if (!m || !n) return a
  const r = Math.round(+m[1] + (+n[1] - +m[1]) * t)
  const g = Math.round(+m[2] + (+n[2] - +m[2]) * t)
  const bb = Math.round(+m[3] + (+n[3] - +m[3]) * t)
  const alpha = +m[4] + (+n[4] - +m[4]) * t
  return `rgba(${r},${g},${bb},${alpha.toFixed(2)})`
}
