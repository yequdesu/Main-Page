/** 日面背景微光与 CME 逸散颗粒共用的屏幕直径（CSS px），不随相机缩放。 */
export const STELLAR_PARTICLE_DIAMETER_PX = { min: 1.5, max: 3.5 } as const

/** 亮点直接使用磁拱环的 uColor，主体在线性色彩空间降亮度，保持同色系。 */
export const CME_PARTICLE_STYLE = {
  baseIntensity: 0.45, accentFraction: 0.08,
  // 小圆点在两个方向衰减，覆盖率低于连续弧丝；补偿可见亮度，限制叠加峰值。
  coverageGain: 2.5, maxEmission: 0.55,
} as const

/** 雾核基础扩张倍率；相邻采样点分离时另自适应补足覆盖。 */
export const CME_MIST_RADIUS_SCALE = 1.5
export const CME_MIST_OPACITY = 0.32

/** 75% 近场柔光暖金色 + 25% 远场柔光灰白色，在线性色彩空间混合。 */
export const CME_MIST_COLORS = { warm: '#ffd19a', cool: '#c0c8dc', coolMix: 0.25 } as const
