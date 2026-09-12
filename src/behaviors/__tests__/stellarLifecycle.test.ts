import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createMagneticLifecycle, MAGNETIC_LIFETIME, MAGNETIC_DECAY_DURATION, CME_ARCADE_RETREAT_DURATION } from '../stellarLifecycle'
import { createMagneticDeformation } from '../stellarMagnetism'
import { PROMINENCE_MORPHOLOGIES } from '../stellarMorphology'
import { createFluxRopeSimulation, PLASMA } from '../stellarPlasma'

it('全部构型的磁通区域固定，重组只更换连接，粒子跟随所在分支', () => {
  const point = new Vector3()
  for (const { kind } of PROMINENCE_MORPHOLOGIES) {
    const model = createFluxRopeSimulation(0.47, false, kind)
    const feet = Array.from({ length: PLASMA.strands }, (_, strand) => [0, 1].map(s => model.sample(s, strand, 0, new Vector3()).clone()))
    const initial = model.sample(0.5, 0, 0, point).y
    let grown = 0
    for (const age of [0.5, 3, 8, 22.5, 29.5, 34, MAGNETIC_LIFETIME]) {
      model.advanceTo(age)
      if (age === 8) { grown = model.sample(0.5, 0, 0, point).y; expect(grown).toBeGreaterThan(initial * 5) }
      if (age === MAGNETIC_LIFETIME) {
        expect(model.sample(0.5, 0, 0, point).y).toBeLessThan(grown * 0.1)
        expect(model.lifecycle.opacity).toBeCloseTo(0)
      } else expect(model.lifecycle.opacity).toBeCloseTo(1)
      for (let strand = 0; strand < PLASMA.strands; strand++) for (const s of [0, 1]) {
        const reorg = model.reorganization
        const expected = reorg?.switched && reorg.selected.has(strand) && s === 1 ? reorg.regions.get(strand)![3] : feet[strand][s]
        expect(model.sample(s, strand, 0, point).distanceTo(expected)).toBeLessThan(1e-8)
      }
      expect(model.curveData.every(Number.isFinite)).toBe(true)
      for (let i = 0; i < model.position.length; i++) {
        const strand = Math.floor(i / PLASMA.parcelsPerStrand)
        const actual = new Vector3().fromArray(model.centers, i * 3)
        expect(model.sample(model.position[i], strand, model.branches[i] as 0 | 1 | 2, point).distanceTo(actual)).toBeLessThan(0.005)
      }
    }
  }
}, 20000)

it('最终拱顶记住形成期负载，稳定后停止塑形，消退时减弱凹陷', () => {
  const coldLife = createMagneticLifecycle(), hotLife = createMagneticLifecycle()
  const cold = createMagneticDeformation(0.47, coldLife), hot = createMagneticDeformation(0.47, hotLife)
  const positions = new Float64Array([0.35, 0.45, 0.55, 0.65]), branches = new Uint8Array(4)
  const coldMass = new Float64Array(4).fill(0.1), hotMass = new Float64Array(4).fill(1)
  const start = cold.apexPower
  for (let i = 1; i <= 8 * 120; i++) {
    coldLife.advanceTo(i / 120); hotLife.advanceTo(i / 120)
    cold.step(1 / 120, 1, positions, coldMass, branches)
    hot.step(1 / 120, 1, positions, hotMass, branches)
  }
  expect(Math.abs(cold.apexPower - start)).toBeGreaterThan(0.05)
  expect(cold.apexPower - hot.apexPower).toBeGreaterThan(0.04)
  const settled = cold.apexPower, dip = cold.dipDepth
  for (let i = 8 * 120 + 1; i <= 12 * 120; i++) {
    coldLife.advanceTo(i / 120); cold.step(1 / 120, 1, positions, coldMass, branches)
  }
  expect(cold.apexPower).toBe(settled)
  coldLife.advanceTo(MAGNETIC_LIFETIME - 1)
  expect(cold.dipDepth).toBeLessThan(dip * 0.2)
})

it('生命周期随事件长度对齐，形成驱动与消退松弛互不镜像', () => {
  expect(MAGNETIC_DECAY_DURATION).toBeGreaterThan(CME_ARCADE_RETREAT_DURATION * 3)
  for (const seed of [0, 0.47, 0.79, 0.999999]) expect(createMagneticLifecycle(MAGNETIC_LIFETIME, seed).advanceTo(8).phase).toBe('稳定')
  for (const duration of [30, 36, 38]) {
    const life = createMagneticLifecycle(duration)
    expect(life.timing.decay).toBeGreaterThan(life.timing.settled + 5)
    expect(life.advanceTo(2).drive).toBeGreaterThan(0.9)
    expect(life.relaxation).toBe(0)
    expect(life.advanceTo(duration - 2).drive).toBe(0)
    expect(life.relaxation).toBe(1)
    expect(life.advanceTo(duration).opacity).toBe(0)
  }
})

it('相同事件可跨帧率重放，直接 seek 和逐步播放得到相同轮廓', () => {
  const direct = createFluxRopeSimulation(0.79, false, 'crossed', 33)
  const played = createFluxRopeSimulation(0.79, false, 'crossed', 33)
  direct.advanceTo(32)
  for (let i = 1; i <= 32 * 30; i++) played.advanceTo(i / 30)
  expect(played.curveData).toEqual(direct.curveData)
  expect(played.centers).toEqual(direct.centers)
}, 15000)

it('CME 下方拱廊回缩，足点不动，上方闭环继续上升', () => {
  const model = createFluxRopeSimulation(0.47, true)
  const feet = [0, 1].map(s => model.sample(s, 0, 0, new Vector3()).clone())
  model.advanceTo(8)
  const lower = model.sample(0.5, 0, 2, new Vector3()).y
  const upper = model.sample(0.5, 0, 1, new Vector3()).y
  model.advanceTo(12)
  expect(model.sample(0.5, 0, 2, new Vector3()).y).toBeLessThan(lower * 0.6)
  expect(model.sample(0.5, 0, 1, new Vector3()).y).toBeGreaterThan(upper)
  for (const s of [0, 1]) expect(model.sample(s, 0, 2, new Vector3()).distanceTo(feet[s])).toBeLessThan(1e-8)
})
