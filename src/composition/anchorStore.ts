import { create } from 'zustand'
import type { CoordinateSpace } from './coordinate'

export type DataRef = string

export interface Anchor<T = unknown> {
  id: DataRef
  space: CoordinateSpace
  value: T
  visible?: boolean
  producer: string
  frameId: number
  updatedAt: number
}

export type AnchorInput<T = unknown> = Omit<Anchor<T>, 'updatedAt'>

interface AnchorStoreState {
  anchors: Record<DataRef, Anchor>
  frameId: number
  setFrameId: (frameId: number) => void
  setAnchor: <T>(anchor: AnchorInput<T>) => void
  setAnchors: (anchors: AnchorInput[]) => void
  removeAnchor: (id: DataRef) => void
  clearProducer: (producer: string) => void
}

export const useAnchorStore = create<AnchorStoreState>()((set) => ({
  anchors: {},
  frameId: 0,
  setFrameId: (frameId) => set({ frameId }),
  setAnchor: (anchor) =>
    set((state) => ({
      anchors: {
        ...state.anchors,
        [anchor.id]: {
          ...anchor,
          updatedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        },
      },
    })),
  setAnchors: (anchors) =>
    set((state) => {
      const updatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const next = { ...state.anchors }
      for (const anchor of anchors) {
        next[anchor.id] = { ...anchor, updatedAt }
      }
      return { anchors: next }
    }),
  removeAnchor: (id) =>
    set((state) => {
      const next = { ...state.anchors }
      delete next[id]
      return { anchors: next }
    }),
  clearProducer: (producer) =>
    set((state) => ({
      anchors: Object.fromEntries(
        Object.entries(state.anchors).filter(([, anchor]) => anchor.producer !== producer),
      ),
    })),
}))

export function readAnchor<T = unknown>(id: DataRef): Anchor<T> | undefined {
  return useAnchorStore.getState().anchors[id] as Anchor<T> | undefined
}

export function isStaleAnchor(anchor: Anchor, currentFrameId = useAnchorStore.getState().frameId): boolean {
  return anchor.frameId < currentFrameId
}
