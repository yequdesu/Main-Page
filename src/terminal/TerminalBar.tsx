import { useEffect, useRef, useCallback, useState } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import { useTypewriter } from './useTypewriter'
import { executeCommand } from './commands'
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
  const echoRef = useRef<HTMLDivElement | null>(null)
  const [hasFocus, setHasFocus] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

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

  // 打字完成 &#x2192; 切换到 idle
  useEffect(() => {
    if (isDone && !typewriterDone) {
      setTypewriterDone(true)
      setTerminalMode('idle')
    }
  }, [isDone, typewriterDone, setTypewriterDone, setTerminalMode])

  // ---- 回显区内容 ----
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

  // ---- 回显区滚动 ----
  const lineHeightRef = useRef(0)

  const getLineHeight = useCallback(() => {
    if (lineHeightRef.current > 0) return lineHeightRef.current
    const el = echoRef.current
    if (!el) return 18
    const lh = parseFloat(getComputedStyle(el).lineHeight)
    lineHeightRef.current = Number.isNaN(lh) ? 18 : lh
    return lineHeightRef.current
  }, [])

  const checkScroll = useCallback(() => {
    const el = echoRef.current
    if (!el) return
    const st = el.scrollTop
    const ch = el.clientHeight
    const sh = el.scrollHeight
    setCanScrollUp(st > 0.5)
    setCanScrollDown(st + ch < sh - 0.5)
  }, [])

  // 命令输出后自动滚到底部
  useEffect(() => {
    const el = echoRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      checkScroll()
    })
  }, [echoLines, checkScroll])

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
        const lh = getLineHeight()
        echoRef.current?.scrollBy({ top: -lh, behavior: 'smooth' })
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const lh = getLineHeight()
        echoRef.current?.scrollBy({ top: lh, behavior: 'smooth' })
        return
      }
    },
    [inputValue, appendEcho, clearInput, setTerminalMode, getLineHeight]
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

  return (
    <div className="terminal-bar" aria-hidden={!isActive}>
      <div ref={barInnerRef} className={`terminal-bar-inner${isActive ? ' active' : ''}`}>
        {/* 回显区 */}
        <div className="terminal-echo" ref={echoRef} onScroll={checkScroll}>
          {/* ▲ sticky top — 内容首行，吸附可视窗口顶部 */}
          <span className={`echo-scroll-up${canScrollUp ? ' visible' : ''}`}>{'▲'}</span>
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
          {/* ▼ sticky bottom — 内容末行，吸附可视窗口底部 */}
          <span className={`echo-scroll-down${canScrollDown ? ' visible' : ''}`}>{'▼'}</span>
        </div>

        {/* 输入行 — typing 阶段隐藏；idle/active 通过 visible class 控制显隐 */}
        {showInputLine && (
          <div className={`terminal-input-line${inputLineVisible ? ' visible' : ''}`}>
            <span className="terminal-prompt">{'$'}</span>
            {/* 光标 — idle dim 在行首（placeholder 前），active 亮在输入文本后 */}
            {!isActive && !inputValue && (
              <span className="terminal-cursor dim">{'█'}</span>
            )}
            {/* 用户输入文本（active + 有输入） */}
            {isActive && inputValue && (
              <span className="terminal-input-text">{inputValue}</span>
            )}
            {/* active 光标跟随在输入文本末尾 */}
            {isActive && (
              <span className="terminal-cursor bright">{'█'}</span>
            )}
            {/* placeholder（无输入时光标之后，idle/active 通用） */}
            {!inputValue && (
              <span className="terminal-placeholder">
                type 'help' for available commands
              </span>
            )}
            {/* 隐藏的 input 接收键盘 */}
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
