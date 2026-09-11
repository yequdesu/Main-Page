import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  cmePositionCDF, cmePositionDensity, sampleCmePosition, createStellarActivityChannels,
  createStellarActivityTimeline, createStellarLimbFrame,
} from '../stellarActivity'
import { getStructureLayout, STRUCTURE_LAYOUT } from '../structureLayout'

it('抛射分布积分为 1；中线为平均密度的一半，过渡对称、连续，逆采样符合 CDF', () => {
  const count = 10000
  let integral = 0
  for (let i = 0; i < count; i++) integral += cmePositionDensity(-1 + (i + 0.5) * 2 / count) * 2 / count
  expect(integral).toBeCloseTo(1, 8)
  expect(cmePositionDensity(0) / (integral / 2)).toBeCloseTo(0.5, 8)
  expect(cmePositionCDF(-1)).toBeCloseTo(0)
  expect(cmePositionCDF(1)).toBeCloseTo(1)
  for (const x of [0, 0.02, 0.1, 0.3, 0.45, 0.7, 1]) {
    expect(cmePositionDensity(x)).toBe(cmePositionDensity(-x))
    expect(cmePositionDensity(x)).toBeGreaterThanOrEqual(0.25)
  }
  for (const x of [0, 0.45]) {
    const leftSlope = (cmePositionDensity(x) - cmePositionDensity(x - 0.00001)) / 0.00001
    const rightSlope = (cmePositionDensity(x + 0.00001) - cmePositionDensity(x)) / 0.00001
    expect(leftSlope).toBeCloseTo(rightSlope, 3)
  }
  for (let i = 1; i < 100; i++) expect(cmePositionCDF(sampleCmePosition(i / 100))).toBeCloseTo(i / 100, 8)
})

it('日珥位置保持均匀抽样；只有抛射按专用分布取样，事件可重启且释放后不再推进', () => {
  const channels = createStellarActivityChannels()
  const timeline = createStellarActivityTimeline(channels, () => 0.6)
  const tick = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) timeline.advance(0.05) }
  try {
    expect(channels.prominences[0].position).toBeCloseTo(0.2)
    expect(channels.prominences[1].position).toBeCloseTo(0.2)
    expect(channels.prominences[0].opacity).toBe(1)
    expect(channels.cme.opacity).toBe(0)
    tick(3.1)
    expect(channels.cme.position).toBeCloseTo(sampleCmePosition(0.6))
    expect(channels.cme.position).toBeGreaterThan(0.2)
    tick(6)
    expect(channels.cme.opacity).toBe(1)
    tick(7)
    expect(channels.cme.opacity).toBe(0)
    timeline.dispatch({ type: 'cme' })
    expect(channels.cme.age).toBe(0)
    timeline.advance(100)
    expect(channels.cme.age).toBeCloseTo(0.1) // 后台恢复不跳完整次事件。
  } finally { timeline.dispose() }
  const snapshot = { ...channels.cme }
  timeline.advance(1)
  timeline.dispatch({ type: 'cme' })
  expect(channels.cme).toEqual(snapshot)
})

it('宽屏和窄屏采样均落在可见球面切圆，法线与沿边缘切线正交，中心对应水平中线', () => {
  const anchor = new Vector3(), tangent = new Vector3(), normal = new Vector3()
  const frame = createStellarLimbFrame()
  const distance = STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ
  const camera = new Vector3(0, 0, distance)
  for (const aspect of [0.46, 1, 16 / 9, 2.4]) {
    const layout = getStructureLayout(aspect)
    frame.layout(layout)
    const sun = new Vector3(layout.sunX, 0, 0)
    for (const x of [-1, -0.5, 0, 0.5, 1]) {
      frame.sample(x, anchor, tangent, normal)
      expect(anchor.distanceTo(sun)).toBeCloseTo(layout.sunRadius)
      expect(normal.dot(tangent)).toBeCloseTo(0)
      expect(camera.clone().sub(anchor).normalize().dot(normal)).toBeCloseTo(0)
      const scale = distance / (distance - anchor.z)
      expect(Math.abs(anchor.y * scale)).toBeLessThanOrEqual(layout.height * 0.430001)
      expect(anchor.x * scale).toBeGreaterThanOrEqual(-layout.width * 0.485001)
      if (x === 0) {
        expect(anchor.y).toBe(0)
        expect(anchor.x * scale / layout.width + 0.5).toBeCloseTo(0.105)
      }
    }
  }
})

it('日珥结构在事件触发时抽选，避免重复上次结构及另一通道的结构', () => {
  const channels = createStellarActivityChannels()
  const timeline = createStellarActivityTimeline(channels, () => 0.6)
  try {
    expect(channels.prominences[0].morphology).not.toBe(channels.prominences[1].morphology)
    for (let i = 0; i < 20; i++) {
      const slot = i % 2, previous = channels.prominences[slot].morphology
      timeline.dispatch({ type: 'prominence', slot })
      const selected = channels.prominences[slot].morphology
      expect(selected).not.toBe(previous)
      expect(selected).not.toBe(channels.prominences[1 - slot].morphology)
      timeline.advance(0.1)
      expect(channels.prominences[slot].morphology).toBe(selected)
    }
    timeline.dispatch({ type: 'cme' })
    expect(channels.cme.morphology).toBeNull()
  } finally { timeline.dispose() }
})
