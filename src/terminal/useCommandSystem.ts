import { useCallback, useId } from 'react'
import { useEffectScope } from '../composition/effectScope'
import type { ScrollableHandle } from './Scrollable'

export interface CommandSystemDeps {
  mode: string
  inputValue: string
  setMode: (mode: string) => void
  clearInput: () => void
  setInputValue: (val: string) => void
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
  const id = useId()
  const scope = useEffectScope(`terminal.commandSystem.${id}`)

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
          if (deps.onClear) {
            deps.onClear()
            return
          }
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
      }
    },
    [deps],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => deps.setInputValue(e.target.value),
    [deps.setInputValue],
  )

  const handleFocus = useCallback(() => deps.setHasFocus(true), [deps.setHasFocus])

  const handleBlur = useCallback(() => {
    deps.setHasFocus(false)
    scope.setTimeout(() => {
      if (deps.hiddenInputRef.current && document.activeElement !== deps.hiddenInputRef.current) {
        deps.setMode('idle')
        deps.clearInput()
      }
    }, deps.blurTimeout)
  }, [deps, scope])

  return { handleKeyDown, handleInputChange, handleFocus, handleBlur }
}
