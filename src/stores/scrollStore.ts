import { create } from 'zustand'
import type { FocusEvent } from '../types'

// ============================================================
// Slice 类型
// ============================================================
interface ScrollSlice {
  scrollProgress: number
}

interface FocusSlice {
  focusEvent: FocusEvent | null
  focusedPlanetIdx: number
  hoveredIdx: number
  /** null 表示新一轮聚焦尚未由场景时钟开始计时。 */
  focusStartTime: number | null
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
  /** InfoPanel welcome 完成 → 放行 planet-label TerminalBar 渲染 */
  labelsGateOpen: boolean
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
  setLabelsGateOpen: (open: boolean) => void
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
  focusEvent: null,
  focusedPlanetIdx: -1,
  hoveredIdx: -1,
  focusStartTime: null,

  // ---- Terminal slice ----
  terminalMode: 'typing' as TerminalMode,
  echoLines: [] as string[],
  inputValue: '',
  typewriterDone: false,
  labelsGateOpen: false,
  dayNight: 'night' as DayNight,

  setFocusedPlanet: (idx) => set({ focusedPlanetIdx: idx, focusStartTime: null, focusEvent: { type: 'focus', planetIdx: idx } }),
  setHoveredIdx: (idx) => set({ hoveredIdx: idx }),
  setFocusStartTime: (t) => set({ focusStartTime: t }),
  clearFocus: (reason = 'manual') => set({
    focusEvent: { type: 'exit', reason },
    focusedPlanetIdx: -1,
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
  setLabelsGateOpen: (open) => set({ labelsGateOpen: open }),
}))
