import { useEffect, useMemo, useSyncExternalStore } from 'react'

type Cancellable = { kill?: () => void; pause?: () => void }
type TimerId = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>

export interface EffectScopeSnapshot {
  owner: string
  tweens: number
  timers: number
  rafs: number
  cleanups: number
}

const scopes = new Map<string, EffectScope>()
const listeners = new Set<() => void>()
let cachedSnapshots: EffectScopeSnapshot[] = []
let snapshotsDirty = true

function emitScopesChanged(): void {
  snapshotsDirty = true
  listeners.forEach((listener) => listener())
}

export function subscribeEffectScopes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function listEffectScopeSnapshots(): EffectScopeSnapshot[] {
  if (snapshotsDirty) {
    cachedSnapshots = Array.from(scopes.values()).map((scope) => scope.snapshot())
    snapshotsDirty = false
  }
  return cachedSnapshots
}

export class EffectScope {
  readonly owner: string
  private tweens = new Set<Cancellable>()
  private timers = new Set<TimerId>()
  private rafs = new Set<number>()
  private cleanups = new Set<() => void>()

  constructor(owner: string) {
    this.owner = owner
  }

  addTween<T extends Cancellable>(tween: T): T {
    this.tweens.add(tween)
    emitScopesChanged()
    return tween
  }

  removeTween(tween: Cancellable | null | undefined, kill = true): void {
    if (!tween || !this.tweens.delete(tween)) return
    if (kill) tween.kill?.()
    emitScopesChanged()
  }

  addTimer<T extends TimerId>(timer: T): T {
    this.timers.add(timer)
    emitScopesChanged()
    return timer
  }

  clearTimer(timer: TimerId | null | undefined): void {
    if (!timer || !this.timers.delete(timer)) return
    clearTimeout(timer)
    emitScopesChanged()
  }

  addRaf(id: number): number {
    this.rafs.add(id)
    emitScopesChanged()
    return id
  }

  cancelRaf(id: number | null | undefined): void {
    if (!id || !this.rafs.delete(id)) return
    cancelAnimationFrame(id)
    emitScopesChanged()
  }

  addCleanup(cleanup: () => void): () => void {
    this.cleanups.add(cleanup)
    emitScopesChanged()
    return cleanup
  }

  removeCleanup(cleanup: (() => void) | null | undefined): void {
    if (!cleanup || !this.cleanups.delete(cleanup)) return
    emitScopesChanged()
  }

  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      emitScopesChanged()
      callback()
    }, delay)
    this.timers.add(timer)
    emitScopesChanged()
    return timer
  }

  setInterval(callback: () => void, delay: number): ReturnType<typeof setInterval> {
    const timer = setInterval(callback, delay)
    this.timers.add(timer)
    emitScopesChanged()
    return timer
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const raf = requestAnimationFrame((time) => {
      this.rafs.delete(raf)
      emitScopesChanged()
      callback(time)
    })
    this.rafs.add(raf)
    emitScopesChanged()
    return raf
  }

  cancel(_reason = 'cancel'): void {
    this.tweens.forEach((tween) => tween.kill?.())
    this.timers.forEach((timer) => clearTimeout(timer))
    this.rafs.forEach((raf) => cancelAnimationFrame(raf))
    this.cleanups.forEach((cleanup) => cleanup())
    this.tweens.clear()
    this.timers.clear()
    this.rafs.clear()
    this.cleanups.clear()
    emitScopesChanged()
  }

  snapshot(): EffectScopeSnapshot {
    return {
      owner: this.owner,
      tweens: this.tweens.size,
      timers: this.timers.size,
      rafs: this.rafs.size,
      cleanups: this.cleanups.size,
    }
  }
}

export function getEffectScope(owner: string): EffectScope {
  let scope = scopes.get(owner)
  if (!scope) {
    scope = new EffectScope(owner)
    scopes.set(owner, scope)
    emitScopesChanged()
  }
  return scope
}

export function removeEffectScope(owner: string): void {
  const scope = scopes.get(owner)
  if (!scope) return
  scope.cancel('remove')
  scopes.delete(owner)
  emitScopesChanged()
}

export function useEffectScope(owner: string): EffectScope {
  const scope = useMemo(() => getEffectScope(owner), [owner])
  useEffect(() => () => removeEffectScope(owner), [owner])
  return scope
}

export function useEffectScopeSnapshots(): EffectScopeSnapshot[] {
  return useSyncExternalStore(
    subscribeEffectScopes,
    listEffectScopeSnapshots,
    listEffectScopeSnapshots,
  )
}
