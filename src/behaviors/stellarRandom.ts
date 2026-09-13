/** 恒星活动的确定性随机样本；盐值区分同一事件的不同参数。 */
export function stellarRandom(seed: number, salt: number) {
  let n = ((seed * 0xffffffff) >>> 0) ^ Math.imul(salt, 0x9e3779b9)
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296
}

/** Box–Muller 正态样本；越界后换盐重抽，避免在边界堆积概率。仅在方案创建时调用。 */
export function sampleStellarGaussian(seed: number, salt: number, distribution: { mean: number; sigma: number; min: number; max: number }) {
  let value: number, attempt = 0
  do {
    const u = 1 - stellarRandom(seed, salt + attempt * 2), v = stellarRandom(seed, salt + attempt * 2 + 1)
    value = distribution.mean + distribution.sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    attempt++
  } while (value < distribution.min || value > distribution.max)
  return value
}
