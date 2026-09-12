import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createMagneticEvolution, createLocalReconnection, LOCAL_RECONNECTION, SHORT_JOIN, reorganizationRedraw, shortRetirementStart, centralStrandStart, centralStrandCount, centralStrandRetained, createCentralRecoil, CENTRAL_JOIN, reorganizationSource } from '../stellarReorganization'
import { createProminenceStructure, PROMINENCE_MORPHOLOGIES } from '../stellarMorphology'
import { createFilamentRenewal, traceFront } from '../stellarRedraw'
import { createMagneticLifecycle } from '../stellarLifecycle'
import { createFluxRopeSimulation, PLASMA } from '../stellarPlasma'

it('每个环系独立演化，受约束构型包含另一种组成及其自然生命周期', () => {
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

it('短环连续接近主环外肩，约束不改变高度，各支锚定在磁通区域内的不同位置', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0]
  const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0)
  const model = createLocalReconnection(plan, [0], main)
  const p = new Vector3(), [a, b, c, d] = model.regions.get(0)!
  const [sideD, centralD, centralC, sideC] = model.anchors.get(0)!
  expect(sideD.distanceTo(centralD)).toBeCloseTo(4 * LOCAL_RECONNECTION.corridorGap)
  expect(sideC.distanceTo(centralC)).toBeCloseTo(4 * LOCAL_RECONNECTION.corridorGap)
  expect(sideD.clone().lerp(centralD, 0.5)).toEqual(d)
  expect(sideC.clone().lerp(centralC, 0.5)).toEqual(c)
  for (const age of [plan.approach, plan.contact, plan.contact + 1, plan.finish]) {
    for (const [branch, start, end] of [[0, a, b], [1, a, sideD], [2, sideC, b], [3, centralD, centralC]] as const) {
      expect(model.sample(0, 0, branch, age, p).distanceTo(start)).toBeLessThan(1e-8)
      expect(model.sample(1, 0, branch, age, p).distanceTo(end)).toBeLessThan(1e-8)
    }
  }
  for (const [branch, join, q] of [[1, SHORT_JOIN.left, SHORT_JOIN.mainLeft], [2, SHORT_JOIN.right, SHORT_JOIN.mainRight], [3, CENTRAL_JOIN.left, CENTRAL_JOIN.mainLeft], [3, CENTRAL_JOIN.right, CENTRAL_JOIN.mainRight]]) {
    const ready = model.sample(join, 0, branch, plan.contact, new Vector3())
    main(q, 0, p)
    expect(ready.y).toBeCloseTo(p.y, 10)
    expect(ready.z).toBeCloseTo(p.z, 10)
    // 交接保持高度连续；走廊附近允许小范围横向约束，不再要求两条场线精确重合。
    expect(Math.abs(ready.x - p.x)).toBeLessThan(0.08)
    expect(model.sample(join, 0, branch, plan.approach, p).y).toBeLessThan(ready.y * 0.03)
    const e = 1e-6
    const incoming = ready.clone().sub(model.sample(join - e, 0, branch, plan.contact, new Vector3())).divideScalar(e)
    const outgoing = model.sample(join + e, 0, branch, plan.contact, new Vector3()).sub(ready).divideScalar(e)
    expect(incoming.distanceTo(outgoing)).toBeLessThan(0.001)
    expect(model.sample(join, 0, branch, plan.contact + e, p).distanceTo(ready)).toBeLessThan(1e-6)
  }
})

it('主环快速交接，两侧整束回落而丝线仍错峰擦除', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0]
  const ink = (dt: number, rank: number, branch: number) => reorganizationRedraw(plan, plan.contact + dt, rank, branch)
  expect(plan.contact + LOCAL_RECONNECTION.exchange - plan.approach).toBeLessThan(1)
  expect(plan.finish).toBeLessThan(plan.timing.end)
  expect(ink(0.2, 0, 0)).toBeLessThan(ink(0.2, 1, 0))
  expect(ink(-0.01, 1, 1)).toBeGreaterThan(0)
  for (let j = 0; j <= 100; j++) for (const rank of [0, 0.5, 1]) {
    const dt = j / 100 * LOCAL_RECONNECTION.exchange
    if (centralStrandRetained(plan, rank)) expect(ink(dt, rank, 0) + reorganizationRedraw(plan, plan.contact + dt, rank, 3, 0.5, 0.5, 1, 0.5)).toBeCloseTo(1, 8)
  }
  for (const rank of [0, 0.5, 1]) {
    expect(ink(LOCAL_RECONNECTION.exchange, rank, 0)).toBe(0)
    expect(ink(LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.settle, rank, 1)).toBe(1)
    expect(reorganizationRedraw(plan, plan.finish, rank, 1)).toBe(0)
    expect(reorganizationRedraw(plan, plan.finish, rank, 2)).toBe(0)
  }
  const retire = shortRetirementStart(plan)
  const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0)
  const geometry = createLocalReconnection(plan, [0, 1], main, strand => strand)
  const held = plan.sides[0].riseStart, late = retire - 0.01
  expect(geometry.sample(0.5, 0, 1, held, new Vector3()).distanceTo(geometry.sample(0.5, 0, 1, late, new Vector3()))).toBeGreaterThan(0.001)
  expect(reorganizationRedraw(plan, held, 0, 1)).toBe(1)
  expect(reorganizationRedraw(plan, late, 0, 1)).toBe(1)
  for (let i = 0; i < plan.strands; i++) {
    const rank = i / (plan.strands - 1), start = retire + i * LOCAL_RECONNECTION.strandInterval
    expect(reorganizationRedraw(plan, start, rank, 1)).toBe(1)
    expect(reorganizationRedraw(plan, start + LOCAL_RECONNECTION.collapse + 1e-8, rank, 1)).toBe(0)
  }
  const midway = retire + LOCAL_RECONNECTION.collapse
  // 外层虽已擦除，其几何仍与内层一起下降，不再先独自坍缩到地表。
  const outer = geometry.sample(0.5, 0, 1, midway, new Vector3()).y
  const inner = geometry.sample(0.5, 1, 1, midway, new Vector3()).y / 0.78
  expect(outer / inner).toBeCloseTo(1, 1)
  expect(reorganizationRedraw(plan, midway, 1, 1)).toBe(1)
})

it('固定容量中不断引入新代，内层退出后槽位回收，稳定前减速并保留最后一批', () => {
  const timing = { birth: 1, grown: 6, settled: 8, decay: 20, end: 36 }
  for (const count of [2, 4, 12]) {
    const pool = createFilamentRenewal(timing, count, 0.47), seen = new Set<number>()
    for (let age = 1; age <= 8; age += 1 / 120) {
      pool.update(age)
      const ids = Array.from(pool.generations).filter(g => g >= 0).sort((a, b) => a - b)
      expect(ids.length).toBeLessThanOrEqual(count)
      expect(new Set(ids).size).toBe(ids.length)
      ids.forEach(g => seen.add(g))
      for (let i = 1; i < ids.length; i++) expect(ids[i] - ids[i - 1]).toBe(1)
      expect(pool.visibility.every(v => v >= 0 && v <= 1)).toBe(true)
    }
    expect(seen.size).toBeGreaterThan(count)
    for (let i = 1; i < pool.growthTotal; i++) expect(pool.births[i] - pool.births[i - 1]).toBeGreaterThanOrEqual(0.24)
    const replacedAt = pool.births[count]
    pool.update(replacedAt - 1e-8)
    expect(pool.generations[0]).toBe(0)
    expect(pool.visibility[0]).toBeLessThan(1e-8)
    pool.update(replacedAt + 1e-8)
    expect(pool.generations[0]).toBe(count)
    expect(pool.visibility[0]).toBeLessThan(1e-8)
    pool.update(8)
    const frozen = pool.generations.slice(), layers = pool.layers.slice()
    expect(pool.visibility.every(v => v === 1)).toBe(true)
    pool.update(18)
    expect(pool.generations).toEqual(frozen); expect(pool.layers).toEqual(layers)
    pool.update(2); pool.update(8)
    expect(pool.generations).toEqual(frozen)
  }

})

it('换代生成新的外层几何，端点不动，沿线绘制可见度随弧长推进', () => {
  const model = createFluxRopeSimulation(0.47, false, 'isolated'), pool = model.renewals[0]!
  const age = pool.births[pool.count], p = new Vector3()
  const feet = [0, 1].map(s => model.sample(s, 0, 0, new Vector3()))
  model.advanceTo(age - 1 / 120)
  const old = model.sample(0.5, 0, 0, new Vector3()), previous = model.strandGenerations[0]
  model.advanceTo(age + 1 / 120)
  expect(model.strandGenerations[0]).toBeGreaterThan(previous)
  expect(model.sample(0.5, 0, 0, p).y - old.y).toBeGreaterThan(0.01)
  for (const s of [0, 1]) expect(model.sample(s, 0, 0, p).distanceTo(feet[s])).toBeLessThan(1e-8)
  model.advanceTo(age + 0.08)
  const values = Array.from({ length: 113 }, (_, j) => model.redrawData[j * 4])
  expect(values.some(v => v > 0.9)).toBe(true)
  expect(values.some(v => v === 0)).toBe(true)
  const direction = model.strandDirections[0]
  expect(direction > 0 ? values[8] > values[100] : values[8] < values[100]).toBe(true)
  expect(model.arcLengths[0]).toBe(0); expect(model.arcLengths[112]).toBeCloseTo(1)
  for (let j = 1; j < 113; j++) expect(model.arcLengths[j]).toBeGreaterThanOrEqual(model.arcLengths[j - 1])

})

it('重绘跨帧率重放，主环完整退出，示踪团块与所在整条丝线的可见度一致', () => {
  const seed = Array.from({ length: 100 }, (_, i) => i / 100).find(s => createMagneticEvolution(createProminenceStructure(s, 'crossed').families).some(p => p.reorganizes))!
  const direct = createFluxRopeSimulation(seed, false, 'crossed'), played = createFluxRopeSimulation(seed, false, 'crossed')
  const reorg = direct.reorganization!, age = reorg.plan.contact + 0.32
  direct.advanceTo(age)
  // 两者都从出生开始积分；在本次变更的预生长/交接窗口逐帧读出路径。
  const replayStart = reorg.plan.approach - 0.5
  played.advanceTo(replayStart)
  for (let t = replayStart + 1 / 30; t < age; t += 1 / 30) played.advanceTo(t)
  played.advanceTo(age)
  expect(played.curveData).toEqual(direct.curveData)
  expect(played.redrawData).toEqual(direct.redrawData)
  expect(played.centers).toEqual(direct.centers)
  expect(direct.parcelVisibility.some(a => a === 0)).toBe(true)
  for (let i = 0; i < direct.position.length; i++) {
    const strand = Math.floor(i / PLASMA.parcelsPerStrand), cell = direct.position[i] * 112
    const lo = Math.min(111, Math.floor(cell)), f = cell - lo
    const offset = ((direct.branches[i] * 12 + strand) * 113 + lo) * 4
    expect(direct.parcelVisibility[i]).toBeCloseTo(direct.redrawData[offset] * (1 - f) + direct.redrawData[offset + 4] * f, 6)
  }
  const familyIndex = direct.evolution.findIndex(p => p.reorganizes)
  expect(reorg.selected.size).toBe(direct.structure.families[familyIndex].strands)
  direct.advanceTo(reorg.plan.contact + LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.settle + 0.01)
  for (const strand of reorg.selected) {
    expect(direct.curveOpacity[strand]).toBe(0)
    expect(direct.curveOpacity[12 + strand]).toBe(1)
    expect(direct.curveOpacity[24 + strand]).toBe(1)
  }
  expect(direct.curveData.every(Number.isFinite)).toBe(true)
  expect(direct.redrawData.every(Number.isFinite)).toBe(true)
  expect(direct.position.length).toBe(PLASMA.strands * PLASMA.parcelsPerStrand)
  expect(direct.curveData.length).toBe(113 * 12 * 4 * 4)
  direct.advanceTo(36)
  expect(direct.curveOpacity.every(a => Math.abs(a) < 1e-6)).toBe(true)
}, 15000)


it('消退持续补入更低的新代，外层槽位优先回收，接管前冻结且普通末段清空', () => {
  const timing = { birth: 0, grown: 6, settled: 8, decay: 20, end: 36 }
  for (const count of [2, 7, 12]) for (const handoff of [undefined, 29]) {
    const pool = createFilamentRenewal(timing, count, 0.47, handoff)
    const replacements = Array.from(pool.births).slice(pool.growthTotal)
    expect(replacements.length).toBeGreaterThan(count)
    for (const born of replacements) {
      pool.update(born - 1e-6)
      const outer = Array.from(pool.layers).indexOf(Math.max(...pool.layers))
      const minimum = Math.min(...pool.layers), previous = pool.generations[outer]
      expect(pool.pointVisibility(outer, 0.5)).toBe(0)
      pool.update(born + 1e-6)
      expect(pool.generations[outer]).toBeGreaterThan(previous)
      expect(pool.layers[outer]).toBeLessThan(minimum)
    }
    pool.update(handoff ?? timing.end)
    expect(pool.visibility.every(v => v === (handoff === undefined ? 0 : 1))).toBe(true)
    const ids = pool.generations.slice(); pool.update(36)
    expect(pool.generations).toEqual(ids)
  }
})

it('相同方向的绘入和擦除依次经过弧长两端，中央过渡先承接后早于两侧退出', () => {
  for (const direction of [-1, 1]) {
    const source = direction > 0 ? 0.1 : 0.9, destination = 1 - source
    expect(traceFront(0.4, source, direction)).toBe(1)
    expect(traceFront(0.4, destination, direction)).toBe(0)
    expect(1 - traceFront(0.4, source, direction)).toBe(0)
    expect(1 - traceFront(0.4, destination, direction)).toBe(1)
  }
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0]
  const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0.08 * Math.sin(2 * Math.PI * s))
  const geometry = createLocalReconnection(plan, [0], main)
  for (let q = 0.42; q <= 0.58; q += 0.01) {
    const s = CENTRAL_JOIN.left + (q - CENTRAL_JOIN.mainLeft) * (CENTRAL_JOIN.right - CENTRAL_JOIN.left) / (CENTRAL_JOIN.mainRight - CENTRAL_JOIN.mainLeft)
    expect(reorganizationSource(s, 3)).toBeCloseTo(q)
    expect(geometry.sample(s, 0, 3, plan.contact, new Vector3()).distanceTo(main(q, 0, new Vector3()))).toBeLessThan(1e-9)
  }
  const exchanged = plan.contact + LOCAL_RECONNECTION.exchange
  expect(reorganizationRedraw(plan, exchanged, 0.5, 3)).toBe(1)
  const ended = centralStrandStart(plan, 1) + LOCAL_RECONNECTION.centralLower + LOCAL_RECONNECTION.centralErase + 1e-6
  for (const arc of [0, 0.2, 0.5, 0.8, 1]) expect(reorganizationRedraw(plan, ended, 0.5, 3, arc)).toBe(0)
  expect(reorganizationRedraw(plan, ended, 1, 1)).toBeGreaterThan(0)
})

it('中央短环由外向内逐条回落和沿线擦除，整个队列早于两侧退完', () => {
  for (const count of [2, 7, 12]) {
    const plan = { ...createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0], strands: count }
    const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0)
    const lastRank = (centralStrandCount(plan) - 1) * 2 / (count - 1)
    const geometry = createLocalReconnection(plan, [0, 1], main, strand => strand * lastRank)
    const first = centralStrandStart(plan, 0), last = centralStrandStart(plan, lastRank)
    expect(last - first).toBeCloseTo((centralStrandCount(plan) - 1) * LOCAL_RECONNECTION.centralInterval)
    for (let i = 0; i < count; i++) {
      const rank = i / (count - 1), eraseStart = centralStrandStart(plan, rank) + LOCAL_RECONNECTION.centralLower
      if (!centralStrandRetained(plan, rank)) continue
      for (const direction of [-1, 1]) {
        const source = direction > 0 ? 0.1 : 0.9, sink = 1 - source
        const mid = eraseStart + LOCAL_RECONNECTION.centralErase * 0.5
        expect(reorganizationRedraw(plan, eraseStart, rank, 3, 0.5)).toBe(1)
        expect(reorganizationRedraw(plan, mid, rank, 3, source, source, direction)).toBe(0)
        expect(reorganizationRedraw(plan, mid, rank, 3, sink, sink, direction)).toBe(1)
        expect(reorganizationRedraw(plan, eraseStart + LOCAL_RECONNECTION.centralErase + 1e-8, rank, 3)).toBe(0)
      }
    }
    const mid = first + LOCAL_RECONNECTION.centralLower + LOCAL_RECONNECTION.centralErase * 0.5
    const outerHeight = geometry.sample(0.5, 0, 3, mid, new Vector3()).y / geometry.sample(0.5, 0, 3, first + LOCAL_RECONNECTION.centralLower, new Vector3()).y
    const innerHeight = geometry.sample(0.5, 1, 3, mid, new Vector3()).y / geometry.sample(0.5, 1, 3, last + LOCAL_RECONNECTION.centralLower, new Vector3()).y
    if (count > 2) expect(outerHeight).toBeLessThan(innerHeight)
    const firstGone = first + LOCAL_RECONNECTION.centralLower + LOCAL_RECONNECTION.centralErase
    expect(reorganizationRedraw(plan, firstGone, 0, 3, 0.9)).toBeCloseTo(0)
    if (count > 2) expect(reorganizationRedraw(plan, firstGone, lastRank, 3, 0.9)).toBeGreaterThan(0)
    const centralEnd = last + LOCAL_RECONNECTION.centralLower + LOCAL_RECONNECTION.centralErase
    const sideEnd = shortRetirementStart(plan) + (count - 1) * LOCAL_RECONNECTION.strandInterval + LOCAL_RECONNECTION.collapse
    expect(centralEnd).toBeLessThan(sideEnd)
  }
})

it('从预生长到退场，中央与两侧的全部线段在磁通横轴投影中保持分离', () => {
  // 用独立的线段相交判定检查实际路径表，而不是重复走廊约束公式。
  type Point = [number, number]
  type Segment = [Point, Point]
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const intersects = ([a, b]: Segment, [c, d]: Segment) => {
    if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false
    return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0
  }
  for (const kind of ['bilateral', 'one-sided', 'isolated', 'crossed', 'nested'] as const) {
    const seed = [0.47, 0.17, 0.79, ...Array.from({ length: 100 }, (_, i) => i / 100)].find(seed => createMagneticEvolution(createProminenceStructure(seed, kind).families).some(p => p.reorganizes))!
    const model = createFluxRopeSimulation(seed, false, kind), route = model.reorganization!
    const plan = route.plan, axis = new Vector3(), a = new Vector3(), b = new Vector3()
    for (const feet of route.regions.values()) { a.add(feet[0]); b.add(feet[1]) }
    axis.subVectors(b, a); axis.y = 0; axis.normalize()
    const exchanged = plan.contact + LOCAL_RECONNECTION.exchange
    const ages = [plan.approach, plan.contact - 0.1, plan.contact, plan.contact + 0.25, ...[0, 0.02, 0.06, 0.10, 0.16, 0.24, 0.4, 0.56, 0.76, 1, 1.4].map(dt => exchanged + dt), ...plan.sides.flatMap(side => [side.riseStart, side.fallStart, side.fallStart + side.fallDuration * 0.5, side.fallStart + side.fallDuration, side.finish]), plan.finish, ...(() => { const r = createCentralRecoil(plan); return [r.troughAt, r.crestAt, r.troughAt + r.period] })()].sort((a, b) => a - b)
    for (const age of ages) {
      model.advanceTo(age)
      const segments = (branch: number) => {
        const result: Segment[] = []
        for (const strand of route.selected) {
          const points: Point[] = []
          for (let j = 0; j <= 112; j++) {
            const offset = ((branch * 12 + strand) * 113 + j) * 4
            points.push([model.curveData[offset] * axis.x + model.curveData[offset + 2] * axis.z, model.curveData[offset + 1]])
          }
          for (let j = 0; j < 112; j++) result.push([points[j], points[j + 1]])
        }
        return result
      }
      const central = segments(3)
      for (const side of [1, 2]) {
        const neighbor = segments(side)
        const crossing = central.some(c => neighbor.some(n => intersects(c, n)))
        expect(crossing, kind + ' seed=' + seed + ' age=' + age + ' branch=' + side).toBe(false)
      }
    }
  }
}, 20000)

it('保留的中央层与两侧共同交接，稀疏中央不额外提升单条亮度', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0]
  for (const direction of [-1, 1]) for (const rank of [0, 0.5, 1]) for (const dt of [0, 0.1, 0.3, 0.55, 0.65]) {
    for (let j = 0; j <= 100; j++) {
      const q = j / 100, age = plan.contact + dt
      let light = reorganizationRedraw(plan, age, rank, 0, q, q, direction, q)
      if (q <= SHORT_JOIN.mainLeft) {
        const s = q * SHORT_JOIN.left / SHORT_JOIN.mainLeft
        light += reorganizationRedraw(plan, age, rank, 1, s, q, direction, s)
      }
      if (q >= SHORT_JOIN.mainRight) {
        const s = SHORT_JOIN.right + (q - SHORT_JOIN.mainRight) * SHORT_JOIN.left / SHORT_JOIN.mainLeft
        light += reorganizationRedraw(plan, age, rank, 2, s, q, direction, s)
      }
      if (q >= CENTRAL_JOIN.mainLeft && q <= CENTRAL_JOIN.mainRight) {
        const s = CENTRAL_JOIN.left + (q - CENTRAL_JOIN.mainLeft) * (CENTRAL_JOIN.right - CENTRAL_JOIN.left) / (CENTRAL_JOIN.mainRight - CENTRAL_JOIN.mainLeft)
        light += reorganizationRedraw(plan, age, rank, 3, s, q, direction, s)
      }
      expect(light).toBeLessThanOrEqual(1 + 1e-8)
      if (centralStrandRetained(plan, rank)) expect(light).toBeCloseTo(1, 8)
    }
  }
})


it('仅中央可见丝线数量减半，交错选层；两侧完整保留', () => {
  for (const count of [2, 7, 12]) {
    const plan = { ...createMagneticEvolution(createProminenceStructure(0.47, 'isolated').families)[0], strands: count }
    const age = plan.contact + LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.settle
    const central = Array.from({ length: count }, (_, i) => reorganizationRedraw(plan, age, i / (count - 1), 3))
    expect(central.filter(v => v === 1)).toHaveLength(Math.ceil(count / 2))
    expect(central.every((v, i) => v === (i % 2 === 0 ? 1 : 0))).toBe(true)
    for (let i = 0; i < count; i++) for (const branch of [1, 2]) expect(reorganizationRedraw(plan, age, i / (count - 1), branch)).toBe(1)
  }
})
