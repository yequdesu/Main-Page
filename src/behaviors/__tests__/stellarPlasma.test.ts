import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { MAGNETIC } from '../stellarMagnetism'
import { PROMINENCE_MORPHOLOGIES } from '../stellarMorphology'
import {
  torusAcceleration, stepTorus, TORUS_CRITICAL_INDEX, createFluxRopeSimulation, PLASMA,
} from '../stellarPlasma'

it('环形失稳有真实稳定阈值，n=2 的解析极限连续，平衡半径没有伪加速度', () => {
  for (const n of [1.1, TORUS_CRITICAL_INDEX, 2, 2.6]) expect(torusAcceleration(1, n)).toBe(0)
  expect(torusAcceleration(1.001, TORUS_CRITICAL_INDEX - 0.1)).toBeLessThan(0)
  expect(torusAcceleration(1.001, TORUS_CRITICAL_INDEX + 0.1)).toBeGreaterThan(0)
  expect(torusAcceleration(2, 2 - 1e-7)).toBeCloseTo(torusAcceleration(2, 2 + 1e-7), 6)
  const stable = { radius: 1, velocity: 0.005 }, unstable = { ...stable }
  for (let i = 0; i < 1200; i++) {
    stepTorus(stable, 1 / 120, 1.1)
    stepTorus(unstable, 1 / 120, 2.5)
  }
  expect(Math.abs(stable.radius - 1)).toBeLessThan(0.02)
  expect(unstable.radius).toBeGreaterThan(5)
  expect(unstable.velocity).toBeGreaterThan(1)
})

it('RK4 在减半时间步后收敛；真实加速来自磁场衰减指数', () => {
  const fine = { radius: 1, velocity: 0.005 }, coarse = { ...fine }, slow = { ...fine }
  for (let i = 0; i < 1200; i++) stepTorus(fine, 1 / 120, 2.5)
  for (let i = 0; i < 600; i++) {
    stepTorus(coarse, 1 / 60, 2.5)
    stepTorus(slow, 1 / 60, 1.6)
  }
  expect(fine.radius).toBeCloseTo(coarse.radius, 7)
  expect(fine.velocity).toBeCloseTo(coarse.velocity, 7)
  expect(fine.radius).toBeGreaterThan(slow.radius * 2)
})

it('所有结构类型保持足点锚定，物质沿实际变化的路径运动', () => {
  const point = new Vector3()
  for (const { kind } of PROMINENCE_MORPHOLOGIES) {
    const model = createFluxRopeSimulation(0.3, false, kind)
    expect(model.structure.kind).toBe(kind)
    const feet = Array.from({ length: PLASMA.strands }, (_, i) => [model.sample(0, i, 0, new Vector3()).clone(), model.sample(1, i, 0, new Vector3()).clone()])
    const top = model.sample(0.45, 0, 0, new Vector3()).clone()
    model.advanceTo(5)
    expect(model.sample(0.45, 0, 0, point).distanceTo(top)).toBeGreaterThan(0.002)
    for (let strand = 0; strand < PLASMA.strands; strand++) for (let end = 0; end <= 1; end++) {
      expect(model.sample(end, strand, 0, point).distanceTo(feet[strand][end])).toBeLessThan(1e-8)
    }
    for (let i = 0; i < model.position.length; i++) {
      const strand = Math.floor(i / PLASMA.parcelsPerStrand)
      const actual = new Vector3().fromArray(model.centers, i * 3)
      expect(model.sample(model.position[i], strand, model.branches[i] as 0 | 1 | 2, point).distanceTo(actual)).toBeLessThan(0.004)
      expect(model.position[i]).toBeGreaterThan(0.025)
      expect(model.position[i]).toBeLessThan(0.975)
      expect(Number.isFinite(model.temperature[i])).toBe(true)
    }
  }
}, 20000)

it('沿场物质输运跨帧率一致，足点边界、温度与密度保持有限，膨胀使物质稀释', () => {
  const a = createFluxRopeSimulation(0.4, true), b = createFluxRopeSimulation(0.4, true)
  const quiet = createFluxRopeSimulation(0.4, false)
  for (let i = 1; i <= 600; i++) a.advanceTo(i / 60)
  for (let i = 1; i <= 300; i++) b.advanceTo(i / 30)
  quiet.advanceTo(10)
  expect(a.torus).toEqual(b.torus)
  expect(a.centers).toEqual(b.centers)
  expect(a.position).toEqual(b.position)
  expect(a.temperature).toEqual(b.temperature)
  for (let i = 0; i < a.position.length; i++) {
    expect(a.position[i]).toBeGreaterThanOrEqual(a.branches[i] === 1 ? 0 : 0.025)
    expect(a.position[i]).toBeLessThan(a.branches[i] === 1 ? 1 : 0.975)
    expect(a.temperature[i]).toBeGreaterThanOrEqual(0.08)
    expect(a.temperature[i]).toBeLessThanOrEqual(1.25)
    expect(Number.isFinite(a.density[i])).toBe(true)
  }
  for (let strand = 0; strand < PLASMA.strands; strand++) {
    const first = (PLASMA.strands + strand) * MAGNETIC.samples * 4
    const last = first + (MAGNETIC.samples - 1) * 4
    for (let dimension = 0; dimension < 4; dimension++) expect(a.curveData[first + dimension]).toBeCloseTo(a.curveData[last + dimension], 6)
  }
  expect(a.branches).toContain(1)
  expect(a.branches).toContain(2)
  expect(a.branches).not.toContain(0)
  for (let i = 0; i < a.density.length; i++) if (a.branches[i] === 1) expect(a.density[i]).toBeLessThan(quiet.density[i])
  expect(Math.min(...quiet.temperature)).toBeLessThan(0.4)
}, 20000)
