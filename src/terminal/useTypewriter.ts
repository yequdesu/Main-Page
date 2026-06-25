import { useEffect, useId, useState } from 'react'
import { useEffectScope } from '../composition/effectScope'

export interface TypewriterConfig {
  /** Delay before typing starts, in milliseconds. */
  startDelay?: number
  /** Delay between characters, in milliseconds. */
  charInterval?: number
  /** Text to reveal. */
  echoText: string
}

export interface TypewriterState {
  displayedText: string
  isTyping: boolean
  isDone: boolean
}

export function useTypewriter(config: TypewriterConfig): TypewriterState {
  const { startDelay = 800, charInterval = 40, echoText } = config
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(true)
  const [isDone, setIsDone] = useState(false)
  const id = useId()
  const scope = useEffectScope(`terminal.typewriter.${id}`)

  useEffect(() => {
    let idx = 0
    let cancelled = false

    setDisplayedText('')
    setIsTyping(true)
    setIsDone(false)

    const schedule = (delay: number) => {
      scope.setTimeout(() => {
        if (cancelled) return

        if (idx < echoText.length) {
          idx += 1
          setDisplayedText(echoText.slice(0, idx))
          schedule(charInterval)
          return
        }

        setIsTyping(false)
        setIsDone(true)
      }, delay)
    }

    schedule(startDelay)

    return () => {
      cancelled = true
      scope.cancel('typewriter reset')
    }
  }, [startDelay, charInterval, echoText, scope])

  return { displayedText, isTyping, isDone }
}
