import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createArcBundle } from '../stellarArcConstraint'
import { createMagneticEvolution, createLocalReconnection, LOCAL_RECONNECTION } from '../stellarReorganization'
import { createProminenceStructure } from '../stellarMorphology'
import { createFluxRopeSimulation, PLASMA } from '../stellarPlasma'

it('最终三维丝线在交接、偏摆与收缩全过程满足弧长 ±20%，整束使用同一修正', () => {
  for (const seed of [0.17, 0.47, 0.79]) {
    const base = createMagneticEvolution(createProminenceStructure(seed, 'bilateral').families)[0]
    const plan = { ...base, sides: base.sides.map(s => ({ ...s, transverse: { ...s.transverse, driveGain: 3 } })) as typeof base.sides }
    const main = (s: number, rank: number, out: Vector3) => out.set(2 * s - 1, (0.8 - 0.2 * rank) * Math.sin(Math.PI * s), 0.11 * Math.sin(2 * Math.PI * s))
    const route = createLocalReconnection(plan, [0, 1, 2], main, strand => strand / 2)
    const p = new Vector3(), prev = new Vector3(), q = new Vector3(), prevQ = new Vector3()
    const ages = Array.from({ length: 81 }, (_, i) => plan.contact + (plan.finish - plan.contact) * i / 80)
    for (const age of ages) for (const branch of [1, 2]) {
      for (const strand of route.selected) {
        let length = 0, reference = 0
        for (let j = 0; j <= 112; j++) {
          route.sample(j / 112, strand, branch, age, p)
          route.sampleReference(j / 112, strand, branch, age, q)
          expect(p.toArray().every(Number.isFinite)).toBe(true)
          if (j) { length += p.distanceTo(prev); reference += q.distanceTo(prevQ) }
          else expect(p.distanceTo(q)).toBeLessThan(1e-10)
          if (j === 112) expect(p.distanceTo(q)).toBeLessThan(1e-10)
          prev.copy(p); prevQ.copy(q)
        }
        expect(Math.abs(length / reference - 1)).toBeLessThanOrEqual(0.20)
      }
    }
    // 同一事件可任意 seek，不依赖上一帧的约束修正或速度历史。
    const age = plan.contact + 1.2, saved = route.sample(0.43, 1, 1, age, new Vector3())
    route.sample(0.5, 0, 1, plan.finish, p); route.sample(0.5, 0, 2, plan.contact, p)
    expect(route.sample(0.43, 1, 1, age, p).distanceTo(saved)).toBeLessThan(1e-12)
  }
}, 15000)

it('渲染路径的参考弧长在低拱消退期间持续缩短，最大偏差统计与实际顶点一致', () => {
  for (const seed of [0.47, 0.79]) {
    const model = createFluxRopeSimulation(seed, false, 'bilateral'), route = model.reorganization!, plan = route.plan
    const prev = [Infinity, Infinity], p = new Vector3(), q = new Vector3()
    const start = Math.max(...plan.sides.map(s => s.fallStart), plan.contact + LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.settle)
    for (let i = 0; i <= 12; i++) {
      const age = Math.floor((start + (plan.finish - start) * i / 12) / PLASMA.step) * PLASMA.step
      model.advanceTo(age)
      const stats = route.arcDiagnostics().map(s => ({ ...s }))
      for (const branch of [1, 2]) {
        expect(stats[branch - 1].reference).toBeLessThanOrEqual(prev[branch - 1] + 1e-6)
        prev[branch - 1] = stats[branch - 1].reference
        let sum = 0
        for (const strand of route.selected) for (let j = 0; j <= 112; j++) {
          const offset = ((branch * 12 + strand) * 113 + j) * 4
          p.fromArray(model.curveData, offset)
          if (j) sum += p.distanceTo(q)
          q.copy(p)
        }
        expect(sum / route.selected.size).toBeCloseTo(stats[branch - 1].length, 5)
        expect(stats[branch - 1].maxStrain).toBeLessThanOrEqual(0.20)
      }
    }
  }
}, 15000)

it('超限长弧和过度压扁均投影回容差，保留端点并对整束使用同一形变比例', () => {
  for (const gain of [0.01, 6]) {
    const bundle = createArcBundle(3, (_s, p) => p), n = 113 * 3
    for (let i = 0; i < 3; i++) for (let j = 0; j <= 112; j++) {
      const s = j / 112, offset = i * n + j * 3, h = Math.sin(Math.PI * s) * (0.5 - i * 0.07)
      bundle.reference.set([s, h, 0.05 * Math.sin(2 * Math.PI * s)], offset)
      bundle.candidate.set([s, h * gain, 0.05 * Math.sin(2 * Math.PI * s)], offset)
    }
    bundle.project()
    expect(bundle.state.blend).toBeGreaterThan(0); expect(bundle.state.blend).toBeLessThan(1)
    expect(bundle.state.diagnostic.maxStrain).toBeLessThanOrEqual(0.20)
    const fractions = [0, 1, 2].map(i => {
      const offset = i * n + 56 * 3 + 1
      return (bundle.output[offset] - bundle.reference[offset]) / (bundle.candidate[offset] - bundle.reference[offset])
    })
    expect(Math.max(...fractions) - Math.min(...fractions)).toBeLessThan(1e-12)
    for (let i = 0; i < 3; i++) for (const j of [0, 112]) for (let k = 0; k < 3; k++) {
      const offset = i * n + j * 3 + k
      expect(bundle.output[offset]).toBeCloseTo(bundle.reference[offset], 10)
    }
  }
})
