import { expect, it } from 'vitest'
import { createProminencePlacement } from '../stellarPlacement'

it('活动区朝向双向覆盖 0–45°，尺寸覆盖 80–150% 并偏向大值，同种子可复现', () => {
  const samples = Array.from({ length: 2000 }, (_, i) => createProminencePlacement(i / 2000))
  let total = 0, aboveMid = 0, positive = 0, angleTotal = 0
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]
    expect(p).toEqual(createProminencePlacement(i / 2000))
    expect(p.scale).toBeGreaterThanOrEqual(0.8); expect(p.scale).toBeLessThanOrEqual(1.5)
    expect(Math.abs(p.azimuth)).toBeLessThanOrEqual(Math.PI / 4)
    total += p.scale; angleTotal += Math.abs(p.azimuth)
    if (p.scale > 1.15) aboveMid++
    if (p.azimuth > 0) positive++
  }
  expect(total / samples.length).toBeGreaterThan(1.25)
  expect(total / samples.length).toBeLessThan(1.29)
  expect(aboveMid / samples.length).toBeGreaterThan(0.72)
  expect(aboveMid / samples.length).toBeLessThan(0.78)
  expect(positive / samples.length).toBeGreaterThan(0.47)
  expect(positive / samples.length).toBeLessThan(0.53)
  expect(angleTotal / samples.length * 180 / Math.PI).toBeGreaterThan(21)
  expect(angleTotal / samples.length * 180 / Math.PI).toBeLessThan(24)
  expect(Math.min(...samples.map(p => p.scale))).toBeLessThan(0.85)
  expect(Math.max(...samples.map(p => p.scale))).toBeGreaterThan(1.49)
  // 尺寸与朝向分开取样，不能让所有大环都朝同一侧或固定为正视。
  for (const direction of [-1, 1]) {
    const large = samples.filter(p => p.scale > 1.4 && Math.sign(p.azimuth) === direction)
    expect(large.some(p => Math.abs(p.azimuth) < Math.PI / 18)).toBe(true)
    expect(large.some(p => Math.abs(p.azimuth) > Math.PI * 2 / 9)).toBe(true)
  }
})
