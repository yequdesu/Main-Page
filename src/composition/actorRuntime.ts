import { useEffect } from 'react'
import { create } from 'zustand'
import type { ActorSpec } from './actorRegistry'
import { CORE_ACTORS } from './coreActors'

export interface ActorRuntimeState {
  id: string
  mounted: boolean
  active: boolean
  frameCount: number
  lastFrameId: number
  lastUpdatedAt: number
  note?: string
}

interface ActorRuntimeStoreState {
  actors: Record<string, ActorRuntimeState>
  setActorMounted: (id: string, mounted: boolean, active?: boolean, note?: string) => void
  setActorActive: (id: string, active: boolean, note?: string) => void
  touchActorFrame: (id: string, frameId: number, active?: boolean, note?: string) => void
  clearActor: (id: string) => void
  resetActors: () => void
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function defaultActorState(id: string): ActorRuntimeState {
  return {
    id,
    mounted: false,
    active: false,
    frameCount: 0,
    lastFrameId: -1,
    lastUpdatedAt: now(),
  }
}

export const useActorRuntimeStore = create<ActorRuntimeStoreState>()((set) => ({
  actors: {},
  setActorMounted: (id, mounted, active = mounted, note) =>
    set((state) => {
      const current = state.actors[id] ?? defaultActorState(id)
      return {
        actors: {
          ...state.actors,
          [id]: {
            ...current,
            mounted,
            active,
            note,
            lastUpdatedAt: now(),
          },
        },
      }
    }),
  setActorActive: (id, active, note) =>
    set((state) => {
      const current = state.actors[id] ?? defaultActorState(id)
      return {
        actors: {
          ...state.actors,
          [id]: {
            ...current,
            active,
            note,
            lastUpdatedAt: now(),
          },
        },
      }
    }),
  touchActorFrame: (id, frameId, active = true, note) =>
    set((state) => {
      const current = state.actors[id] ?? defaultActorState(id)
      return {
        actors: {
          ...state.actors,
          [id]: {
            ...current,
            mounted: true,
            active,
            frameCount: current.frameCount + 1,
            lastFrameId: frameId,
            note,
            lastUpdatedAt: now(),
          },
        },
      }
    }),
  clearActor: (id) =>
    set((state) => {
      const next = { ...state.actors }
      delete next[id]
      return { actors: next }
    }),
  resetActors: () => set({ actors: {} }),
}))

export function useActorRuntime(id: string, active = true, note?: string): void {
  useEffect(() => {
    useActorRuntimeStore.getState().setActorMounted(id, true, active, note)
    return () => {
      useActorRuntimeStore.getState().setActorMounted(id, false, false, note)
    }
  }, [id])

  useEffect(() => {
    useActorRuntimeStore.getState().setActorActive(id, active, note)
  }, [id, active, note])
}

export function touchActorFrame(id: string, frameId: number, active = true, note?: string): void {
  useActorRuntimeStore.getState().touchActorFrame(id, frameId, active, note)
}

export function getActorRuntimeSnapshot(specs: ActorSpec[] = CORE_ACTORS): Array<ActorSpec & { runtime?: ActorRuntimeState }> {
  const runtime = useActorRuntimeStore.getState().actors
  return specs.map((spec) => ({ ...spec, runtime: runtime[spec.id] }))
}
