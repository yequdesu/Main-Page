import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { getEffectScope, listEffectScopeSnapshots, removeEffectScope, subscribeEffectScopes, useEffectScope } from '../effectScope'

describe('effect scopes', () => {
  it('在提交后发布 Hook 作用域，StrictMode 重挂载及 owner 切换均清理正确实例', () => {
    let rendering = false
    const renderNotifications: boolean[] = []
    const unsubscribe = subscribeEffectScopes(() => renderNotifications.push(rendering))
    const { result, rerender, unmount } = renderHook(({ owner }) => {
      rendering = true
      const scope = useEffectScope(owner)
      rendering = false
      return scope
    }, { initialProps: { owner: 'hook-first' }, wrapper: StrictMode })
    try {
      const first = result.current
      expect(listEffectScopeSnapshots().filter(s => s.owner === 'hook-first')).toHaveLength(1)
      rerender({ owner: 'hook-first' })
      expect(result.current).toBe(first)
      const kill = vi.fn()
      act(() => { first.addTween({ kill }) })
      rerender({ owner: 'hook-second' })
      expect(kill).toHaveBeenCalledTimes(1)
      expect(listEffectScopeSnapshots().some(s => s.owner === 'hook-first')).toBe(false)
      expect(listEffectScopeSnapshots().some(s => s.owner === 'hook-second')).toBe(true)
      expect(renderNotifications).not.toContain(true)
    } finally {
      unmount()
      unsubscribe()
    }
    expect(listEffectScopeSnapshots().some(s => s.owner.startsWith('hook-'))).toBe(false)
  })

  it('tracks scope resources and removes scopes', () => {
    const scope = getEffectScope('brandTitle')
    scope.addTween({ kill: () => {} })
    scope.addCleanup(() => {})

    expect(listEffectScopeSnapshots()).toContainEqual({
      owner: 'brandTitle',
      tweens: 1,
      timers: 0,
      rafs: 0,
      cleanups: 1,
    })

    removeEffectScope('brandTitle')
    expect(listEffectScopeSnapshots().find((item) => item.owner === 'brandTitle')).toBeUndefined()
  })

  it('tracks one-shot timers until they fire or scope is removed', () => {
    const scope = getEffectScope('labels')
    scope.setTimeout(() => {}, 1000)

    expect(listEffectScopeSnapshots().find((item) => item.owner === 'labels')?.timers).toBe(1)

    removeEffectScope('labels')
    expect(listEffectScopeSnapshots().find((item) => item.owner === 'labels')).toBeUndefined()
  })

  it('can clear individual timers and tweens without removing the scope', () => {
    let killed = false
    const scope = getEffectScope('precise')
    const timer = scope.setInterval(() => {}, 1000)
    const tween = scope.addTween({ kill: () => { killed = true } })

    expect(listEffectScopeSnapshots().find((item) => item.owner === 'precise')).toMatchObject({
      timers: 1,
      tweens: 1,
    })

    scope.clearTimer(timer)
    scope.removeTween(tween)

    expect(killed).toBe(true)
    expect(listEffectScopeSnapshots().find((item) => item.owner === 'precise')).toMatchObject({
      timers: 0,
      tweens: 0,
    })

    removeEffectScope('precise')
  })

  it('returns a stable snapshot reference when scopes have not changed', () => {
    getEffectScope('stable')
    const first = listEffectScopeSnapshots()
    const second = listEffectScopeSnapshots()

    expect(second).toBe(first)

    removeEffectScope('stable')
  })
})
