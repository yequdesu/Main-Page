import { useState, useCallback } from 'react'
import type { TerminalMode } from '../stores/scrollStore'

// ============================================================
// useTerminalState — 受控/非受控终端状态管理
//
// 受控模式：调用方提供 mode / echoLines / inputValue，
//          组件通过 on* 回调通知变更。用于 Zustand / Redux 集成。
// 非受控模式：props 缺省时，hook 内部 useState 自管理。
//
// 同步批处理保证：
//   appendEcho / setEchoLine 内部始终使用 functional update（setState(prev => ...)），
//   确保同一事件处理中多次调用正确累积。on* 回调接收累积后的完整数组。
// ============================================================

interface UseTerminalStateOptions {
  mode?: TerminalMode
  echoLines?: string[]
  inputValue?: string
  typewriterDone?: boolean
  welcomeText: string
  onModeChange?: (mode: TerminalMode) => void
  onEchoLinesChange?: (lines: string[]) => void
  onInputValueChange?: (value: string) => void
  onTypewriterDoneChange?: (done: boolean) => void
}

interface TerminalState {
  mode: TerminalMode
  echoLines: string[]
  inputValue: string
  typewriterDone: boolean
  setMode: (mode: TerminalMode) => void
  appendEcho: (line: string) => void
  setEchoLine: (index: number, text: string) => void
  setInputValue: (val: string) => void
  clearInput: () => void
  setTypewriterDone: (done: boolean) => void
  /** 重置为欢迎状态：mode='idle' + echoLines=[welcomeText]（用于 typewriter 完成） */
  resetToWelcome: () => void
  /** 仅清空回显区为欢迎文本，保持 mode 不变（用于 clear/cls 命令） */
  clearEcho: () => void
}

export function useTerminalState(opts: UseTerminalStateOptions): TerminalState {
  const { welcomeText, onModeChange, onEchoLinesChange, onInputValueChange, onTypewriterDoneChange } = opts

  // 内部状态（非受控模式后备，受控模式下作为同步批处理累加器）
  const [internalMode, setInternalMode] = useState<TerminalMode>(opts.mode ?? 'typing')
  const [internalEchoLines, setInternalEchoLines] = useState<string[]>(opts.echoLines ?? [])
  const [internalInputValue, setInternalInputValue] = useState(opts.inputValue ?? '')
  const [internalTypewriterDone, setInternalTypewriterDone] = useState(opts.typewriterDone ?? false)

  // 当前值：受控取 props，非受控取内部 state
  const mode = opts.mode ?? internalMode
  const echoLines = opts.echoLines ?? internalEchoLines
  const inputValue = opts.inputValue ?? internalInputValue
  const typewriterDone = opts.typewriterDone ?? internalTypewriterDone

  const setMode = useCallback((m: TerminalMode) => {
    setInternalMode(m)
    onModeChange?.(m)
  }, [onModeChange])

  // functional update 保证同事件处理中多次调用的累积正确性
  const appendEcho = useCallback((line: string) => {
    setInternalEchoLines(prev => {
      const next = [...prev, line]
      onEchoLinesChange?.(next)
      return next
    })
  }, [onEchoLinesChange])

  const setEchoLine = useCallback((index: number, text: string) => {
    setInternalEchoLines(prev => {
      const next = [...prev]
      if (index >= 0 && index < next.length) next[index] = text
      onEchoLinesChange?.(next)
      return next
    })
  }, [onEchoLinesChange])

  const setInputValue = useCallback((val: string) => {
    setInternalInputValue(val)
    onInputValueChange?.(val)
  }, [onInputValueChange])

  const clearInput = useCallback(() => {
    setInternalInputValue('')
    onInputValueChange?.('')
  }, [onInputValueChange])

  const setTypewriterDone = useCallback((done: boolean) => {
    setInternalTypewriterDone(done)
    onTypewriterDoneChange?.(done)
  }, [onTypewriterDoneChange])

  const clearEcho = useCallback(() => {
    const lines = [welcomeText]
    setInternalEchoLines(lines)
    onEchoLinesChange?.(lines)
  }, [welcomeText, onEchoLinesChange])

  const resetToWelcome = useCallback(() => {
    const lines = [welcomeText]
    setInternalMode('idle')
    setInternalEchoLines(lines)
    onModeChange?.('idle')
    onEchoLinesChange?.(lines)
  }, [welcomeText, onModeChange, onEchoLinesChange])

  return {
    mode,
    echoLines,
    inputValue,
    typewriterDone,
    setMode,
    appendEcho,
    setEchoLine,
    setInputValue,
    clearInput,
    setTypewriterDone,
    clearEcho,
    resetToWelcome,
  }
}
