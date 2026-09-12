/** 背景微光的数量和屏幕分布范围；同时用于 CME 尾迹的面积密度标尺。 */
export const STELLAR_RADIATION_DISTRIBUTION = {
  count: 72, heightSpan: 1.15, driftMin: 0.035, driftSpread: 0.04,
} as const
export const CME_SCREEN_SCALE = { width: 0.018, height: 0.035 } as const
export const CME_DISSIPATION = {
  delay: 0.04, stagger: 0.25, fade: 0.4,
  referenceAspect: 16 / 9, minTail: 4, maxTail: 16, tailMultiplier: 2,
} as const
export const CME_TAIL = {
  lifetime: 300, fadeStart: 240, transferDelay: 0.7, crossfade: 0.3,
  relaxation: 2.5, capacity: 384, eventEnd: 13,
} as const

/** 以 Act 4 常规构图下的椭圆包络估算；冻结预算，镜头缩放不会重新生成颗粒。 */
export function cmeBackgroundParticleBudget(width: number, height: number, seed: number) {
  const background = STELLAR_RADIATION_DISTRIBUTION, aspect = CME_DISSIPATION.referenceAspect
  const backgroundArea = background.heightSpan * (background.driftMin + background.driftSpread / 2)
  const scaleX = Math.min(CME_SCREEN_SCALE.width, CME_SCREEN_SCALE.height / aspect) * (0.9 + 0.2 * seed)
  const footprint = Math.PI / 4 * Math.max(0, width) * Math.max(0, height) * scaleX ** 2 * aspect
  const multiplier = CME_DISSIPATION.tailMultiplier
  return multiplier * Math.max(CME_DISSIPATION.minTail / multiplier, Math.min(CME_DISSIPATION.maxTail / multiplier, Math.ceil(background.count * footprint / backgroundArea)))
}
