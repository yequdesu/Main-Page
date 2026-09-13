import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { CME_DISSOLUTION, CME_DISTRIBUTION, cmeConversion, cmeWind, cmeParticleVisibility, cmeReleaseTime, createCmeDissolution } from '../stellarEjection'
import { CME_DISSIPATION, cmeBackgroundParticleBudget } from '../stellarParticleDensity'
import { createFluxRopeSimulation, PLASMA } from '../stellarPlasma'

it('弧长布点不受非均匀曲线参数影响，磁丝采样错位且保留闭环顺序', () => {
  const state = createCmeDissolution(0.47)
  const sample = (s: number, _strand: number, out: Vector3) => out.set(Math.cos(s * s * 2 * Math.PI), 2 + Math.sin(s * s * 2 * Math.PI), 0)
  state.step(1 / 120, 1, 2.8, sample)
  const ideal = 2 * Math.PI / CME_DISSOLUTION.perStrand
  for (let strand = 0; strand < 12; strand++) {
    const angles = Array.from(state.coordinates.slice(strand * 48, (strand + 1) * 48), s => s * s * 2 * Math.PI)
    for (let i = 0; i < angles.length; i++) {
      const gap = (angles[(i + 1) % angles.length] - angles[i] + 2 * Math.PI) % (2 * Math.PI)
      expect(gap / ideal).toBeGreaterThan(0.8)
      expect(gap / ideal).toBeLessThan(1.2)
    }
  }
  expect(new Set(Array.from({ length: 12 }, (_, i) => state.coordinates[i * 48])).size).toBe(12)
})

it.each([0.17, 0.47, 0.79])('仅在出生底部平滑减量，取舍固定且不删除薄雾运动样本：seed=%s', seed => {
  const state = createCmeDissolution(seed)
  const sample = (s: number, _strand: number, out: Vector3) => out.set(Math.sin(s * 2 * Math.PI), 1 - Math.cos(s * 2 * Math.PI), 0)
  state.step(1 / 120, 1, 2.8, sample)
  let bottom = 0, kept = 0
  for (let i = 0; i < CME_DISSOLUTION.count; i += CME_DISSOLUTION.particleStride) {
    const height = state.positions[i * 3 + 1] / 2
    if (height >= 0.28) expect(state.particleEnabled[i]).toBe(1)
    if (height < 0.1) { bottom++; kept += state.particleEnabled[i] }
  }
  expect(kept / bottom).toBeGreaterThan(0.15)
  expect(kept / bottom).toBeLessThan(0.8)
  const selection = state.particleEnabled.slice(), positions = state.positions.slice()
  state.step(1 / 120, 1.1, 2.8, sample)
  expect(state.particleEnabled).toEqual(selection)
  expect(state.positions).toEqual(positions)
  expect(state.ages.every(age => age >= 0)).toBe(true)
})

it('闭合阈值前不产生逸散，闭合后粒子从实际上升路径连续出生', () => {
  const effect = createCmeDissolution(0.47)
  const sample = (s: number, _i: number, out: Vector3) => out.set(Math.cos(s * Math.PI * 2), 2 + Math.sin(s * Math.PI * 2), 0)
  effect.step(1 / 120, 1, 1, sample)
  expect(effect.closureTimes.every(t => t < 0)).toBe(true)
  expect(effect.ages.every(t => t < 0)).toBe(true)
  effect.step(1 / 120, 2, 2.8, sample)
  expect(effect.closureTimes.every(t => t === 2)).toBe(true)
  expect(effect.released.every(t => t === 0)).toBe(true)
  const p = new Vector3()
  for (let i = 0; i < CME_DISSOLUTION.count; i++) {
    sample(effect.coordinates[i], 0, p)
    expect(new Vector3().fromArray(effect.positions, i * 3).distanceTo(p)).toBeLessThan(1e-6)
    expect(cmeConversion(effect.ages[i], effect.coordinates[i])).toBe(0)
  }
})

it('释放时继承移动闭环的三维速度，随后按共同外流场运动；曝光平滑交接', () => {
  const effect = createCmeDissolution(0.2), dt = 1 / 120
  let time = 0
  const sample = (s: number, _i: number, out: Vector3) => out.set(Math.cos(s * 2 * Math.PI) + time * 0.3, 2 + Math.sin(s * 2 * Math.PI) + time * 0.5, time * 0.1)
  let step = 0
  while (!effect.released.some(Boolean) && step < 120) { time = step++ * dt; effect.step(dt, time, 2.8, sample) }
  const i = [...effect.released].findIndex(x => x === 1)
  expect(i).toBeGreaterThanOrEqual(0)
  expect(effect.velocities[i * 3]).toBeCloseTo(0.3, 3)
  expect(effect.velocities[i * 3 + 1]).toBeCloseTo(0.5, 3)
  expect(effect.velocities[i * 3 + 2]).toBeCloseTo(0.1, 3)
  for (let k = step; k < 400; k++) { time = k * dt; effect.step(dt, time, 2.8, sample) }
  expect(effect.released.every(x => x === 1)).toBe(true)
  expect(effect.positions.every(Number.isFinite)).toBe(true)
  expect(effect.velocities[i * 3 + 1]).toBeGreaterThan(0.5)
  for (const s of [0, 0.25, 0.5, 0.99]) {
    let previous = 0
    for (let t = 0; t <= 1; t += 0.01) {
      const d = cmeConversion(t, s)
      expect(d).toBeGreaterThanOrEqual(previous)
      expect(d).toBeLessThanOrEqual(1)
      expect(d - previous).toBeLessThan(0.035)
      previous = d
    }
    expect(cmeConversion(1, s)).toBe(1)
  }
})

it('CME 外流由原固定步推进，跨帧率/直接 seek 一致，日珥不分配逸散状态', () => {
  const a = createFluxRopeSimulation(0.47, true), b = createFluxRopeSimulation(0.47, true), c = createFluxRopeSimulation(0.47, true)
  for (let i = 1; i <= 600; i++) a.advanceTo(i / 60)
  for (let i = 1; i <= 300; i++) b.advanceTo(i / 30)
  c.advanceTo(10)
  expect(a.ejection!.closureTimes).toEqual(b.ejection!.closureTimes)
  expect(a.ejection!.positions).toEqual(b.ejection!.positions)
  expect(a.ejection!.positions).toEqual(c.ejection!.positions)
  expect(a.ejection!.velocities).toEqual(c.ejection!.velocities)
  expect(a.ejection!.particleEnabled).toEqual(c.ejection!.particleEnabled)
  expect(a.ejection!.coordinates).toEqual(c.ejection!.coordinates)
  expect(a.ejection!.particleTail).toEqual(c.ejection!.particleTail)
  expect(a.ejection!.closureTimes.every(t => t > 0)).toBe(true)
  expect(new Set(a.ejection!.closureTimes).size).toBeGreaterThan(1)
  expect(a.ejection!.released.every(x => x === 1)).toBe(true)
  expect(createFluxRopeSimulation(0.47, false).ejection).toBeNull()
  expect(PLASMA.step).toBe(1 / 120)
}, 20000)

it('释放后局部舒展产生有界位移，保持原外流主方向', () => {
  const state = createCmeDissolution(0.41), dt = 1 / 120
  const sample = (s: number, strand: number, out: Vector3) => out.set(0.55 * Math.sin(s * 2 * Math.PI), 2 - 0.55 * Math.cos(s * 2 * Math.PI), strand * 0.003)
  const freePositions = new Float64Array(state.positions.length), freeVelocities = new Float64Array(state.positions.length)
  const wasReleased = new Uint8Array(state.released.length), wind = new Vector3()
  for (let step = 1; step <= 360; step++) {
    const time = step * dt
    wasReleased.set(state.released)
    state.step(dt, time, 2.8, sample)
    for (let i = 0; i < state.released.length; i++) {
      const k = i * 3
      if (!state.released[i]) continue
      if (!wasReleased[i]) {
        freePositions.set(state.positions.subarray(k, k + 3), k)
        freeVelocities.set(state.velocities.subarray(k, k + 3), k)
      } else {
        cmeWind(freePositions[k], freePositions[k + 1], freePositions[k + 2], time, 0.41, wind)
        for (let axis = 0; axis < 3; axis++) {
          freeVelocities[k + axis] += (wind.getComponent(axis) - freeVelocities[k + axis]) * (1 - Math.exp(-0.85 * dt))
          freePositions[k + axis] += freeVelocities[k + axis] * dt
        }
      }
    }
  }
  let largestOffset = 0
  for (let i = 0; i < state.released.length; i++) {
    const k = i * 3
    largestOffset = Math.max(largestOffset, Math.hypot(...[0, 1, 2].map(axis => state.positions[k + axis] - freePositions[k + axis])))
    expect(state.velocities[k + 1]).toBeGreaterThan(0)
  }
  expect(largestOffset).toBeGreaterThan(0.005)
  expect(largestOffset).toBeLessThan(CME_DISTRIBUTION.separationSpeed * CME_DISTRIBUTION.separationDuration)
})

it('实际 CME 的底部不再维持显著小于侧面的粒子间距', () => {
  const model = createFluxRopeSimulation(0.47, true)
  model.advanceTo(9)
  const state = model.ejection!
  const ids = Array.from(state.particleEnabled, (_, i) => i).filter(i => state.particleEnabled[i])
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const spacing = (bottom: boolean) => median(ids.filter(i => (state.coordinates[i] < 0.15 || state.coordinates[i] > 0.85) === bottom).map(i =>
    Math.min(...ids.filter(j => j !== i).map(j => Math.hypot(...[0, 1, 2].map(axis => state.positions[i * 3 + axis] - state.positions[j * 3 + axis]))))))
  // 旧实现该比值约 0.26；保留自然疏密变化，而不要求全场严格等距。
  expect(spacing(true) / spacing(false)).toBeGreaterThan(0.45)
})

it.each([0, 0.17, 0.47, 0.79, 0.99])('迅速稀释到背景量级，尾迹选取分散、稳定且不影响雾样本：seed=%s', seed => {
  const model = createFluxRopeSimulation(seed, true)
  model.advanceTo(10.5) // seed=0 较晚闭合，需覆盖最后一条磁丝自身的释放与淡出。
  const state = model.ejection!
  const tails = Array.from(state.particleTail, (_, i) => i).filter(i => state.particleTail[i])
  expect(tails.length).toBeGreaterThanOrEqual(CME_DISSIPATION.minTail)
  expect(tails.length).toBeLessThanOrEqual(CME_DISSIPATION.maxTail)
  expect(tails.every(i => state.particleEnabled[i] === 1)).toBe(true)
  let live = 0
  for (let i = 0; i < state.ages.length; i++) {
    if (!state.particleEnabled[i]) continue
    const s = state.coordinates[i], tail = Boolean(state.particleTail[i]), release = cmeReleaseTime(s)
    expect(cmeParticleVisibility(release, s, i, tail)).toBe(1)
    let previous = 1
    for (let dt = 0; dt <= 0.8; dt += 1 / 120) {
      const visibility = cmeParticleVisibility(release + dt, s, i, tail)
      expect(visibility).toBeLessThanOrEqual(previous)
      expect(previous - visibility).toBeLessThan(0.045)
      previous = visibility
    }
    expect(cmeParticleVisibility(release + 0.7, s, i, tail)).toBe(tail ? 1 : 0)
    if (cmeParticleVisibility(state.ages[i], s, i, tail) > 0) live++
  }
  expect(live).toBe(tails.length)
  const chosen = state.particleTail.slice()
  model.advanceTo(11)
  expect(state.particleTail).toEqual(chosen)
  expect(state.ages.every(age => age > 0)).toBe(true)
  expect(state.positions.every(Number.isFinite)).toBe(true)
  // 覆盖闭合较慢的边界种子；保留集必须在任一颗粒开始淡出前确定，避免恢复亮度。
  expect(Math.max(...state.closureTimes) - Math.min(...state.closureTimes)).toBeLessThan(CME_DISSOLUTION.release + CME_DISSIPATION.delay)
})

it('背景密度预算随局部面积增长，受零星尾迹范围约束', () => {
  expect(cmeBackgroundParticleBudget(5, 3, 0.47)).toBeGreaterThan(cmeBackgroundParticleBudget(1, 0.5, 0.47))
  expect(cmeBackgroundParticleBudget(0, 0, 0.47)).toBe(CME_DISSIPATION.minTail)
  expect(cmeBackgroundParticleBudget(100, 100, 0.47)).toBe(CME_DISSIPATION.maxTail)
})
