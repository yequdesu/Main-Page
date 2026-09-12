import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createMagneticEvolution, createLocalReconnection, LOCAL_RECONNECTION } from '../stellarReorganization'
import { createProminenceStructure, PROMINENCE_MORPHOLOGIES } from '../stellarMorphology'
import { createMagneticLifecycle } from '../stellarLifecycle'
import { createFluxRopeSimulation, PLASMA } from '../stellarPlasma'

it('每个环系独立演化，受约束构型始终保留另一种组成的支撑环', () => {
  for (const { kind } of PROMINENCE_MORPHOLOGIES) for (const seed of [0.17, 0.47, 0.79]) {
    const structure = createProminenceStructure(seed, kind), plans = createMagneticEvolution(structure.families, 32)
    expect(plans).toEqual(createMagneticEvolution(structure.families, 32))
    expect(new Set(plans.map(p => p.timing.grown)).size).toBe(plans.length)
    expect(new Set(plans.map(p => p.timing.decay)).size).toBe(plans.length)
    for (const p of plans) {
      expect(p.timing.end - p.timing.decay).toBeGreaterThan(12 - 1e-6)
      expect(p.timing.end).toBeLessThanOrEqual(32)
      expect(p.timing.decay).toBeGreaterThan(p.timing.settled)
    }
    if (structure.companion) for (const age of [0.5, 2, 28, 31.5]) {
      const kinds = new Set(structure.families.filter((_, i) => createMagneticLifecycle(32, seed, false, plans[i].timing).advanceTo(age).opacity > 0).map(f => f.sourceKind))
      expect(kinds.has(kind)).toBe(true)
      expect(kinds.has(structure.companion)).toBe(true)
    }
  }
})

it('宽大结构的重组有条件且可复现，始终保留直接回缩分支', () => {
  let direct = 0, reconnect = 0
  for (let i = 0; i < 100; i++) {
    const structure = createProminenceStructure(i / 100, 'isolated')
    const plans = createMagneticEvolution(structure.families)
    expect(plans.filter(p => p.reorganizes).length).toBeLessThanOrEqual(1)
    if (plans[0].reorganizes) reconnect++; else direct++
    const small = createMagneticEvolution([{ ...structure.families[0], width: 0.25 }])
    expect(small[0].reorganizes).toBe(false)
  }
  expect(direct).toBeGreaterThan(0); expect(reconnect).toBeGreaterThan(0)
})

it('接触瞬间新连接逐点覆盖旧连接，四个磁通区域不移动且无自由断头', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0]
  const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0)
  const model = createLocalReconnection(plan, [0], main)
  const points = Array.from({ length: 2 }, (_, branch) => Array.from({ length: 113 }, (_, i) => model.sample(i / 112, 0, branch, plan.contact, new Vector3())))
  expect(points[0][56].distanceTo(points[1][56])).toBeLessThan(1e-10)
  expect(model.capture(plan.contact)).toBe(true)
  const p = new Vector3()
  for (let branch = 0; branch < 2; branch++) for (let i = 0; i < 113; i++) {
    const source = i <= 56 ? branch : 1 - branch
    expect(model.sample(i / 112, 0, branch, plan.contact, p).distanceTo(points[source][i])).toBeLessThan(1e-10)
    expect(model.sample(i / 112, 0, branch, plan.contact + 1e-5, p).distanceTo(points[source][i])).toBeLessThan(1e-6)
  }
  const [a, b, c, d] = model.regions.get(0)!
  for (const age of [plan.contact, plan.contact + 2, plan.finish]) {
    for (const [branch, start, end] of [[0, a, d], [1, c, b]] as const) {
      expect(model.sample(0, 0, branch, age, p).distanceTo(start)).toBeLessThan(1e-8)
      expect(model.sample(1, 0, branch, age, p).distanceTo(end)).toBeLessThan(1e-8)
    }
  }
  expect(model.visibility(plan.finish, 0)).toBe(0)
})

it('换接接头快速圆滑，桥接两端切向连续，整个换接过渡不超过 1.5 秒', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0]
  const model = createLocalReconnection(plan, [0], (s, _strand, out) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0))
  model.capture(plan.contact)
  expect(LOCAL_RECONNECTION.approach + LOCAL_RECONNECTION.settle).toBeLessThanOrEqual(1.5)
  const age = plan.contact + LOCAL_RECONNECTION.rounding, epsilon = 1e-6
  for (const branch of [0, 1]) for (const join of [0.38, 0.62]) {
    const p = model.sample(join, 0, branch, age, new Vector3())
    const left = model.sample(join - epsilon, 0, branch, age, new Vector3())
    const right = model.sample(join + epsilon, 0, branch, age, new Vector3())
    const incoming = p.clone().sub(left).divideScalar(epsilon), outgoing = right.sub(p).divideScalar(epsilon)
    expect(incoming.distanceTo(outgoing)).toBeLessThan(0.001)
  }
})

it('重组事件可跨帧率重放，同一主环完整换接，资源预算固定', () => {
  const seed = Array.from({ length: 100 }, (_, i) => i / 100).find(s => createMagneticEvolution(createProminenceStructure(s, 'crossed').families).some(p => p.reorganizes))!
  const direct = createFluxRopeSimulation(seed, false, 'crossed'), played = createFluxRopeSimulation(seed, false, 'crossed')
  const reorg = direct.reorganization!
  const age = reorg.plan.contact + 2
  direct.advanceTo(age)
  for (let t = 1 / 30; t < age; t += 1 / 30) played.advanceTo(t)
  played.advanceTo(age)
  expect(played.curveData).toEqual(direct.curveData)
  expect(played.centers).toEqual(direct.centers)
  expect(direct.curveOpacity.some(a => a > 0.5)).toBe(true)
  const familyIndex = direct.evolution.findIndex(p => p.reorganizes)
  expect(reorg.selected.size).toBe(direct.structure.families[familyIndex].strands)
  for (const strand of reorg.selected) {
    const [a, b, c, d] = reorg.regions.get(strand)!
    expect(direct.sample(0, strand, 0, new Vector3()).distanceTo(a)).toBeLessThan(1e-8)
    expect(direct.sample(1, strand, 0, new Vector3()).distanceTo(d)).toBeLessThan(1e-8)
    expect(direct.sample(0, strand, 1, new Vector3()).distanceTo(c)).toBeLessThan(1e-8)
    expect(direct.sample(1, strand, 1, new Vector3()).distanceTo(b)).toBeLessThan(1e-8)
    expect(direct.curveOpacity[24 + strand]).toBe(0)
  }
  expect(direct.curveData.every(Number.isFinite)).toBe(true)
  expect(direct.position.length).toBe(PLASMA.strands * PLASMA.parcelsPerStrand)
  expect(direct.curveData.length).toBe(113 * 12 * 3 * 4)
  direct.advanceTo(36)
  expect(direct.curveOpacity.every(a => Math.abs(a) < 1e-6)).toBe(true)
}, 15000)
