import { expect, it } from 'vitest'
import { cmePositionCDF, cmePositionDensity, sampleCmePosition } from '../stellarCmeDistribution'
import { createStellarLimbFrame, stellarLimbPhase } from '../stellarLimb'
import { getStructureLayout } from '../structureLayout'

it.each([390 / 844, 1, 16 / 9, 2.4])('视口 %s：全环归一化，左右中线均为平均的一半，可见弧段仅为偏好', aspect => {
  const frame = createStellarLimbFrame()
  frame.layout(getStructureLayout(aspect))
  const limit = frame.referenceLimit, a = limit / Math.PI, count = 40000
  let integral = 0
  for (let i = 0; i < count; i++) integral += cmePositionDensity(-1 + (i + 0.5) * 2 / count, limit) * 2 / count
  expect(integral).toBeCloseTo(1, 7)
  for (const x of [-1, 0, 1]) expect(cmePositionDensity(x, limit) / (integral / 2)).toBeCloseTo(0.5, 7)
  const preferredMass = cmePositionCDF(a, limit) - cmePositionCDF(-a, limit)
  expect(preferredMass).toBeGreaterThan(a) // 同长度弧段获得多于均匀分布的事件。
  expect(preferredMass).toBeLessThan(0.7)
  const rightMass = cmePositionCDF(0.5, limit) - cmePositionCDF(-0.5, limit)
  expect(rightMass).toBeCloseTo(0.675, 10)
  expect(1 - rightMass).toBeCloseTo(0.325, 10)
  for (const x of [-0.9, -0.65, -0.4, 0, 0.4, 0.65, 0.9]) {
    expect(cmePositionDensity(x, limit)).toBeGreaterThanOrEqual(0.25)
    expect(cmePositionDensity(x, limit)).toBe(cmePositionDensity(-x, limit))
  }
  // 弧段边界没有概率台阶或斜率折角，完整环周的接缝也连续。
  const h = 1e-7
  for (const x of [-a, 0, a]) {
    const left = (cmePositionDensity(x, limit) - cmePositionDensity(x - h, limit)) / h
    const right = (cmePositionDensity(x + h, limit) - cmePositionDensity(x, limit)) / h
    expect(left).toBeCloseTo(right, 2)
  }
  expect(cmePositionDensity(-1 + h, limit)).toBeCloseTo(cmePositionDensity(1 - h, limit), 12)
  expect(sampleCmePosition(0, limit)).toBe(-1)
  expect(sampleCmePosition(1, limit)).toBe(1)
  const quadrants = new Set<number>()
  for (let i = 1; i < 1000; i++) {
    const u = i / 1000, x = sampleCmePosition(u, limit)
    expect(cmePositionCDF(x, limit)).toBeCloseTo(u, 8)
    const angle = stellarLimbPhase(0.47, u * 2 - 1, 2, limit)
    expect(angle / Math.PI).toBeCloseTo(x, 10)
    quadrants.add(Math.floor((angle + Math.PI) / (Math.PI / 2)))
  }
  expect([...quadrants].sort()).toEqual([0, 1, 2, 3])
})
