import { useEffect, useRef, useCallback, useState } from 'react'
import { useTypewriter } from './useTypewriter'
import Scrollable from './Scrollable'
import type { ScrollableHandle, ScrollOverlayState } from './Scrollable'
import { useEchoSequence } from './useEchoSequence'
import type { EchoStrategy } from './useEchoSequence'
import { useAnimateHeight } from './useAnimateHeight'
import { useTerminalState } from './useTerminalState'
import type { TerminalMode } from '../stores/scrollStore'
import './TerminalBar.css'

// ============================================================
// 默认配置 — 所有值可在 props 中覆盖
// ============================================================

interface TerminalBarTextConfig {
  welcomeText?: string
  placeholder?: string
  promptChar?: string
}

interface TerminalBarLayoutConfig {
  maxEchoLines?: number
  maxWidth?: string
  borderRadius?: string
  padding?: string
  fontSize?: string
  fontFamily?: string
  zIndex?: number
  bottom?: string
}

interface TerminalBarAnimationConfig {
  typewriterStartDelay?: number
  typewriterCharInterval?: number
  echoLineDelay?: number
  echoCharInterval?: number
  echoStrategy?: EchoStrategy
  echoGrowDelay?: number
  heightAnimPerLine?: number
}

interface TerminalBarBehaviorConfig {
  activationKey?: string
  blurTimeout?: number
}

export interface TerminalBarProps {
  // === 参数化配置 ===
  text?: TerminalBarTextConfig
  layout?: TerminalBarLayoutConfig
  animation?: TerminalBarAnimationConfig
  behavior?: TerminalBarBehaviorConfig

  // === 受控状态（缺省时组件内部自管理） ===
  mode?: TerminalMode
  echoLines?: string[]
  inputValue?: string
  typewriterDone?: boolean
  onModeChange?: (mode: TerminalMode) => void
  onEchoLinesChange?: (lines: string[]) => void
  onInputValueChange?: (value: string) => void
  onTypewriterDoneChange?: (done: boolean) => void

  // === 命令执行（缺省时仅 clear/cls 可用） ===
  /** 返回命令输出字符串；缺省时仅 clear/cls 工作 */
  onCommand?: (input: string) => string
  /** clear 行为；缺省 = resetToWelcome */
  onClear?: () => void

  // === 滚动驱动注入（缺省时对应功能关闭） ===
  scrollProgress?: number
  /** 返回状态行文本；返回 null 表示跳过 */
  buildStatusLine?: (sp: number) => string | null
  /** 返回 CSS 变量名 → 值的映射；用于动态颜色过渡 */
  onThemeUpdate?: (sp: number) => Record<string, string> | void
}

// ---- 内部默认值 ----
const DEFAULTS = {
  text: {
    welcomeText: '# YeQuDesu · Personal Site · ready',
    placeholder: "type 'help' for available commands",
    promptChar: '$',
  },
  layout: {
    maxEchoLines: 5,
    maxWidth: 'min(90vw, 640px)',
    borderRadius: '12px',
    padding: '8px 14px',
    fontSize: '0.68rem',
    fontFamily: "'SF Mono','Fira Code','Cascadia Code','Consolas',monospace",
    zIndex: 15,
    bottom: '2rem',
  },
  animation: {
    typewriterStartDelay: 800,
    typewriterCharInterval: 40,
    echoLineDelay: 60,
    echoCharInterval: 25,
    echoStrategy: 'line-by-line' as EchoStrategy,
    echoGrowDelay: 0.25,
    heightAnimPerLine: 0.15,
  },
  behavior: {
    activationKey: '/',
    blurTimeout: 100,
  },
}

export default function TerminalBar(props: TerminalBarProps = {}) {
  const T = { ...DEFAULTS.text, ...props.text }
  const L = { ...DEFAULTS.layout, ...props.layout }
  const A = { ...DEFAULTS.animation, ...props.animation }
  const B = { ...DEFAULTS.behavior, ...props.behavior }

  // ---- 状态（受控/非受控） ----
  const state = useTerminalState({
    mode: props.mode,
    echoLines: props.echoLines,
    inputValue: props.inputValue,
    typewriterDone: props.typewriterDone,
    welcomeText: T.welcomeText,
    onModeChange: props.onModeChange,
    onEchoLinesChange: props.onEchoLinesChange,
    onInputValueChange: props.onInputValueChange,
    onTypewriterDoneChange: props.onTypewriterDoneChange,
  })

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  const barInnerRef = useRef<HTMLDivElement | null>(null)
  const scrollableRef = useRef<ScrollableHandle | null>(null)
  const [hasFocus, setHasFocus] = useState(false)

  // ---- Echo 动画 ----
  const echoPlayingRef = useRef(false)

  const handleLineRevealed = useCallback(() => {
    const el = scrollableRef.current?.getScrollElement()
    if (!el) return
    const lh = scrollableRef.current?.getLineHeight() ?? 18
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - lh * 1.5
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  const { play: _playEcho, cancel: cancelEcho } = useEchoSequence(
    state.appendEcho, state.setEchoLine,
    { strategy: A.echoStrategy, lineDelay: A.echoLineDelay, charInterval: A.echoCharInterval, growDelay: A.echoGrowDelay, onLineRevealed: handleLineRevealed },
  )

  const playEcho = useCallback(async (startIndex: number, lines: string[]) => {
    echoPlayingRef.current = true
    await _playEcho(startIndex, lines)
    echoPlayingRef.current = false
  }, [_playEcho])

  // ---- 动态颜色过渡（由调用方注入） ----
  useEffect(() => {
    const sp = props.scrollProgress
    if (sp === undefined || !props.onThemeUpdate) return
    const el = barInnerRef.current
    if (!el) return
    const vars = props.onThemeUpdate(sp)
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        el.style.setProperty(key, value as string)
      }
    }
  }, [props.scrollProgress, props.onThemeUpdate])

  // ---- Typewriter ----
  const { displayedText, isTyping, isDone } = useTypewriter({
    startDelay: A.typewriterStartDelay,
    charInterval: A.typewriterCharInterval,
    echoText: T.welcomeText,
  })

  // ---- Typewriter 完成 → idle 过渡 ----
  // 延迟 1.5 个 cursor-blink 周期（blink=1s step-end）后进入 idle，
  // 给 welcome text 与 status line 之间留出视觉间隙
  const typewriterTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (isDone && !state.typewriterDone) {
      // setTypewriterDone 必须延迟到 timeout 回调内——
      // 若在此处同步调用，会立即触发 effect 重跑（typewriterDone 在 deps 中），
      // cleanup 的 clearTimeout 会杀死刚设置的 timer，导致过渡永远不会发生
      typewriterTimerRef.current = setTimeout(() => {
        state.setTypewriterDone(true)
        state.setMode('idle')
        if (state.echoLines.length === 0) state.resetToWelcome()
      }, 1500)
    }
    return () => { if (typewriterTimerRef.current) clearTimeout(typewriterTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, state.typewriterDone])

  // ---- 状态行（由调用方注入 buildStatusLine） ----
  const statusLineIdx = useRef(-1)

  // echoLines 被重置为仅欢迎文本时（如 clear），同步重置位置缓存
  useEffect(() => {
    if (state.echoLines.length <= 1) statusLineIdx.current = -1
  }, [state.echoLines])

  useEffect(() => {
    if (state.mode === 'typing' || !props.buildStatusLine || props.scrollProgress === undefined) return
    const update = () => {
      if (echoPlayingRef.current) return
      const line = props.buildStatusLine!(props.scrollProgress!)
      if (line === null) return
      const lines = state.echoLines
      let idx = statusLineIdx.current
      if (idx < 0 || idx >= lines.length || !lines[idx].startsWith('# Act ')) {
        idx = -1
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith('# Act ')) { idx = i; break }
        }
      }
      if (idx >= 0 && idx < lines.length && lines[idx] !== line) {
        state.setEchoLine(idx, line)
      } else if (idx < 0 && lines.length > 0) {
        state.appendEcho(line)
        statusLineIdx.current = lines.length
      }
    }
    update()
  }, [props.scrollProgress, props.buildStatusLine, state.mode, state.echoLines, state.setEchoLine, state.appendEcho])

  // ---- 高度动画 ----
  useAnimateHeight(
    () => scrollableRef.current?.getScrollElement(),
    state.echoLines,
    { durationPerLine: A.heightAnimPerLine, onComplete: () => scrollableRef.current?.scrollToBottom() },
  )

  // ---- active 时自动聚焦 ----
  useEffect(() => {
    if (state.mode === 'active' && hiddenInputRef.current) {
      hiddenInputRef.current.focus()
    }
  }, [state.mode])

  useEffect(() => {
    if (state.mode !== 'active') setHasFocus(false)
  }, [state.mode])

  // ---- click-to-focus ----
  const handleBarClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    if (state.mode === 'idle') state.setMode('active')
  }, [state.mode, state.setMode])

  // ---- 键盘处理 ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        state.setMode('idle')
        state.clearInput()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const trimmed = state.inputValue.trim()
        state.clearInput()

        if (trimmed === 'clear' || trimmed === 'cls') {
          if (props.onClear) { props.onClear(); return }
          // 一次构建完整数组（欢迎文本 + 状态行），避免分步更新导致
          // useLayoutEffect 残留回调覆盖动画状态（见 useAnimateHeight 时序）
          const statusLine = props.buildStatusLine?.(props.scrollProgress ?? 0)
          const lines = statusLine ? [T.welcomeText, statusLine] : [T.welcomeText]
          props.onEchoLinesChange?.(lines)
          return
        }

        const output = props.onCommand?.(trimmed)
        if (output) {
          const startIndex = state.echoLines.length
          playEcho(startIndex, [`${T.promptChar} ${trimmed}`, ...output.split('\n')])
        }
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
    [state.inputValue, state.clearInput, state.setMode, state.echoLines.length, props.onCommand, props.onClear, T.promptChar, playEcho, props.onEchoLinesChange, props.buildStatusLine, props.scrollProgress, T.welcomeText, state.mode],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => state.setInputValue(e.target.value),
    [state.setInputValue],
  )

  const handleFocus = useCallback(() => setHasFocus(true), [])

  const handleBlur = useCallback(() => {
    setHasFocus(false)
    setTimeout(() => {
      if (hiddenInputRef.current && document.activeElement !== hiddenInputRef.current) {
        state.setMode('idle')
        state.clearInput()
      }
    }, B.blurTimeout)
  }, [state.setMode, state.clearInput, B.blurTimeout])

  // ---- 渲染 ----
  const isActive = state.mode === 'active'
  const isTypingPhase = state.mode === 'typing'
  const showInputLine = !isTypingPhase
  const inputLineVisible = showInputLine && (hasFocus || state.inputValue.length > 0)

  const renderOverlay = useCallback(
    ({ canScrollUp, canScrollDown }: ScrollOverlayState) => (
      <>
        <span className={`echo-scroll-up${canScrollUp ? ' visible' : ''}`} aria-hidden="true">{'▲'}</span>
        <span className={`echo-scroll-down${canScrollDown ? ' visible' : ''}`} aria-hidden="true">{'▼'}</span>
      </>
    ),
    [],
  )

  return (
    <div className="terminal-bar" style={{
      fontFamily: L.fontFamily,
      fontSize: L.fontSize,
      zIndex: L.zIndex,
      bottom: L.bottom,
    }} aria-hidden={!isActive}>
      <div
        ref={barInnerRef}
        className={`terminal-bar-inner${isActive ? ' active' : ''}`}
        style={{
          width: L.maxWidth,
          borderRadius: L.borderRadius,
          padding: L.padding,
        }}
        onClick={handleBarClick}
      >
        <Scrollable
          ref={scrollableRef}
          scrollable={isActive}
          maxHeight={`calc(${L.maxEchoLines} * 1.6em)`}
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
                {state.echoLines.length > 0 && (
                  <span>
                    <span className="echo-prefix">{state.echoLines[0]}</span>
                  </span>
                )}
                {state.echoLines.slice(1).map((line, i) => (
                  <span key={i}>{'\n'}{line}</span>
                ))}
              </>
            )}
          </div>
        </Scrollable>

        {showInputLine && (
          <div className={`terminal-input-line${inputLineVisible ? ' visible' : ''}`}>
            <span className="terminal-prompt">{T.promptChar}</span>
            {!isActive && !state.inputValue && (
              <span className="terminal-cursor dim">{'█'}</span>
            )}
            {isActive && state.inputValue && (
              <span className="terminal-input-text">{state.inputValue}</span>
            )}
            {isActive && (
              <span className="terminal-cursor bright">{'█'}</span>
            )}
            {!state.inputValue && (
              <span className="terminal-placeholder">{T.placeholder}</span>
            )}
            {isActive && (
              <input
                ref={hiddenInputRef}
                type="text"
                value={state.inputValue}
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
