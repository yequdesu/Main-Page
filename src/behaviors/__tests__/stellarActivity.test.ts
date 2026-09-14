import { expect, it } from 'vitest'
import {
  createStellarActivityChannels, createStellarActivityTimeline,
} from '../stellarActivity'

it('事件只抽取一次位置分位数，布局映射留给资产；事件可重启且释放后不再推进', () => {
  const channels = createStellarActivityChannels()
  const timeline = createStellarActivityTimeline(channels, () => 0.6)
  const tick = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) timeline.advance(0.05) }
  try {
    expect(channels.prominences[0].position).toBeCloseTo(0.2)
    expect(channels.prominences[1].position).toBeCloseTo(0.2)
    expect(channels.prominences[0].opacity).toBe(1)
    expect(channels.cme.opacity).toBe(1)
    expect(channels.cme.age).toBe(2.5)
    expect(channels.cme.serial).toBe(1)
    expect(channels.time).toBe(0)
    tick(3.1)
    expect(channels.time).toBeCloseTo(3.1)
    expect(channels.cme.position).toBeCloseTo(0.2)
    tick(6)
    expect(channels.cme.opacity).toBeLessThan(1)
    expect(channels.cme.age).toBeCloseTo(11.6)
    tick(7)
    expect(channels.cme.opacity).toBe(0)
    const previousTime = channels.time!, previousSerial = channels.cme.serial
    timeline.dispatch({ type: 'cme' })
    expect(channels.cme.age).toBe(0)
    expect(channels.time).toBe(previousTime)
    expect(channels.cme.serial).toBe(previousSerial + 1)
    timeline.advance(100)
    expect(channels.cme.age).toBeCloseTo(0.1) // 后台恢复不跳完整次事件。
    expect(channels.time).toBeCloseTo(previousTime + 0.1)
  } finally { timeline.dispose() }
  const snapshot = { ...channels.cme }
  const sceneTime = channels.time
  timeline.advance(1)
  timeline.dispatch({ type: 'cme' })
  expect(channels.cme).toEqual(snapshot)
  expect(channels.time).toBe(sceneTime)
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
