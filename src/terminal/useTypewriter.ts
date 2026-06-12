import { useState, useEffect, useRef } from 'react'

export interface TypewriterConfig {
  /** 开始打字前的延迟 (ms)，默认 800 */
  startDelay?: number
  /** 字符间隔 (ms)，默认 40 */
  charInterval?: number
  /** 要逐字打印的文本 */
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let idx = 0
    let cancelled = false

    const schedule = (delay: number) => {
      timerRef.current = setTimeout(() => {
        if (cancelled) return

        if (idx < echoText.length) {
          idx++
          setDisplayedText(echoText.slice(0, idx))
          schedule(charInterval)
        } else {
          setIsTyping(false)
          setIsDone(true)
        }
      }, delay)
    }

    schedule(startDelay)

    return () => {
      cancelled = true
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [startDelay, charInterval, echoText])

  return { displayedText, isTyping, isDone }
}
