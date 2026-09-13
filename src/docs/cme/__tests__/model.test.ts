import { expect, it } from 'vitest'
import { CME_END, cmeTiming, readCmeSelection, cmeStage } from '../model'
import { createFluxRopeSimulation } from '../../../behaviors/stellarPlasma'

it('说明页阶段时刻与实际模型的逐流线闭合事件一致', () => {
  for (const seed of [0.17, 0.47, 0.79]) {
    const timing = cmeTiming(seed), simulation = createFluxRopeSimulation(seed, true)
    simulation.advanceTo(timing.last + 0.02)
    timing.times.forEach((t, i) => expect(t).toBeCloseTo(simulation.ejection!.closureTimes[i], 5))
    expect(timing.last).toBeGreaterThan(timing.first)
    expect(timing.rotationStart).toBeLessThan(timing.first)
    expect(timing.rotationSettled).toBeGreaterThan(timing.rotationStart)
    expect(cmeStage(-0.1)).toBe(0)
    expect(cmeStage(0.4)).toBe(1)
    expect(cmeStage(1.5)).toBe(2)
    expect(cmeStage(3)).toBe(3)
  }
}, 20000)

it('复制的种子与时间可以重放，无效参数安全回退', () => {
  expect(readCmeSelection('?seed=0.79&t=8.123')).toEqual({ seed: 0.79, age: 8.123 })
  expect(readCmeSelection('?seed=1&t=Infinity')).toEqual(readCmeSelection(''))
  expect(readCmeSelection('?seed=.17&t=-1').age).toBe(cmeTiming(0.17).first - 0.3)
  expect(readCmeSelection('?seed=0&t=0')).toEqual({ seed: 0, age: 0 })
  expect(readCmeSelection('?seed=.47&t=120')).toEqual({ seed: 0.47, age: 120 })
  expect(readCmeSelection(`?seed=.47&t=${CME_END}`).age).toBe(CME_END)
  expect(readCmeSelection(`?seed=.47&t=${CME_END + 1}`)).toEqual(readCmeSelection(''))
})
