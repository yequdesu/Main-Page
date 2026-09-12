import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFocusChannels, createFocusTimeline } from '../useFocusTimeline'

const disposals: (() => void)[] = []
afterEach(() => disposals.splice(0).forEach(dispose => dispose()))
function setup() {
  const channels = createFocusChannels()
  const actions = { focus: vi.fn(), exit: vi.fn(() => [1.6, 3, 4.2]), timeout: vi.fn() }
  const timeline = createFocusTimeline(channels, actions)
  disposals.push(() => timeline.dispose())
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) timeline.advance(1 / 60)
  }
  return { channels, actions, timeline, advance }
}

describe('事件驱动的 GSAP 聚焦会话', () => {
  it('飞行器接管会取消旧超时并让行星回位，共用显隐和退出进度', () => {
    const { channels, actions, timeline, advance } = setup()
    timeline.dispatch({ type: 'focus', planetIdx: 0 }, 0)
    advance(29)
    timeline.dispatch({ type: 'voyager' })
    advance(5)
    expect(channels.target).toBe('voyager')
    expect(channels.track).toBe(-1)
    expect(channels.voyagerFocus).toBe(1)
    expect([...channels.returns]).toEqual([1, 1, 1])
    expect(actions.timeout).not.toHaveBeenCalled()
    advance(25)
    expect(actions.timeout).toHaveBeenCalledTimes(1)
    timeline.dispatch({ type: 'exit', reason: 'timeout' })
    advance(6)
    expect(channels.voyagerFocus).toBe(0)
    expect(channels.mode).toBe('idle')
  })

  it('同一时间轴驱动镜头、调相、轨道淡化与 30 秒超时，只触发一次', () => {
    const { channels, actions, timeline, advance } = setup()
    timeline.dispatch({ type: 'focus', planetIdx: 10 }, 1)
    expect(actions.focus).toHaveBeenCalledWith(1)
    expect(channels.camera).toBe(0)
    advance(0.5)
    expect(channels.camera).toBeGreaterThan(0)
    expect(channels.align).toBeGreaterThan(0)
    expect(channels.orbitFocus).toBeGreaterThan(0)
    advance(3.5)
    expect(channels.camera).toBe(1)
    expect(channels.align).toBe(1)
    expect([...channels.orbitVisibility]).toEqual([0.18, 0.45, 0.18, 0.12])
    advance(25.9)
    expect(actions.timeout).not.toHaveBeenCalled()
    advance(0.2)
    expect(actions.timeout).toHaveBeenCalledTimes(1)
    advance(5)
    expect(actions.timeout).toHaveBeenCalledTimes(1)
  })

  it('出焦先收速度再分轨道回位，全部完成后回到 idle，重复退出不重启', () => {
    const { channels, actions, timeline, advance } = setup()
    timeline.dispatch({ type: 'focus', planetIdx: 0 }, 0)
    advance(5)
    timeline.dispatch({ type: 'exit', reason: 'manual' })
    const revision = channels.revision
    advance(0.6)
    expect(channels.settle).toBeGreaterThan(0)
    expect(channels.settle).toBeLessThan(1)
    expect([...channels.returns]).toEqual([0, 0, 0])
    timeline.dispatch({ type: 'exit', reason: 'manual' })
    expect(channels.revision).toBe(revision)
    advance(1.8)
    expect(channels.returns[0]).toBe(1)
    expect(channels.returns[1]).toBeLessThan(1)
    expect(channels.returns[2]).toBeLessThan(channels.returns[1])
    expect(channels.mode).toBe('exit')
    advance(2.6)
    expect(channels.mode).toBe('idle')
    expect(channels.orbitFocus).toBe(0)
    expect([...channels.orbitVisibility]).toEqual([1, 1, 1, 1])
    expect(actions.exit).toHaveBeenCalledTimes(1)
    expect(actions.exit).toHaveBeenCalledWith(0.7)
  })

  it('新目标、同目标重入及回位打断均取消旧时间轴及旧回调，释放后不再更新', () => {
    const { channels, actions, timeline, advance } = setup()
    timeline.dispatch({ type: 'focus', planetIdx: 0 }, 0)
    advance(29)
    timeline.dispatch({ type: 'focus', planetIdx: 1 }, 1)
    advance(2)
    expect(actions.timeout).not.toHaveBeenCalled()
    timeline.dispatch({ type: 'focus', planetIdx: 1 }, 1)
    expect(channels.elapsed).toBe(0)
    advance(1)
    timeline.dispatch({ type: 'exit', reason: 'manual' })
    advance(1)
    timeline.dispatch({ type: 'focus', planetIdx: 2 }, 2)
    advance(5)
    expect(channels.mode).toBe('focus')
    expect(channels.track).toBe(2)
    expect(actions.timeout).not.toHaveBeenCalled()
    timeline.dispose()
    const frozen = channels.elapsed
    advance(60)
    timeline.dispatch({ type: 'exit', reason: 'manual' })
    expect(channels.elapsed).toBe(frozen)
    expect(actions.timeout).not.toHaveBeenCalled()
  })
})
