/** Act 4 普通磁拱的活动区摆放；与内部构型、运动时序使用不同的随机盐值。 */
export const PROMINENCE_PLACEMENT = { maxAzimuth: Math.PI / 4, minScale: 0.8, maxScale: 1.5, sizePower: 0.5 } as const

const random = (seed: number, salt: number) => {
  let n = ((seed * 0xffffffff) >>> 0) ^ Math.imul(salt, 0x9e3779b9)
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}

/** 每次创建模型时取样一次，播放、暂停、回退和窗口变化都复用同一方案。 */
export function createProminencePlacement(seed: number) {
  const p = PROMINENCE_PLACEMENT
  return {
    azimuth: (random(seed, 902) < 0.5 ? -1 : 1) * p.maxAzimuth * random(seed, 901),
    scale: p.minScale + (p.maxScale - p.minScale) * random(seed, 903) ** p.sizePower,
  }
}
