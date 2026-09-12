import { expect, it } from 'vitest'
import { createShortLoopPlans, createShortLoopMotion, shortLoopProfile } from '../stellarShortLoop'
import { createFluxRopeSimulation } from '../stellarPlasma'

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
})
