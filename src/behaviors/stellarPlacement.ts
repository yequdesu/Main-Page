import { stellarRandom as random, sampleStellarGaussian } from './stellarRandom'
import type { ProminenceMorphology } from './stellarMorphology'

/** Act 4 普通磁拱的活动区摆放；与内部构型、运动时序使用不同的随机盐值。 */
export const PROMINENCE_PLACEMENT = { maxAzimuth: Math.PI / 4, minScale: 0.85, maxScale: 1.45, meanScale: 1.15, scaleSigma: 0.10 } as const
/** 包含低矮环簇的整组活动区：同时约束低簇与伴随结构，保留内部比例。 */
export const PROMINENCE_CLUSTER_SCALE = { mean: 0.95, sigma: 0.10 / 3, min: 0.85, max: 1.05 } as const

/** 每次创建模型时取样一次，播放、暂停、回退和窗口变化都复用同一方案。 */
export function createProminencePlacement(seed: number, structure?: { families: readonly { sourceKind: ProminenceMorphology | 'eruption' }[] }) {
  const p = PROMINENCE_PLACEMENT
  const distribution = structure?.families.some(family => family.sourceKind === 'cluster')
    ? PROMINENCE_CLUSTER_SCALE
    : { mean: p.meanScale, sigma: p.scaleSigma, min: p.minScale, max: p.maxScale }
  return {
    azimuth: (random(seed, 902) < 0.5 ? -1 : 1) * p.maxAzimuth * random(seed, 901),
    scale: sampleStellarGaussian(seed, 903, distribution),
  }
}
