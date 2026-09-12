import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { CME_TAIL, cmeBackgroundParticleBudget } from '../stellarParticleDensity'
import { createCmeTailPool, cmeTailOpacity, sampleCmeTail, type CmeTailRecord } from '../stellarTail'

const record = (): CmeTailRecord => ({ born: 8, depart: 8.7, origin: [-0.4, 0.1, 0], velocity: [0.01, 0.002, 0], drift: [0.003, 0.0001, 0], wave: [0.008, 0.02, 0.006], phase: 0.3, random: 0.47, appearance: [0.4, 1, 0.47, 8.7] })

it('数量预算精确翻倍，包括原先的最小和最大预算', () => {
  for (const [width, height] of [[0, 0], [1, 2], [3, 4], [6, 4], [100, 100]]) {
    const seed = 0.47, scale = 0.018 * (0.9 + 0.2 * seed)
    const oldBudget = Math.max(2, Math.min(8, Math.ceil(72 * Math.PI / 4 * width * height * scale ** 2 * (16 / 9) / (1.15 * 0.055))))
    expect(cmeBackgroundParticleBudget(width, height, seed)).toBe(oldBudget * 2)
  }
})

it('解析外流从交接位置和速度开始，300 秒内缓慢跨越页面且可直接 seek', () => {
  const r = record(), p = new Vector3(), after = new Vector3()
  expect(sampleCmeTail(r, r.depart, p).toArray()).toEqual(r.origin)
  sampleCmeTail(r, r.depart + 0.0001, after)
  after.sub(p).divideScalar(0.0001)
  r.velocity.forEach((v, axis) => expect(after.getComponent(axis)).toBeCloseTo(v, 5))
  const far = sampleCmeTail(r, 300, p).clone()
  expect(far.x - r.origin[0]).toBeGreaterThan(0.7)
  expect(far.x - r.origin[0]).toBeLessThan(1.1)
  expect(Math.abs(far.y - r.origin[1])).toBeLessThan(0.12)
  for (let t = 9; t < 300; t += 1 / 60) sampleCmeTail(r, t, after)
  expect(sampleCmeTail(r, 300, after)).toEqual(far)
  expect(cmeTailOpacity(r, 120)).toBe(1)
  expect(cmeTailOpacity(r, r.born + 270)).toBeCloseTo(0.5)
  expect(cmeTailOpacity(r, r.born + 300)).toBe(0)
})

it('固定容量支持多轮喷发和到期回收，不新增定时器或保留全部磁模型', () => {
  const pool = createCmeTailPool()
  for (let event = 0; event < 17; event++) for (let i = 0; i < 16; i++) {
    const r = record(); r.born = event * 18; r.depart = r.born + 0.7
    pool.add(r, 299)
  }
  expect(pool.records.filter(Boolean)).toHaveLength(272)
  pool.expire(300)
  expect(pool.records.filter(Boolean)).toHaveLength(256)
  pool.expire(600)
  expect(pool.records.filter(Boolean)).toHaveLength(0)
  expect(pool.records).toHaveLength(CME_TAIL.capacity)
})
