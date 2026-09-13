import { getPageFlow } from '../behaviors/usePageFlow'
import { create } from 'zustand'
import type { FocusEvent } from '../types'

// ============================================================
// Slice 类型
// ============================================================
interface ScrollSlice {
  pageProgress: number
  structureProgress: number
  scrollProgress: number
}

interface FocusSlice {
  focusEvent: FocusEvent | null
  focusedPlanetIdx: number
  focusedVoyager: boolean
  hoveredIdx: number
  /** null 表示新一轮聚焦尚未由场景时钟开始计时。 */
  focusStartTime: number | null
}

// ============================================================
// Actions
// ============================================================
interface ScrollActions {
  setPageProgress: (progress: number) => void
  setScrollProgress: (sp: number) => void
}

interface FocusActions {
  setFocusedPlanet: (idx: number) => void
  focusVoyager: () => void
  setHoveredIdx: (idx: number) => void
  setFocusStartTime: (t: number) => void
  clearFocus: (reason?: 'manual' | 'timeout' | 'scene') => void
}

// ============================================================
// Terminal slice
// ============================================================
export type TerminalMode = 'typing' | 'idle' | 'active'

export type DayNight = 'night' | 'day'

interface TerminalSlice {
  terminalMode: TerminalMode
  echoLines: string[]
  inputValue: string
  typewriterDone: boolean
  dayNight: DayNight
  debugMode: boolean
}

interface TerminalActions {
  setTerminalMode: (mode: TerminalMode) => void
  setInputValue: (val: string) => void
  appendEcho: (line: string) => void
  appendLastEcho: (text: string) => void
  setEchoLine: (index: number, text: string) => void
  clearInput: () => void
  setTypewriterDone: (done: boolean) => void
  setDayNight: (mode: DayNight) => void
  toggleDayNight: () => void
  setDebugMode: (enabled: boolean) => void
  toggleDebugMode: () => void
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
  pageProgress: 0,
  structureProgress: 0,
  scrollProgress: 0,
  setPageProgress: (progress) => set(getPageFlow(progress)),
  setScrollProgress: (sp) => set({ scrollProgress: sp }),

  // ---- Focus slice ----
  focusEvent: null,
  focusedPlanetIdx: -1,
  focusedVoyager: false,
  hoveredIdx: -1,
  focusStartTime: null,

  // ---- Terminal slice ----
  terminalMode: 'typing' as TerminalMode,
  echoLines: [] as string[],
  inputValue: '',
  typewriterDone: false,
  dayNight: 'night' as DayNight,
  debugMode: false,

  setFocusedPlanet: (idx) => set({ focusedVoyager: false, focusedPlanetIdx: idx, focusStartTime: null, focusEvent: { type: 'focus', planetIdx: idx } }),
  focusVoyager: () => set({ focusedVoyager: true, focusedPlanetIdx: -1, hoveredIdx: -1, focusStartTime: null, focusEvent: { type: 'voyager' } }),
  setHoveredIdx: (idx) => set({ hoveredIdx: idx }),
  setFocusStartTime: (t) => set({ focusStartTime: t }),
  clearFocus: (reason = 'manual') => set({
    focusEvent: { type: 'exit', reason },
    focusedPlanetIdx: -1,
    focusedVoyager: false,
    hoveredIdx: -1,
    focusStartTime: null,
  }),

  // ---- Terminal actions ----
  setTerminalMode: (mode) => set({ terminalMode: mode }),
  setInputValue: (val) => set({ inputValue: val }),
  appendEcho: (line) =>
    set((s) => ({ echoLines: [...s.echoLines, line] })),
  appendLastEcho: (text) =>
    set((s) => {
      const lines = [...s.echoLines]
      if (lines.length === 0) lines.push(text)
      else lines[lines.length - 1] += text
      return { echoLines: lines }
    }),
  setEchoLine: (index, text) =>
    set((s) => {
      const lines = [...s.echoLines]
      if (index >= 0 && index < lines.length) lines[index] = text
      return { echoLines: lines }
    }),
  clearInput: () => set({ inputValue: '' }),
  setTypewriterDone: (done) => set({ typewriterDone: done }),
  setDayNight: (mode) => set({ dayNight: mode }),
  toggleDayNight: () => set((s) => ({ dayNight: s.dayNight === 'night' ? 'day' : 'night' })),
  setDebugMode: (enabled) => {
    if (typeof window !== 'undefined') {
      ;(window as any).__DEBUG__ = enabled
    }
    set({ debugMode: enabled })
  },
  toggleDebugMode: () => set((s) => {
    const enabled = !s.debugMode
    if (typeof window !== 'undefined') {
      ;(window as any).__DEBUG__ = enabled
    }
    return { debugMode: enabled }
  }),
}))
