import { expect, it } from 'vitest'
import { createShortLoopPlans, createShortLoopMotion, shortLoopProfile, shortLoopDeflection, shortLoopArcLength, shortLoopRestShape } from '../stellarShortLoop'
import { createFluxRopeSimulation } from '../stellarPlasma'
import { Vector3 } from 'three'
import { createLocalReconnection, createMagneticEvolution, LOCAL_RECONNECTION } from '../stellarReorganization'
import { createProminenceStructure } from '../stellarMorphology'

it('主环断裂初期两侧向外拉开，更强推力让拱顶更快靠近外侧足点', () => {
  for (const seed of [0.17, 0.47, 0.79]) for (const [i, side] of createShortLoopPlans(seed, 10.65, 9, 10).entries()) {
    const direction = i === 0 ? -1 : 1
    expect(Math.sign(side.transverse.kick)).toBe(direction)
    const strong = createShortLoopMotion(side)
    const previous = createShortLoopMotion({ ...side, transverse: { ...side.transverse, driveGain: 1.5 } })
    const outward = strong.sample(10.55).sway * direction
    expect(outward).toBeGreaterThan(0.20)
    expect(outward).toBeGreaterThan(previous.sample(10.55).sway * direction * 1.15)
  }
})

it('降低横向刚度后过冲增大且回摆变慢，激发推力不随刚度一并减小', () => {
  const peak = (plan: ReturnType<typeof createShortLoopPlans>[0]) => {
    const motion = createShortLoopMotion(plan), sign = Math.sign(plan.transverse.kick)
    let first = 0, reverse = 0, time = 0
    for (let t = 10; t < plan.finish; t += 0.005) {
      const value = motion.sample(t).sway * sign
      if (value > first) { first = value; time = t }
      reverse = Math.max(reverse, -value)
    }
    return { first, reverse, time }
  }
  for (const seed of [0.17, 0.47, 0.79]) for (const plan of createShortLoopPlans(seed, 10.65, 9, 10)) {
    const softer = peak(plan)
    const stiff = peak({ ...plan, transverse: { ...plan.transverse, stiffnessScale: 1 } })
    const previous = peak({ ...plan, transverse: { ...plan.transverse, stiffnessScale: 1, driveGain: 1, maxDisplacement: 0.15 } })
    expect(softer.first).toBeGreaterThan(stiff.first * 1.15)
    expect(softer.time - stiff.time).toBeGreaterThan(0.075)
    expect(softer.first).toBeGreaterThan(previous.first * 1.45)
    expect(softer.reverse).toBeGreaterThan(0.015)
  }
})

it('大幅侧倾时足点不移动，根部切向可转动，两腿迟滞不额外推动拱顶', () => {
  const p = { x: 0, y: 0, z: 0 }, baseline = { ...p }
  for (const seed of [0.17, 0.47, 0.79]) for (const plan of createShortLoopPlans(seed, 10.65, 9, 10)) {
    const motion = createShortLoopMotion(plan), peaks = [0, 0], oldPeaks = [0, 0], slope = [0, 0]
    for (let t = 10; t < plan.finish; t += 0.02) {
      const shape = motion.sample(t), old = { ...shape, legLeft: 0, legRight: 0 }
      for (const s of [0, 1]) {
        shortLoopDeflection(s, shape, p)
        expect(p.x).toBeCloseTo(0, 12); expect(p.y).toBe(1); expect(p.z).toBeCloseTo(0, 12)
      }
      shortLoopDeflection(0.5, shape, p); shortLoopDeflection(0.5, old, baseline)
      expect(p).toEqual(baseline)
      for (const [i, s] of [0.1, 0.9].entries()) {
        shortLoopDeflection(s, shape, p); shortLoopDeflection(s, old, baseline)
        peaks[i] = Math.max(peaks[i], Math.abs(p.x)); oldPeaks[i] = Math.max(oldPeaks[i], Math.abs(baseline.x))
        const epsilon = 1e-5
        shortLoopDeflection(i === 0 ? epsilon : 1 - epsilon, shape, p)
        slope[i] = Math.max(slope[i], Math.abs(p.x / epsilon))
      }
    }
    for (let i = 0; i < 2; i++) {
      expect(peaks[i]).toBeGreaterThan(0.025)
      expect(Math.abs(peaks[i] - oldPeaks[i])).toBeGreaterThan(0.001)
      expect(slope[i]).toBeGreaterThan(0.12)
    }
  }
})

it('每个短环的两条环腿以不同延迟跟随，先响应的环腿由种子决定', () => {
  const leading = new Set<number>()
  for (let i = 0; i < 30; i++) for (const plan of createShortLoopPlans(i / 30, 10.65, 9, 10)) {
    const motion = createShortLoopMotion(plan), peaks = [0, 0], times = [0, 0]
    for (let t = 10; t < 11.1; t += 0.005) {
      const shape = motion.sample(t)
      for (const [j, value] of [shape.legLeft, shape.legRight].entries()) if (Math.abs(value) > peaks[j]) {
        peaks[j] = Math.abs(value); times[j] = t
      }
    }
    expect(Math.abs(times[0] - times[1])).toBeGreaterThan(0.025)
    leading.add(times[0] < times[1] ? 0 : 1)
    const saved = { ...motion.sample(10.55) }
    motion.sample(plan.finish); motion.sample(0)
    expect(motion.sample(10.55)).toEqual(saved)
  }
  expect(leading.size).toBe(2)
})

it('增强的根部弯曲传入受空间约束的实际路径，四个端点仍固定', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'bilateral').families).find(p => p.reorganizes)!
  const oldPlan = { ...plan, sides: plan.sides.map(s => ({ ...s, transverse: { ...s.transverse, legGain: [0, 0] } })) as typeof plan.sides }
  const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0)
  const live = createLocalReconnection(plan, [0], main), old = createLocalReconnection(oldPlan, [0], main)
  const p = new Vector3(), q = new Vector3()
  for (const branch of [1, 2]) {
    const movement = [0, 0], feet = [live.sample(0, 0, branch, plan.contact, new Vector3()), live.sample(1, 0, branch, plan.contact, new Vector3())]
    for (let t = plan.contact; t < plan.contact + 1.8; t += 0.02) {
      for (const s of [0, 1]) expect(live.sample(s, 0, branch, t, p).distanceTo(feet[s])).toBeLessThan(1e-10)
      for (const [i, s] of [0.1, 0.9].entries()) {
        live.sample(s, 0, branch, t, p); old.sample(s, 0, branch, t, q)
        movement[i] = Math.max(movement[i], Math.abs(p.x - q.x))
      }
    }
    for (const distance of movement) expect(distance).toBeGreaterThan(0.001)
  }
})

it('横向冲击在交接中形成明显过冲，随后反向回摆并衰减；左右响应可复现且不同', () => {
  const directions = new Set<number>()
  for (let i = 0; i < 30; i++) {
    const sides = createShortLoopPlans(i / 30, 10.65, 9, 10)
    expect(sides).toEqual(createShortLoopPlans(i / 30, 10.65, 9, 10))
    expect(sides[0].transverse.period).not.toBe(sides[1].transverse.period)
    for (const side of sides) {
      const motion = createShortLoopMotion(side), sign = Math.sign(side.transverse.kick)
      directions.add(sign)
      expect(motion.sample(10).sway).toBe(0)
      const samples = Array.from({ length: 301 }, (_, n) => motion.sample(10 + n / 100).sway * sign)
      // 在交接完成前就清楚偏移；回摆的幅度小于首次过冲，末期趋于平衡。
      expect(Math.max(...samples.slice(0, 65))).toBeGreaterThan(0.055)
      expect(Math.max(...samples)).toBeLessThan(0.46)
      expect(Math.min(...samples)).toBeLessThan(-0.01)
      expect(Math.abs(Math.min(...samples))).toBeLessThan(Math.max(...samples))
      expect(Math.abs(motion.sample(side.finish).sway)).toBeLessThan(0.02)
      const saved = { ...motion.sample(10.5) }
      motion.sample(side.finish); motion.sample(0)
      expect(motion.sample(10.5)).toEqual(saved)
    }
  }
  expect(directions.size).toBe(2)
})

it('共同张力使横摆影响高度，上下激发也反馈横摆；足点始终固定', () => {
  for (const side of createShortLoopPlans(0.47, 10.65, 9, 10)) {
    const motion = createShortLoopMotion(side)
    const quiet = createShortLoopMotion({ ...side, transverse: { ...side.transverse, kick: 0 } })
    const pushed = createShortLoopMotion({ ...side, kick: side.kick * 3, pulses: side.pulses.map(p => ({ ...p, force: p.force * 3 })) })
    const point = { x: 0, y: 0, z: 0 }
    let heightDifference = 0, horizontalDifference = 0
    for (let t = 10; t < side.finish; t += 0.025) {
      const shape = motion.sample(t), base = quiet.sample(t)
      heightDifference = Math.max(heightDifference, Math.abs(shape.height - base.height))
      horizontalDifference = Math.max(horizontalDifference, Math.abs(shape.sway - pushed.sample(t).sway))
      for (const s of [0, 1]) {
        shortLoopProfile(s, 0.5, side, shape, point)
        expect(point.x).toBeCloseTo(s, 10); expect(point.y).toBeCloseTo(0, 10); expect(point.z).toBeCloseTo(0, 10)
      }
    }
    expect(heightDifference).toBeGreaterThan(0.02)
    expect(horizontalDifference).toBeGreaterThan(0.002)
  }
})

it('实际弧长控制伸缩而非按位移硬截断；收缩参考及各方向形变最终归零', () => {
  for (const seed of [0.17, 0.47, 0.79]) for (const side of createShortLoopPlans(seed, 10.65, 9, 10)) {
    for (const aspect of [0.25, 0.45, 0.75]) {
      const motion = createShortLoopMotion(side, aspect)
      let lastRest = Infinity
      for (let age = side.fallStart; age < side.finish; age += 0.025) {
        const arc = motion.arc(age)
        expect(arc.reference).toBeLessThanOrEqual(lastRest + 1e-9); lastRest = arc.reference
        expect(Math.abs(arc.strain)).toBeLessThanOrEqual(0.20)
      }
      const end = motion.sample(side.finish)
      for (const value of Object.values(end)) expect(Math.abs(value)).toBeLessThan(1e-12)
      expect(shortLoopArcLength(side, end, aspect)).toBeCloseTo(1, 10)
      expect(shortLoopArcLength(side, shortLoopRestShape(side, side.finish), aspect)).toBeCloseTo(1, 10)
    }
  }
})

it('实际交接路径提前出现横向扰动，在激发和定形边界连续，中央支保持原有运动', () => {
  const plan = createMagneticEvolution(createProminenceStructure(0.47, 'bilateral').families).find(p => p.reorganizes)!
  const quietPlan = { ...plan, sides: plan.sides.map(s => ({ ...s, transverse: { ...s.transverse, kick: 0 } })) as typeof plan.sides }
  const main = (s: number, _strand: number, out: Vector3) => out.set(2 * s - 1, Math.sin(Math.PI * s), 0)
  const live = createLocalReconnection(plan, [0], main), quiet = createLocalReconnection(quietPlan, [0], main)
  const p = new Vector3(), q = new Vector3(), exchanged = plan.contact + LOCAL_RECONNECTION.exchange
  for (const branch of [1, 2]) {
    const t = plan.contact + 0.5
    expect(Math.abs(live.sample(0.5, 0, branch, t, p).x - quiet.sample(0.5, 0, branch, t, q).x)).toBeGreaterThan(0.025)
    for (const boundary of [plan.contact, plan.sides[branch - 1].transverse.start, exchanged, exchanged + LOCAL_RECONNECTION.settle]) {
      const epsilon = 1e-5
      live.sample(0.5, 0, branch, boundary - epsilon, p)
      live.sample(0.5, 0, branch, boundary + epsilon, q)
      expect(p.distanceTo(q)).toBeLessThan(0.0002)
    }
  }
  for (const age of [plan.contact + 0.3, exchanged, exchanged + 0.5]) {
    expect(live.sample(0.5, 0, 3, age, p)).toEqual(quiet.sample(0.5, 0, 3, age, q))
  }
})

it('左右起落有可见差异，先落和慢落的一侧随种子改变；参数可复现', () => {
  const first = new Set<number>(), slower = new Set<number>()
  for (let i = 0; i < 100; i++) {
    const sides = createShortLoopPlans(i / 100, 10, 9), [a, b] = sides
    expect(sides).toEqual(createShortLoopPlans(i / 100, 10, 9))
    expect(Math.abs(a.fallStart - b.fallStart)).toBeGreaterThanOrEqual(0.28 - 1e-9)
    expect(Math.abs(a.fallDuration - b.fallDuration)).toBeGreaterThanOrEqual(0.12 - 1e-9)
    expect(a.period).not.toBe(b.period)
    first.add(a.fallStart < b.fallStart ? 0 : 1)
    slower.add(a.fallDuration > b.fallDuration ? 0 : 1)
  }
  expect(first.size).toBe(2); expect(slower.size).toBe(2)
})

it('完整退场间隔明显且先退场侧随种子变化，延后不会截断事件尾部的擦除队列', () => {
  const firstSides = new Set<number>()
  for (let i = 0; i < 100; i++) for (const count of [2, 7, 12]) {
    const sides = createShortLoopPlans(i / 100, 10.65, count, 10)
    const first = sides[0].finish < sides[1].finish ? 0 : 1, last = 1 - first
    firstSides.add(first)
    const gap = sides[last].finish - sides[first].finish
    expect(gap).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(gap).toBeLessThanOrEqual(1.55 + 1e-9)
    expect(sides[last].fallDuration - sides[first].fallDuration).toBeGreaterThan(0.35)
  }
  expect(firstSides.size).toBe(2)
  for (let i = 0; i < 100; i++) for (const kind of ['isolated', 'bilateral', 'crossed', 'one-sided', 'nested', 'cluster'] as const) for (const duration of [30, 36, 38]) {
    const plans = createMagneticEvolution(createProminenceStructure(i / 100, kind).families, duration)
    for (const plan of plans) if (plan.reorganizes) {
      expect(plan.finish).toBeLessThanOrEqual(plan.timing.end - 0.05 + 1e-9)
      expect(Math.abs(plan.sides[0].finish - plan.sides[1].finish)).toBeGreaterThan(0.65)
      for (const side of plan.sides) expect(side.finish - side.eraseStart).toBeCloseTo((plan.strands - 1) * 0.18 + 0.38, 10)
    }
  }
})

it('一侧完全消失后另一侧仍保留可见拱形，随后再完整退出', () => {
  for (const seed of [0.47, 0.79]) {
    const model = createFluxRopeSimulation(seed, false, 'bilateral'), route = model.reorganization!, plan = route.plan
    const first = plan.sides[0].finish < plan.sides[1].finish ? 0 : 1, last = 1 - first
    model.advanceTo(plan.sides[first].finish + 0.08)
    let visible = 0, height = 0
    for (const strand of route.selected) {
      expect(model.curveOpacity[(first + 1) * 12 + strand]).toBe(0)
      visible += model.curveOpacity[(last + 1) * 12 + strand]
      for (let j = 0; j <= 112; j++) height = Math.max(height, model.curveData[(((last + 1) * 12 + strand) * 113 + j) * 4 + 1])
    }
    expect(visible).toBeGreaterThan(route.selected.size * 0.3)
    expect(height).toBeGreaterThan(0.05)
    model.advanceTo(plan.finish + 0.03)
    for (const strand of route.selected) for (const branch of [1, 2]) expect(model.curveOpacity[branch * 12 + strand]).toBe(0)
  }
}, 15000)

it('轮廓会鼓胀与压扁，几何不等同于高度缩放；足点固定且层次连续', () => {
  const point = { x: 0, y: 0, z: 0 }, ratios: number[] = [], skews: number[] = []
  for (const seed of [0.17, 0.47, 0.79]) for (const plan of createShortLoopPlans(seed, 0, 9)) {
    const motion = createShortLoopMotion(plan)
    for (let age = plan.riseStart; age < plan.finish; age += 0.035) {
      const shape = motion.sample(age)
      expect(shape.height).toBeGreaterThan(0)
      expect(Object.values(shape).every(Number.isFinite)).toBe(true)
      for (const s of [0, 1]) {
        shortLoopProfile(s, 0, plan, shape, point)
        expect(point.x).toBeCloseTo(s, 10); expect(point.y).toBeCloseTo(0, 10); expect(point.z).toBeCloseTo(0, 10)
      }
      const crown = shortLoopProfile(0.5, 0.5, plan, shape, point).y
      ratios.push(shortLoopProfile(0.25, 0.5, plan, shape, point).y / crown)
      skews.push(shape.skew)
      let previousX = -1
      for (let j = 0; j <= 100; j++) {
        const s = j / 100
        shortLoopProfile(s, 0.5, plan, shape, point)
        expect(point.x).toBeGreaterThan(previousX); previousX = point.x
        let previousHeight = Infinity
        for (let k = 0; k < 9; k++) {
          const rank = k / 8, height = (1 - 0.22 * rank) * shortLoopProfile(s, rank, plan, shape, point).y
          expect(height).toBeLessThanOrEqual(previousHeight + 1e-9); previousHeight = height
        }
      }
    }
  }
  expect(Math.max(...ratios) - Math.min(...ratios)).toBeGreaterThan(0.15)
  expect(Math.min(...skews)).toBeLessThan(-0.1); expect(Math.max(...skews)).toBeGreaterThan(0.1)
})

it('升降驱动形变，回落时宽度响应有滞后；同种子任意顺序 seek 一致', () => {
  for (const plan of createShortLoopPlans(0.47, 0, 9)) {
    const motion = createShortLoopMotion(plan)
    const raised = { ...motion.sample(plan.fallStart) }, falling = { ...motion.sample(plan.fallStart + plan.fallDuration * 0.8) }
    expect(raised.height).toBeGreaterThan(1.15)
    expect(falling.height).toBeLessThan(raised.height * 0.6)
    expect(falling.spread).toBeGreaterThan(raised.spread + 0.2)
    const saved = { ...motion.sample(plan.fallStart + 0.2) }
    motion.sample(plan.finish); motion.sample(-1)
    expect(motion.sample(plan.fallStart + 0.2)).toEqual(saved)
  }
})

it('回弹不会固定先向下或等间隔激发，种子改变初始方向和脉冲节奏', () => {
  const directions = new Set<number>(), counts = new Set<number>()
  for (let i = 0; i < 30; i++) for (const plan of createShortLoopPlans(i / 30, 0, 9)) {
    const motion = createShortLoopMotion(plan)
    directions.add(Math.sign(motion.sample(0.1).height - 1))
    counts.add(plan.pulses.length)
    const gaps = plan.pulses.slice(1).map((p, j) => p.start - plan.pulses[j].start)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.001)
    const saved = { ...motion.sample(plan.pulses[1].start + 0.1) }
    motion.sample(plan.finish)
    expect(motion.sample(plan.pulses[1].start + 0.1)).toEqual(saved)
  }
  expect(directions.has(-1)).toBe(true); expect(directions.has(1)).toBe(true)
  expect(counts.size).toBe(3)
})

it('实际路径中的左右回落错开，同束整体下降且不同帧率重放一致', () => {
  const model = createFluxRopeSimulation(0.47, false, 'bilateral'), route = model.reorganization!, plan = route.plan
  const first = plan.sides[0].fallStart < plan.sides[1].fallStart ? 0 : 1, second = 1 - first
  const comparison = plan.sides[second].fallStart + 0.10
  const ages = [...new Set([comparison, ...plan.sides.flatMap(side => [side.fallStart, side.fallStart + side.fallDuration])])].sort((a, b) => a - b)
  const snapshots = new Map<number, number[][]>()
  for (const age of ages) {
    model.advanceTo(age)
    snapshots.set(age, [1, 2].map(branch => [...route.selected].map(strand => {
      const offset = (branch * 12 + strand) * 113 * 4
      const ground = (model.curveData[offset + 1] + model.curveData[offset + 112 * 4 + 1]) / 2
      return Math.max(...Array.from({ length: 113 }, (_, i) => model.curveData[offset + i * 4 + 1])) - ground
    })))
  }
  for (let b = 0; b < 2; b++) {
    const side = plan.sides[b], raised = snapshots.get(side.fallStart)![b], lowered = snapshots.get(side.fallStart + side.fallDuration)![b]
    const ratios = lowered.map((h, i) => h / raised[i])
    expect(Math.max(...ratios)).toBeLessThan(0.40)
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.04)
  }
  const relative = (b: number) => snapshots.get(comparison)![b][0] / snapshots.get(plan.sides[b].fallStart)![b][0]
  expect(relative(first)).toBeLessThan(relative(second) - 0.20)
  // 主积分器只向前走；回退与说明页一样重建模型，不用同一实例假装回放。
  const age = ages[ages.length - 1], played = createFluxRopeSimulation(0.47, false, 'bilateral')
  played.advanceTo(plan.approach - 0.1)
  for (let t = plan.approach; t < age; t += 1 / 30) played.advanceTo(t)
  played.advanceTo(age)
  expect(played.curveData).toEqual(model.curveData); expect(played.redrawData).toEqual(model.redrawData)
}, 15000)
