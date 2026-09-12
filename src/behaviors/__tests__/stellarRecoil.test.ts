import { expect, it } from 'vitest'
import { createDampedPulse } from '../stellarRecoil'
import { createMagneticEvolution, createCentralRecoil } from '../stellarReorganization'
import { createProminenceStructure } from '../stellarMorphology'

it('脉冲从零位移和零速度开始，先过冲再回弹，后续振幅衰减且支持任意顺序采样', () => {
  for (const period of [0.36, 0.44, 0.59]) for (const decay of [1.5, 2.6]) {
    const mode = createDampedPulse(period, decay)
    expect(mode.sample(-1)).toBe(0)
    expect(Math.abs(mode.sample(1e-7) / 1e-7)).toBeLessThan(0.001)
    expect(mode.sample(mode.troughAt)).toBeCloseTo(-1, 8)
    expect(mode.crestAt).toBeGreaterThan(mode.troughAt)
    expect(mode.sample(mode.crestAt)).toBeGreaterThan(0.2)
    expect(mode.sample(mode.crestAt)).toBeLessThan(1)
    expect(Math.abs(mode.sample(mode.troughAt + period))).toBeLessThan(0.65)
    expect(Math.abs(mode.sample(8))).toBeLessThan(1e-5)
    const value = mode.sample(0.38)
    mode.sample(2); mode.sample(-2)
    expect(mode.sample(0.38)).toBe(value)
  }
})

it('中央继续使用较弱的可回放脉冲响应', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'one-sided').families)[0]
  const central = createCentralRecoil(plan)
  expect(central.amplitude).toBeGreaterThanOrEqual(0.054)
  expect(central.amplitude).toBeLessThanOrEqual(0.0675)
  const saved = { ...central.sample(central.crestAt) }
  central.sample(0); central.sample(36)
  expect(central.sample(central.crestAt)).toEqual(saved)
})
