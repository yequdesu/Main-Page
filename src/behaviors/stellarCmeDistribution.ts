/** x = θ / π ∈ [-1, 1]；中线密度是全环平均值的一半，优选弧段只增加概率。 */
export const CME_LIMB_DISTRIBUTION = {
  preferredWeight: 0.70,
  defaultLimit: Math.PI / 4,
} as const

const halfArc = (limit: number) => Math.max(0.001, Math.min(0.5, limit / Math.PI))

export function cmePositionDensity(x: number, referenceLimit: number = CME_LIMB_DISTRIBUTION.defaultLimit) {
  if (Math.abs(x) > 1) return 0
  const a = halfArc(referenceLimit), weight = CME_LIMB_DISTRIBUTION.preferredWeight
  const preferred = Math.abs(x) < a ? Math.sin(Math.PI * x / a) ** 2 / a : 0
  return 0.25 + 0.5 * ((1 - weight) * Math.sin(Math.PI * x) ** 2 + weight * preferred)
}

export function cmePositionCDF(x: number, referenceLimit: number = CME_LIMB_DISTRIBUTION.defaultLimit) {
  if (x <= -1) return 0
  if (x >= 1) return 1
  const a = halfArc(referenceLimit), weight = CME_LIMB_DISTRIBUTION.preferredWeight
  const global = (x + 1) / 2 - Math.sin(2 * Math.PI * x) / (4 * Math.PI)
  const preferred = x <= -a ? 0 : x >= a ? 1
    : (x + a) / (2 * a) - Math.sin(2 * Math.PI * x / a) / (4 * Math.PI)
  return 0.25 * (x + 1) + 0.5 * ((1 - weight) * global + weight * preferred)
}

/** 只在事件出生时求逆 CDF；相同分位数和出生布局可复现，不消耗额外随机数。 */
export function sampleCmePosition(u: number, referenceLimit: number = CME_LIMB_DISTRIBUTION.defaultLimit) {
  if (u <= 0) return -1
  if (u >= 1) return 1
  let low = -1, high = 1
  for (let i = 0; i < 36; i++) {
    const mid = (low + high) / 2
    if (cmePositionCDF(mid, referenceLimit) < u) low = mid
    else high = mid
  }
  return (low + high) / 2
}
