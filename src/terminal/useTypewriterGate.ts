import { useEffect, useId, useState } from 'react'
import { useEffectScope } from '../composition/effectScope'
import { useTypewriter } from './useTypewriter'
import type { WelcomeSlot } from './slots'

interface TypewriterGateResult {
  /** True after the typewriter completes and the optional exit gap has elapsed. */
  typewriterDone: boolean
  /** Raw typewriter completion state before the exit gap. */
  twDone: boolean
  /** Current welcome text, either typed progressively or shown directly. */
  typewriterDisplayed: string
  /** Public readiness flag used by TerminalBar mode transitions. */
  isTypewriterDone: boolean
}

export function useTypewriterGate(
  welcomeSlot: WelcomeSlot | undefined,
): TypewriterGateResult {
  const twCfg = welcomeSlot?.animation
  const useLiteral = twCfg?.inline === 'literal'
  const { displayedText, isDone: twDone } = useTypewriter({
    startDelay: useLiteral ? (twCfg?.startDelay ?? 800) : 0,
    charInterval: useLiteral ? (twCfg?.charInterval ?? 40) : 1,
    echoText: useLiteral ? (welcomeSlot?.text ?? '') : '',
  })

  const id = useId()
  const scope = useEffectScope(`terminal.typewriterGate.${id}`)
  const exitGap = welcomeSlot?.exitGap ?? 0
  const [typewriterDone, setTypewriterDone] = useState(false)

  useEffect(() => {
    if (!twDone) {
      setTypewriterDone(false)
      return undefined
    }
    if (typewriterDone) return undefined

    const timer = scope.setTimeout(() => setTypewriterDone(true), exitGap)
    return () => scope.clearTimer(timer)
  }, [twDone, typewriterDone, exitGap, scope])

  const directText = welcomeSlot && !useLiteral ? welcomeSlot.text : ''

  return {
    typewriterDone,
    twDone,
    typewriterDisplayed: useLiteral ? displayedText : directText,
    isTypewriterDone: useLiteral ? typewriterDone : true,
  }
}
