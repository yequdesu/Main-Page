import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createDampedPulse } from '../stellarRecoil'
import { createLocalReconnection, createMagneticEvolution, createReorganizationRecoil, LOCAL_RECONNECTION, shortBundleLift, shortBundleCollapse, shortRetirementStart } from '../stellarReorganization'
import { createProminenceStructure } from '../stellarMorphology'
import { createFluxRopeSimulation } from '../stellarPlasma'

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

it('左右响应有独立时序，中央振幅小、衰减快；形变包含偏斜模态', () => {
  for (const seed of [0.17, 0.47, 0.79]) {
    const plan = createMagneticEvolution(createProminenceStructure(seed, 'one-sided').families)[0]
    const left = createReorganizationRecoil(plan, 1), right = createReorganizationRecoil(plan, 2), central = createReorganizationRecoil(plan, 3)
    expect(left.period).not.toBe(right.period)
    expect(left.start).not.toBe(right.start)
    expect(left.amplitude).toBeGreaterThanOrEqual(0.24)
    expect(right.amplitude).toBeGreaterThanOrEqual(0.24)
    expect(central.amplitude).toBeLessThan(Math.min(left.amplitude, right.amplitude) * 0.6)
    expect(central.decay).toBeGreaterThan(Math.max(left.decay, right.decay))
    expect(Math.abs(left.sample(left.crestAt).skew)).toBeGreaterThan(0.0001)
    const copy = { ...left.sample(left.crestAt) }
    left.sample(0); left.sample(36)
    expect(left.sample(left.crestAt)).toEqual(copy)
  }
})

it('几何回弹会跨越平衡高度；两侧离平衡越远响应越强，足点仍固定', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'bilateral').families)[0]
  const rank = 1, branch = 1, recoil = createReorganizationRecoil(plan, branch)
  const make = (high: number) => createLocalReconnection(plan, [0], (s, _strand, out) => out.set(2 * s - 1, high * Math.sin(Math.PI * s), 0), () => rank)
  const low = make(0.25), high = make(1.2), p = new Vector3()
  const equilibrium = 2 * (0.12 + 0.06 * plan.background) * 0.68 * (1 - 0.22 * rank)
  const base = (age: number) => equilibrium * (1 + shortBundleLift(plan, age)) * (1 - 0.97 * shortBundleCollapse(plan, age))
  const trough = recoil.troughAt + recoil.period, crest = recoil.crestAt
  for (const geometry of [low, high]) {
    expect(geometry.sample(0.5, 0, branch, trough, p).y).toBeLessThan(base(trough))
    expect(geometry.sample(0.5, 0, branch, crest, p).y).toBeGreaterThan(base(crest))
    const feet = [0, 1].map(s => geometry.sample(s, 0, branch, plan.contact, new Vector3()))
    for (const age of [crest, trough, plan.contact + LOCAL_RECONNECTION.exchange + 1]) for (const s of [0, 1]) expect(geometry.sample(s, 0, branch, age, p).distanceTo(feet[s])).toBeLessThan(1e-8)
  }
  expect(high.sample(0.5, 0, branch, crest, p).y - base(crest)).toBeGreaterThan(low.sample(0.5, 0, branch, crest, p).y - base(crest))
  expect(high.sample(0.5, 0, branch, crest, p).y - base(crest)).toBeLessThan(equilibrium * 0.45)
})

it('实际两侧线束先上抬，再一致快速下降；剩余丝线继续整体收拢，回退可复现', () => {
  const model = createFluxRopeSimulation(0.47, false, 'one-sided'), route = model.reorganization!, plan = route.plan
  const top = shortRetirementStart(plan), start = top - LOCAL_RECONNECTION.hold, bottom = top + LOCAL_RECONNECTION.bundleFall
  const heights = (age: number) => {
    model.advanceTo(age)
    return [1, 2].map(branch => [...route.selected].map(strand => {
      const offset = (branch * 12 + strand) * 113 * 4
      const ground = (model.curveData[offset + 1] + model.curveData[offset + 112 * 4 + 1]) / 2
      return Math.max(...Array.from({ length: 113 }, (_, i) => model.curveData[offset + i * 4 + 1])) - ground
    }))
  }
  const initial = heights(start), raised = heights(top), lowered = heights(bottom)
  for (let b = 0; b < 2; b++) {
    const ratios = lowered[b].map((height, i) => height / raised[b][i])
    for (let i = 0; i < raised[b].length; i++) {
      expect(raised[b][i]).toBeGreaterThan(initial[b][i] * 1.25)
      expect(ratios[i]).toBeLessThan(0.30)
      expect(ratios[i]).toBeGreaterThan(0.15)
    }
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.04)
  }
  const lowerStill = heights((bottom + plan.finish) / 2)
  for (let b = 0; b < 2; b++) for (let i = 0; i < lowerStill[b].length; i++) expect(lowerStill[b][i]).toBeLessThan(lowered[b][i] * 0.7)
  const saved = model.curveData.slice(), ink = model.redrawData.slice(), age = (bottom + plan.finish) / 2
  model.advanceTo(start)
  for (let t = start; t < age; t += 1 / 30) model.advanceTo(t)
  model.advanceTo(age)
  expect(model.curveData).toEqual(saved)
  expect(model.redrawData).toEqual(ink)
})
