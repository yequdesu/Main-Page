import { useCallback, useRef } from 'react'

export type EchoStrategy = 'direct' | 'line-by-line' | 'char-by-char'

interface EchoSequenceConfig {
  strategy?: EchoStrategy
  lineDelay?: number
  charInterval?: number
  /** 高度增长完成后 → 开始回显的延迟 (s) */
  growDelay?: number
  /** 每行内容替换后回调（用于平滑滚动） */
  onLineRevealed?: () => void
}

interface EchoSequenceAPI {
  play: (startIndex: number, lines: string[]) => Promise<void>
  cancel: () => void
}

/**
 * useEchoSequence — 命令输出动画控制器。
 * 两阶段：先占位触发高度增长，再逐行替换为实际文本。
 */
export function useEchoSequence(
  appendEcho: (line: string) => void,
  setEchoLine: (index: number, text: string) => void,
  config: EchoSequenceConfig = {},
): EchoSequenceAPI {
  const {
    strategy = 'line-by-line',
    lineDelay = 60,
    charInterval = 25,
    growDelay = 0.25,
    onLineRevealed,
  } = config

  const cancelledRef = useRef(false)

  const cancel = useCallback(() => { cancelledRef.current = true }, [])

  const play = useCallback(async (startIndex: number, lines: string[]) => {
    cancelledRef.current = false

    // Phase 1 — 占位触发高度增长
    for (let i = 0; i < lines.length; i++) {
      appendEcho(' ')
    }

    // Phase 2 — 等待延迟
    if (growDelay > 0) await delay(growDelay * 1000)
    if (cancelledRef.current) return

    if (strategy === 'direct') {
      for (let i = 0; i < lines.length; i++) {
        if (cancelledRef.current) return
        setEchoLine(startIndex + i, lines[i])
        onLineRevealed?.()
      }
      return
    }

    if (strategy === 'line-by-line') {
      for (let i = 0; i < lines.length; i++) {
        if (cancelledRef.current) return
        setEchoLine(startIndex + i, lines[i])
        onLineRevealed?.()
        await delay(lineDelay)
      }
      return
    }

    // char-by-char
    for (let i = 0; i < lines.length; i++) {
      if (cancelledRef.current) return
      let accum = ''
      for (const ch of lines[i]) {
        if (cancelledRef.current) return
        accum += ch
        setEchoLine(startIndex + i, accum)
      }
      onLineRevealed?.()
      await delay(charInterval)
    }
  }, [strategy, lineDelay, charInterval, growDelay, onLineRevealed, appendEcho, setEchoLine])

  return { play, cancel }
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }
