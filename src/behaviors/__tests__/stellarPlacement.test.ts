import { expect, it } from 'vitest'
import { createProminencePlacement } from '../stellarPlacement'
import { createProminenceStructure } from '../stellarMorphology'

const samples = Array.from({ length: 10000 }, (_, i) => createProminencePlacement(i / 10000))

it('活动区朝向双向覆盖 0–45°，尺寸限制在 85–145%，同种子可复现', () => {
  let total = 0, aboveMid = 0, positive = 0, angleTotal = 0
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]
    expect(p).toEqual(createProminencePlacement(i / 10000))
    expect(p.scale).toBeGreaterThanOrEqual(0.85); expect(p.scale).toBeLessThanOrEqual(1.45)
    expect(Math.abs(p.azimuth)).toBeLessThanOrEqual(Math.PI / 4)
    total += p.scale; angleTotal += Math.abs(p.azimuth)
    if (p.scale > 1.15) aboveMid++
    if (p.azimuth > 0) positive++
  }
  expect(total / samples.length).toBeGreaterThan(1.145)
  expect(total / samples.length).toBeLessThan(1.155)
  expect(aboveMid / samples.length).toBeGreaterThan(0.48)
  expect(aboveMid / samples.length).toBeLessThan(0.52)
  expect(positive / samples.length).toBeGreaterThan(0.47)
  expect(positive / samples.length).toBeLessThan(0.53)
  expect(angleTotal / samples.length * 180 / Math.PI).toBeGreaterThan(21)
  expect(angleTotal / samples.length * 180 / Math.PI).toBeLessThan(24)
  expect(Math.min(...samples.map(p => p.scale))).toBeLessThan(0.86)
  expect(Math.max(...samples.map(p => p.scale))).toBeGreaterThan(1.44)
  // 尺寸与朝向分开取样，不能让所有大环都朝同一侧或固定为正视。
  for (const direction of [-1, 1]) {
    const large = samples.filter(p => p.scale > 1.3 && Math.sign(p.azimuth) === direction)
    expect(large.some(p => Math.abs(p.azimuth) < Math.PI / 18)).toBe(true)
    expect(large.some(p => Math.abs(p.azimuth) > Math.PI * 2 / 9)).toBe(true)
  }
})

it('尺寸呈以 115% 为中心的截断高斯钟形，保留两侧尾部且不在上下界堆积', () => {
  const bins = [0, 0, 0, 0, 0, 0]
  const count = 100000 // 尾部概率较小，使用更大样本降低分箱波动。
  let variance = 0, boundaryCount = 0
  for (let i = 0; i < count; i++) {
    const { scale } = createProminencePlacement(i / count)
    if (scale <= 0.85 || scale >= 1.45) boundaryCount++
    bins[Math.min(5, Math.floor((scale - 0.85) / 0.1))]++
    variance += (scale - 1.15) ** 2
  }
  // 标准正态在 [-3,-2,-1,0,1,2,3] 的分箱概率，经 ±3σ 截断后归一化。
  const expected = [0.02146, 0.13627, 0.34227, 0.34227, 0.13627, 0.02146]
  expect(boundaryCount).toBe(0)
  bins.forEach((total, i) => expect(Math.abs(total / count - expected[i])).toBeLessThan(0.006))
  expect(Math.abs(Math.sqrt(variance / count) - 0.09866)).toBeLessThan(0.0015)
})

it('低矮环簇作为主类型或伴随类型时整组采用独立尺寸分布，朝向保持可复现', () => {
  for (const [kind, seed, clustered] of [['cluster', 0.47, true], ['nested', 0.79, true], ['nested', 0.47, false], ['bilateral', 0.79, false]] as const) {
    const structure = createProminenceStructure(seed, kind)
    expect(structure.kind === 'cluster' || structure.companion === 'cluster').toBe(clustered)
    const p = createProminencePlacement(seed, structure), ordinary = createProminencePlacement(seed)
    expect(p).toEqual(createProminencePlacement(seed, structure))
    expect(p.azimuth).toBe(ordinary.azimuth)
    if (clustered) {
      expect(p.scale).toBeGreaterThanOrEqual(0.85); expect(p.scale).toBeLessThanOrEqual(1.05)
      expect(p.scale).not.toBe(ordinary.scale)
    } else expect(p).toEqual(ordinary)
  }
})

it('低簇组合尺寸以 95% 为高斯中心，限制在 85–105% 且没有边界堆积', () => {
  const structure = createProminenceStructure(0.47, 'cluster')
  const count = 100000, sigma = 0.10 / 3, bins = [0, 0, 0, 0, 0, 0]
  let sum = 0, variance = 0, boundary = 0
  for (let i = 0; i < count; i++) {
    const { scale } = createProminencePlacement(i / count, structure)
    sum += scale; variance += (scale - 0.95) ** 2
    if (scale <= 0.85 || scale >= 1.05) boundary++
    bins[Math.min(5, Math.floor((scale - 0.85) / sigma))]++
  }
  expect(boundary).toBe(0)
  expect(Math.abs(sum / count - 0.95)).toBeLessThan(0.001)
  expect(Math.abs(Math.sqrt(variance / count) - sigma * 0.98658)).toBeLessThan(0.0005)
  const expected = [0.02146, 0.13627, 0.34227, 0.34227, 0.13627, 0.02146]
  bins.forEach((total, i) => expect(Math.abs(total / count - expected[i])).toBeLessThan(0.006))
})
