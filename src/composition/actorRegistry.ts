import type { DataRef } from './anchorStore'
import type { LayerId, LayerContract } from './layerRegistry'
import type { TimelineKey } from './timeline'

export type ActorDomain = 'webgl' | 'dom' | 'svg' | 'logic'
export type ClockSource = 'scroll' | 'elapsedTime' | 'delta' | 'signal'

export type FramePhase =
  | 'input'
  | 'timeline'
  | 'webgl.produce'
  | 'webgl.mutate'
  | 'camera'
  | 'projection'
  | 'layout.measure'
  | 'layout.solve'
  | 'dom.apply'
  | 'interaction'
  | 'signals'
  | 'debug'

export interface RuntimeReadContext {
  scrollProgress: number
  elapsedTime: number
}

export interface LifecycleContract {
  mount: 'always' | 'whenActive' | { sequence: string; phase: string }
  activeWhen?: string | ((ctx: RuntimeReadContext) => boolean)
  resetOn?: string[]
  dispose: 'auto' | 'manual' | 'none'
}

export interface LayoutContract {
  solver: 'none' | 'css' | 'pbd' | 'custom'
  coordinateSpace: 'cssPx' | 'screenPx'
  anchor?: DataRef
  avoid?: DataRef[]
  measure?: boolean
  clampToViewport?: boolean
  output?: DataRef
}

export interface InteractionContract {
  pointer: 'none' | 'auto' | 'autoWhenVisible'
  capturesFocus?: boolean
  blocksScrollWhenActive?: boolean
  blocksFastForwardWhenActive?: boolean
  hoverSource?: 'screen' | 'raycast' | 'dom'
  clickPolicy?: 'passThrough' | 'capture' | 'toggleFocus' | 'openLinkWhenFocused'
  priority?: number
}

export interface EffectContract {
  ownsTweens?: boolean
  ownsTimers?: boolean
  ownsRaf?: boolean
  cancelOnReset?: boolean
  cancelOnUnmount?: boolean
}

export interface ActorSpec {
  id: string
  domain: ActorDomain
  lifecycle: LifecycleContract
  timing?: {
    clocks: ClockSource[]
    ranges?: TimelineKey[]
    sequences?: string[]
  }
  frame?: {
    phase: FramePhase
    after?: string[]
    before?: string[]
    skipWhenUnchanged?: Array<'scroll' | 'elapsedTime' | 'anchor' | 'phase'>
  }
  layer?: LayerId
  consumes?: DataRef[]
  produces?: DataRef[]
  render?: LayerContract
  layout?: LayoutContract
  interaction?: InteractionContract
  effects?: EffectContract
  debug?: {
    label?: string
    inspect?: string[]
    events?: boolean
  }
}

const registry = new Map<string, ActorSpec>()

export function defineActor(spec: ActorSpec): ActorSpec {
  if (registry.has(spec.id)) {
    throw new Error(`Actor "${spec.id}" is already registered`)
  }
  registry.set(spec.id, spec)
  return spec
}

export function getActor(id: string): ActorSpec | undefined {
  return registry.get(id)
}

export function listActors(): ActorSpec[] {
  return Array.from(registry.values())
}

export function clearActorsForTests(): void {
  registry.clear()
}
