import { useCallback } from 'react'
import type { ScrollableHandle } from './Scrollable'

// ============================================================
// useCommandSystem — 命令交互 hook
//
// playEcho / clearEcho 不直接操控 echoLines。调用方通过
// Slot 管线（虚拟 Section slot）实现输出渲染。
// ============================================================

export interface CommandSystemDeps {
  mode: string
  inputValue: string
  setMode: (mode: string) => void
  clearInput: () => void
  setInputValue: (val: string, cursorPos: number) => void
  playEcho: (lines: string[]) => void
  clearEcho: () => void
  onCommand?: (input: string) => string
  onClear?: () => void
  promptChar: string
  scrollableRef: React.RefObject<ScrollableHandle | null>
  blurTimeout: number
  hiddenInputRef: React.RefObject<HTMLInputElement | null>
  setHasFocus: (f: boolean) => void
}

export function useCommandSystem(deps: CommandSystemDeps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        deps.setMode('idle')
        deps.clearInput()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const trimmed = deps.inputValue.trim()
        deps.clearInput()

        if (trimmed === 'clear' || trimmed === 'cls') {
          if (deps.onClear) { deps.onClear(); return }
          deps.clearEcho()
          return
        }

        const output = deps.onCommand?.(trimmed)
        if (output) {
          deps.playEcho([`${deps.promptChar} ${trimmed}`, ...output.split('\n')])
        }
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const lh = deps.scrollableRef.current?.getLineHeight() ?? 18
        deps.scrollableRef.current?.scrollBy({ top: -lh })
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const lh = deps.scrollableRef.current?.getLineHeight() ?? 18
        deps.scrollableRef.current?.scrollBy({ top: lh })
        return
      }
    },
    [deps],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget
      // 粘贴和输入法不一定触发 keyup / select，必须在 input 事件中读取新光标。
      deps.setInputValue(input.value, input.selectionStart ?? input.value.length)
    },
    [deps.setInputValue],
  )

  const handleFocus = useCallback(() => deps.setHasFocus(true), [deps.setHasFocus])

  const handleBlur = useCallback(() => {
    deps.setHasFocus(false)
    setTimeout(() => {
      if (deps.hiddenInputRef.current && document.activeElement !== deps.hiddenInputRef.current) {
        deps.setMode('idle')
        deps.clearInput()
      }
    }, deps.blurTimeout)
  }, [deps])

  return { handleKeyDown, handleInputChange, handleFocus, handleBlur }
}
