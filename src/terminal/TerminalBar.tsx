import { useEffect, useRef, useCallback, useState } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import { useTypewriter } from './useTypewriter'
import { executeCommand } from './commands'
import Scrollable from './Scrollable'
import type { ScrollableHandle, ScrollOverlayState } from './Scrollable'
import './TerminalBar.css'

// ---- 默认 typewriter 配置 ----
const DEFAULT_ECHO_TEXT = '# YeQuDesu · Personal Site · ready'

const ACT_NAMES: Record<number, string> = {
  0: 'OceanVoyage',
  1: 'GridTransition',
  2: 'ContentPhase',
}

function getActName(sp: number): string {
  if (sp < 0.45) return ACT_NAMES[0]
  if (sp < 0.85) return ACT_NAMES[1]
  return ACT_NAMES[2]
}

// ---- 颜色插值工具 ----
function lerpHex(a: string, b: string, t: number): string {
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const [ar, ag, ab] = p(a)
  const [br, bg, bb] = p(b)
  const rv = Math.round(ar + (br - ar) * t)
  const gv = Math.round(ag + (bg - ag) * t)
  const bv = Math.round(ab + (bb - ab) * t)
  return `#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`
}

function lerpRgba(a: string, b: string, t: number): string {
  const re = /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/
  const m = a.match(re)
  const n = b.match(re)
  if (!m || !n) return a
  const r = Math.round(+m[1] + (+n[1] - +m[1]) * t)
  const g = Math.round(+m[2] + (+n[2] - +m[2]) * t)
  const bb = Math.round(+m[3] + (+n[3] - +m[3]) * t)
  const alpha = +m[4] + (+n[4] - +m[4]) * t
  return `rgba(${r},${g},${bb},${alpha.toFixed(2)})`
}

export default function TerminalBar() {
  const terminalMode = useScrollStore((s) => s.terminalMode)
  const echoLines = useScrollStore((s) => s.echoLines)
  const inputValue = useScrollStore((s) => s.inputValue)
  const typewriterDone = useScrollStore((s) => s.typewriterDone)
  const setTerminalMode = useScrollStore((s) => s.setTerminalMode)
  const setInputValue = useScrollStore((s) => s.setInputValue)
  const appendEcho = useScrollStore((s) => s.appendEcho)
  const clearInput = useScrollStore((s) => s.clearInput)
  const setTypewriterDone = useScrollStore((s) => s.setTypewriterDone)

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  const barInnerRef = useRef<HTMLDivElement | null>(null)
  const scrollableRef = useRef<ScrollableHandle | null>(null)
  const [hasFocus, setHasFocus] = useState(false)

  // ---- 随 canvas 背景白化动态调整字体颜色 ----
  useEffect(() => {
    const update = () => {
      const sp = useScrollStore.getState().scrollProgress
      const raw = sp <= 0.40 ? 0 : sp >= 0.55 ? 1 : (sp - 0.40) / 0.15
      const t = raw * raw * (3 - 2 * raw) // smoothstep
      const el = barInnerRef.current
      if (!el) return
      el.style.setProperty('--tw-echo', lerpHex('#7c8aa0', '#475569', t))
      el.style.setProperty('--tw-prefix', lerpHex('#64748b', '#334155', t))
      el.style.setProperty('--tw-prompt', lerpHex('#0ea5e9', '#0369a1', t))
      el.style.setProperty('--tw-placeholder', lerpRgba('rgba(255,255,255,0.15)', 'rgba(0,0,0,0.10)', t))
      el.style.setProperty('--tw-input', lerpHex('#e2e8f0', '#1e293b', t))
      el.style.setProperty('--tw-cursor-bright', lerpHex('#e2e8f0', '#1e293b', t))
      el.style.setProperty('--tw-cursor-dim', lerpHex('#0ea5e9', '#0369a1', t))
    }
    update()
    const unsub = useScrollStore.subscribe(() => update())
    return unsub
  }, [])

  // ---- Typewriter ----
  const { displayedText, isTyping, isDone } = useTypewriter({
    startDelay: 800,
    charInterval: 40,
    echoText: DEFAULT_ECHO_TEXT,
  })

  useEffect(() => {
    if (isDone && !typewriterDone) {
      setTypewriterDone(true)
      setTerminalMode('idle')
    }
  }, [isDone, typewriterDone, setTypewriterDone, setTerminalMode])

  // ---- 状态行构建 ----
  const buildStatusLine = useCallback(() => {
    const sp = useScrollStore.getState().scrollProgress
    const pct = Math.round(sp * 100)
    const act = getActName(sp)
    return `# Act ${sp < 0.45 ? '1' : sp < 0.85 ? '2' : '3'} · ${act} · scroll ${pct}%`
  }, [])

  // 实时更新 echoLines[0]（idle/active 态）
  useEffect(() => {
    if (terminalMode === 'typing') return
    const update = () => {
      const line = buildStatusLine()
      const current = useScrollStore.getState().echoLines
      if (current[0] !== line) {
        useScrollStore.setState((s) => ({
          echoLines: [line, ...s.echoLines.slice(1)],
        }))
      }
    }
    update()
    const unsubscribe = useScrollStore.subscribe(() => update())
    return unsubscribe
  }, [terminalMode, buildStatusLine])

  // ---- echoLines 变化 → 自动滚动到底部 ----
  useEffect(() => {
    scrollableRef.current?.scrollToBottom()
  }, [echoLines])

  // ---- active 时自动聚焦隐藏 input ----
  useEffect(() => {
    if (terminalMode === 'active' && hiddenInputRef.current) {
      hiddenInputRef.current.focus()
    }
  }, [terminalMode])

  // ---- 非 active 时强制重置焦点状态 ----
  useEffect(() => {
    if (terminalMode !== 'active') {
      setHasFocus(false)
    }
  }, [terminalMode])

  // ---- click-to-focus: 点击 bar 任意位置激活 ----
  const handleBarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    const mode = useScrollStore.getState().terminalMode
    if (mode === 'idle') {
      setTerminalMode('active')
    }
  }, [setTerminalMode])

  // ---- 键盘处理 ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setTerminalMode('idle')
        clearInput()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const output = executeCommand(inputValue)
        if (output) {
          appendEcho(`$ ${inputValue}`)
          output.split('\n').forEach((line) => appendEcho(line))
        }
        clearInput()
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const lh = scrollableRef.current?.getLineHeight() ?? 18
        scrollableRef.current?.scrollBy({ top: -lh })
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const lh = scrollableRef.current?.getLineHeight() ?? 18
        scrollableRef.current?.scrollBy({ top: lh })
        return
      }
    },
    [inputValue, appendEcho, clearInput, setTerminalMode]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value)
    },
    [setInputValue]
  )

  const handleFocus = useCallback(() => {
    setHasFocus(true)
  }, [])

  const handleBlur = useCallback(() => {
    setHasFocus(false)
    setTimeout(() => {
      if (
        hiddenInputRef.current &&
        document.activeElement !== hiddenInputRef.current
      ) {
        setTerminalMode('idle')
        clearInput()
      }
    }, 100)
  }, [setTerminalMode, clearInput])

  // ---- 渲染 ----
  const isActive = terminalMode === 'active'
  const isTypingPhase = terminalMode === 'typing'
  const showInputLine = !isTypingPhase
  const inputLineVisible = showInputLine && (hasFocus || inputValue.length > 0)

  // ---- 滚动指示器 overlay ----
  const renderOverlay = useCallback(
    ({ canScrollUp, canScrollDown }: ScrollOverlayState) => (
      <>
        <span className={`echo-scroll-up${canScrollUp ? ' visible' : ''}`} aria-hidden="true">
          {'▲'}
        </span>
        <span className={`echo-scroll-down${canScrollDown ? ' visible' : ''}`} aria-hidden="true">
          {'▼'}
        </span>
      </>
    ),
    []
  )

  return (
    <div className="terminal-bar" aria-hidden={!isActive}>
      <div
        ref={barInnerRef}
        className={`terminal-bar-inner${isActive ? ' active' : ''}`}
        onClick={handleBarClick}
      >
        {/* 回显区 — Scrollable 驱动 */}
        <Scrollable
          ref={scrollableRef}
          scrollable={isActive}
          maxHeight="calc(6 * 1.6em)"
          overlay={renderOverlay}
          className="terminal-echo-scrollable"
        >
          <div className="terminal-echo">
            {isTypingPhase ? (
              <>
                <span className="echo-prefix">{displayedText}</span>
                <span className="terminal-typing-cursor">{'█'}</span>
              </>
            ) : (
              <>
                {echoLines.length > 0 && (
                  <span>
                    <span className="echo-prefix">{echoLines[0]}</span>
                  </span>
                )}
                {echoLines.slice(1).map((line, i) => (
                  <span key={i}>
                    {'\n'}
                    {line}
                  </span>
                ))}
              </>
            )}
          </div>
        </Scrollable>

        {/* 输入行 */}
        {showInputLine && (
          <div className={`terminal-input-line${inputLineVisible ? ' visible' : ''}`}>
            <span className="terminal-prompt">{'$'}</span>
            {!isActive && !inputValue && (
              <span className="terminal-cursor dim">{'█'}</span>
            )}
            {isActive && inputValue && (
              <span className="terminal-input-text">{inputValue}</span>
            )}
            {isActive && (
              <span className="terminal-cursor bright">{'█'}</span>
            )}
            {!inputValue && (
              <span className="terminal-placeholder">
                type 'help' for available commands
              </span>
            )}
            {isActive && (
              <input
                ref={hiddenInputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: 0,
                  height: 0,
                  border: 'none',
                  outline: 'none',
                  pointerEvents: 'none',
                }}
                aria-label="Terminal command input"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
