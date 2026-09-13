import { expect, it } from 'vitest'
import { createCmeMistField } from '../stellarMist'
import { CME_DISSOLUTION } from '../stellarEjection'
import { createFluxRopeSimulation } from '../stellarPlasma'

it.each([0.17, 0.47, 0.79])('雾场覆盖展开后的粒子，并衔接相邻区域：seed=%s', seed => {
  const model = createFluxRopeSimulation(seed, true), field = createCmeMistField(1.5)
  const { fogStride, particleStride, perStrand } = CME_DISSOLUTION
  let firstRadius = 0
  for (const age of [8.6, 9.5, 10.7]) {
    model.advanceTo(age)
    const state = model.ejection!, original = state.positions.slice()
    field.update(state)
    expect(state.positions).toEqual(original) // 重建密度不能再向共同中心收拢粒子/雾采样点。
    let covered = 0, total = 0, radiusSum = 0
    for (let i = 0; i < state.ages.length; i += particleStride) {
      if (state.ages[i] <= 0) continue
      total++
      let distance = Infinity
      for (let j = 0; j < state.ages.length; j += fogStride) {
        if (state.ages[j] <= 0) continue
        const d = Math.hypot(original[i * 3] - original[j * 3], original[i * 3 + 1] - original[j * 3 + 1], original[i * 3 + 2] - original[j * 3 + 2])
        distance = Math.min(distance, d / field.kernels[j / fogStride * 3])
      }
      if (distance < 0.8) covered++
    }
    expect(covered / total).toBeGreaterThanOrEqual(0.95)
    for (let i = 0; i < state.ages.length; i += fogStride) {
      if (state.ages[i] <= 0) continue
      const next = Math.floor(i / perStrand) * perStrand + (i % perStrand + fogStride) % perStrand
      const gap = Math.hypot(original[i * 3] - original[next * 3], original[i * 3 + 1] - original[next * 3 + 1], original[i * 3 + 2] - original[next * 3 + 2])
      const radius = field.kernels[i / fogStride * 3]
      // 邻接核之间的中点位于可见软边缘内，避免恢复成数块不相连的雾。
      expect(gap * 0.5 / radius).toBeLessThan(0.57)
      radiusSum += radius
    }
    if (age === 8.6) firstRadius = radiusSum
    if (age === 10.7) expect(radiusSum).toBeGreaterThan(firstRadius)
    expect(field.kernels.every(Number.isFinite)).toBe(true)
  }
})

it('整体平移不改变雾核宽度与密度补偿，回退清除出生权重', () => {
  const model = createFluxRopeSimulation(0.47, true), field = createCmeMistField(1.5)
  model.advanceTo(9)
  const state = model.ejection!
  field.update(state)
  const expected = field.kernels.slice()
  for (let i = 0; i < state.positions.length; i += 3) {
    state.positions[i] += 3; state.positions[i + 1] -= 2; state.positions[i + 2] += 5
  }
  field.update(state)
  expected.forEach((v, i) => expect(field.kernels[i]).toBeCloseTo(v, 5))
  state.ages.fill(-1)
  field.update(state)
  for (let i = 2; i < field.kernels.length; i += 3) expect(field.kernels[i]).toBe(0)
})
