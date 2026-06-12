import { create } from 'zustand'
import type { OverlayData } from '../types'

// ============================================================
// Slice 类型
// ============================================================
interface ScrollSlice {
  scrollProgress: number
}

interface FocusSlice {
  focusedPlanetIdx: number
  hoveredIdx: number
  focusStartTime: number
  overlayData: OverlayData
}

// ============================================================
// Actions
// ============================================================
interface ScrollActions {
  setScrollProgress: (sp: number) => void
}

interface FocusActions {
  setFocusedPlanet: (idx: number) => void
  setHoveredIdx: (idx: number) => void
  setFocusStartTime: (t: number) => void
  setOverlayData: (data: OverlayData) => void
  clearFocus: () => void
}

// ============================================================
// Terminal slice
// ============================================================
export type TerminalMode = 'typing' | 'idle' | 'active'

interface TerminalSlice {
  terminalMode: TerminalMode
  echoLines: string[]
  inputValue: string
  typewriterDone: boolean
}

interface TerminalActions {
  setTerminalMode: (mode: TerminalMode) => void
  setInputValue: (val: string) => void
  appendEcho: (line: string) => void
  clearInput: () => void
  setTypewriterDone: (done: boolean) => void
}

export type ScrollStore = ScrollSlice & FocusSlice & TerminalSlice & ScrollActions & FocusActions & TerminalActions

// ============================================================
// Store
// 援引：
//   Zustand transient API — R3F Best Practices: getState() in useFrame
//   Slice 模式 — Galaxy Voyager (220+ systems), HekTek City v4
// ============================================================
export const useScrollStore = create<ScrollStore>()((set) => ({
  // ---- Scroll slice ----
  scrollProgress: 0,
  setScrollProgress: (sp) => set({ scrollProgress: sp }),

  // ---- Focus slice ----
  focusedPlanetIdx: -1,
  hoveredIdx: -1,
  focusStartTime: 0,
  overlayData: { focused: false },

  // ---- Terminal slice ----
  terminalMode: 'typing' as TerminalMode,
  echoLines: [] as string[],
  inputValue: '',
  typewriterDone: false,

  setFocusedPlanet: (idx) => set({ focusedPlanetIdx: idx }),
  setHoveredIdx: (idx) => set({ hoveredIdx: idx }),
  setFocusStartTime: (t) => set({ focusStartTime: t }),
  setOverlayData: (data) => set({ overlayData: data }),
  clearFocus: () => set({
    focusedPlanetIdx: -1,
    hoveredIdx: -1,
    focusStartTime: 0,
    overlayData: { focused: false },
  }),

  // ---- Terminal actions ----
  setTerminalMode: (mode) => set({ terminalMode: mode }),
  setInputValue: (val) => set({ inputValue: val }),
  appendEcho: (line) =>
    set((s) => ({ echoLines: [...s.echoLines, line] })),
  clearInput: () => set({ inputValue: '' }),
  setTypewriterDone: (done) => set({ typewriterDone: done }),
}))
