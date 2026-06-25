import { useCallback } from 'react'
import { create } from 'zustand'

export type PhaseName = string
export type SignalName = string
export type SequenceId = string

export interface SequenceDef {
  id: SequenceId
  initial: PhaseName
  phases: PhaseName[]
  on: Record<PhaseName, Record<SignalName, PhaseName>>
  parent?: SequenceId
  parentPhase?: PhaseName
  parentDoneSignal?: SignalName
  resetOn?: string[]
  reversible?: false
}

export interface SequenceState {
  phase: PhaseName
  active: boolean
  lastSignal?: SignalName
  updatedAt: number
}

export interface SequenceEvent {
  seqId: SequenceId
  signal: SignalName
  from: PhaseName
  to: PhaseName
  at: number
}

interface SequenceStoreState {
  defs: Record<SequenceId, SequenceDef>
  states: Record<SequenceId, SequenceState>
  events: SequenceEvent[]
  define: (def: SequenceDef) => void
  signal: (seqId: SequenceId, signal: SignalName) => void
  reset: (seqId: SequenceId) => void
  resetAll: () => void
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function isSequenceAvailable(def: SequenceDef, states: Record<SequenceId, SequenceState>): boolean {
  if (!def.parent || !def.parentPhase) return true
  return states[def.parent]?.phase === def.parentPhase
}

export function phaseAtOrAfter(def: SequenceDef | undefined, phase: PhaseName | undefined, target: PhaseName): boolean {
  if (!def || !phase) return false
  const currentIndex = def.phases.indexOf(phase)
  const targetIndex = def.phases.indexOf(target)
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex
}

export const useSequenceStore = create<SequenceStoreState>()((set, get) => ({
  defs: {},
  states: {},
  events: [],
  define: (def) =>
    set((state) => ({
      defs: { ...state.defs, [def.id]: def },
      states: {
        ...state.states,
        [def.id]: state.states[def.id] ?? {
          phase: def.initial,
          active: true,
          updatedAt: now(),
        },
      },
    })),
  signal: (seqId, signal) => {
    const { defs, states } = get()
    const def = defs[seqId]
    const current = states[seqId]
    if (!def || !current?.active) return
    if (!isSequenceAvailable(def, states)) return

    const next = def.on[current.phase]?.[signal]
    if (!next) return

    const at = now()
    if (next === '__parent__') {
      const to = def.phases.includes('complete') ? 'complete' : current.phase
      set((state) => ({
        states: {
          ...state.states,
          [seqId]: {
            phase: to,
            active: false,
            lastSignal: signal,
            updatedAt: at,
          },
        },
        events: [
          ...state.events.slice(-99),
          { seqId, signal, from: current.phase, to, at },
        ],
      }))
      if (def.parent) {
        get().signal(def.parent, def.parentDoneSignal ?? `${seqId}:done`)
      }
      return
    }

    const isComplete = next === 'complete' || next === '__complete__'
    const to = next === '__complete__' ? 'complete' : next

    set((state) => ({
      states: {
        ...state.states,
        [seqId]: {
          phase: to,
          active: !isComplete,
          lastSignal: signal,
          updatedAt: at,
        },
      },
      events: [
        ...state.events.slice(-99),
        { seqId, signal, from: current.phase, to, at },
      ],
    }))
  },
  reset: (seqId) => {
    const def = get().defs[seqId]
    if (!def) return
    set((state) => ({
      states: {
        ...state.states,
        [seqId]: {
          phase: def.initial,
          active: true,
          updatedAt: now(),
        },
      },
    }))
  },
  resetAll: () =>
    set((state) => ({
      states: Object.fromEntries(
        Object.values(state.defs).map((def) => [
          def.id,
          { phase: def.initial, active: true, updatedAt: now() },
        ]),
      ),
    })),
}))

export function defineSequence(def: SequenceDef): void {
  useSequenceStore.getState().define(def)
}

export function signalSequence(seqId: SequenceId, signal: SignalName): void {
  useSequenceStore.getState().signal(seqId, signal)
}

export function resetSequence(seqId: SequenceId): void {
  useSequenceStore.getState().reset(seqId)
}

export function usePhase(seqId: SequenceId): PhaseName {
  return useSequenceStore((state) => state.states[seqId]?.phase ?? state.defs[seqId]?.initial ?? 'idle')
}

export function useSequenceActive(seqId: SequenceId): boolean {
  return useSequenceStore((state) => {
    const def = state.defs[seqId]
    const sequence = state.states[seqId]
    return Boolean(sequence?.active && def && isSequenceAvailable(def, state.states))
  })
}

export function usePhaseAtOrAfter(seqId: SequenceId, target: PhaseName): boolean {
  return useSequenceStore((state) => {
    const def = state.defs[seqId]
    const phase = state.states[seqId]?.phase
    return phaseAtOrAfter(def, phase, target)
  })
}

export function useSignal(seqId: SequenceId): (signal: SignalName) => void {
  const dispatch = useSequenceStore((state) => state.signal)
  return useCallback((signal: SignalName) => dispatch(seqId, signal), [dispatch, seqId])
}
