import { describe, expect, it } from 'vitest'
import { getEffectScope, listEffectScopeSnapshots, removeEffectScope } from '../effectScope'

describe('effect scopes', () => {
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
