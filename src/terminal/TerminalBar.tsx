import { useEffect, useRef, useCallback, useState } from 'react'
import { useTypewriter } from './useTypewriter'
import Scrollable from './Scrollable'
import type { ScrollableHandle, ScrollOverlayState } from './Scrollable'
import { useEchoSequence } from './useEchoSequence'
import type { EchoStrategy } from './useEchoSequence'
import { useAnimateHeight } from './useAnimateHeight'
import { useTerminalState } from './useTerminalState'
import { useSlotOrchestration } from './useSlotOrchestration'
import { Slot } from './slots'
import type { TerminalMode } from '../stores/scrollStore'
import type { ReactNode } from 'react'
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
  top?: string
  left?: string
  right?: string
}

interface TerminalBarAnimationConfig {
  typewriterStartDelay?: number
  typewriterCharInterval?: number
  skipTypewriter?: boolean
  echoLineDelay?: number
  echoCharInterval?: number
  echoStrategy?: EchoStrategy
  echoGrowDelay?: number
  heightAnimPerLine?: number
}

type ActivationMode = 'key' | 'click' | 'none'

interface TerminalBarBehaviorConfig {
  activationKey?: string
  activationMode?: ActivationMode
  blurTimeout?: number
}

interface TerminalBarContentLine {
  getLine: () => string
  updateInterval: number
}

export interface TerminalBarProps {
  // === 参数化配置 ===
  text?: TerminalBarTextConfig
  layout?: TerminalBarLayoutConfig
  animation?: TerminalBarAnimationConfig
  behavior?: TerminalBarBehaviorConfig

  // === 实例定制 ===
  className?: string

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
  onCommand?: (input: string) => string
  onClear?: () => void

  // === 滚动驱动注入（缺省时对应功能关闭） ===
  scrollProgress?: number
  buildStatusLine?: (sp: number) => string | null
  onThemeUpdate?: (sp: number) => Record<string, string> | void

  // === 多行状态行（与 buildStatusLine 互斥，优先使用 buildStatusLines） ===
  buildStatusLines?: () => string[]
  /** 状态行前缀，用于标识和追踪状态行。默认 '# Act ' */
  statusLinePrefix?: string

  // === 内容流（自动轮询刷新） ===
  contentLines?: TerminalBarContentLine[]

  // === Slot 模式（声明式编排，替代上述分散 props） ===
  children?: ReactNode
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
    skipTypewriter: false,
    echoLineDelay: 60,
    echoCharInterval: 25,
    echoStrategy: 'line-by-line' as EchoStrategy,
    echoGrowDelay: 0.25,
    heightAnimPerLine: 0.15,
  },
  behavior: {
    activationKey: '/',
    activationMode: 'click' as ActivationMode,
    blurTimeout: 100,
  },
  statusLinePrefix: '# Act ',
}

export default function TerminalBar(props: TerminalBarProps = {}) {
  const T = { ...DEFAULTS.text, ...props.text }
  const L = { ...DEFAULTS.layout, ...props.layout }
  const A = { ...DEFAULTS.animation, ...props.animation }
  const B = { ...DEFAULTS.behavior, ...props.behavior }
  const statusLinePrefix = props.statusLinePrefix ?? DEFAULTS.statusLinePrefix

  // ---- Slot 模式：当 children 存在时，使用声明式编排 ----
  const slotOrch = useSlotOrchestration(props.children, true)

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
    startDelay: A.skipTypewriter ? 0 : A.typewriterStartDelay,
    charInterval: A.skipTypewriter ? 1 : A.typewriterCharInterval,
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

  // Ref 追踪最新 echoLines，供 interval 回调读取（避免闭包陈旧）
  const echoLinesRef = useRef(state.echoLines)
  echoLinesRef.current = state.echoLines

  // ---- 状态行 ----
  // 支持两种模式：buildStatusLines（多行，优先）和 buildStatusLine（单行，向后兼容）
  const statusLineIdx = useRef(-1)
  const statusLineCountRef = useRef(0)

  useEffect(() => {
    if (state.echoLines.length <= 1) { statusLineIdx.current = -1; statusLineCountRef.current = 0 }
  }, [state.echoLines])

  // 多行状态行（buildStatusLines 优先）
  const statusTimerRef = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => {
    if (state.mode === 'typing' || !props.buildStatusLines) return
    const update = () => {
      if (echoPlayingRef.current) return
      const newLines = props.buildStatusLines!()
      const lines = echoLinesRef.current
      const prefix = statusLinePrefix

      let start = -1, count = 0
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(prefix)) {
          if (start < 0) start = i
          count++
        } else if (start >= 0) break
      }

      if (start < 0 && lines.length > 0) {
        for (const nl of newLines) state.appendEcho(nl)
        statusLineIdx.current = lines.length
        statusLineCountRef.current = newLines.length
        return
      }

      const existingCount = count
      for (let i = 0; i < Math.max(existingCount, newLines.length); i++) {
        if (i < newLines.length && i < existingCount) {
          if (lines[start + i] !== newLines[i]) state.setEchoLine(start + i, newLines[i])
        } else if (i < newLines.length) {
          state.appendEcho(newLines[i])
        }
      }
      statusLineCountRef.current = newLines.length
    }
    update()
    // Poll at ~250ms for realtime data refresh
    statusTimerRef.current = setInterval(update, 250)
    return () => { if (statusTimerRef.current) clearInterval(statusTimerRef.current) }
  }, [props.buildStatusLines, state.mode])

  // 单行状态行（向后兼容，buildStatusLines 未设置时使用）
  useEffect(() => {
    if (props.buildStatusLines) return  // 多行优先
    if (state.mode === 'typing' || !props.buildStatusLine || props.scrollProgress === undefined) return
    const update = () => {
      if (echoPlayingRef.current) return
      const line = props.buildStatusLine!(props.scrollProgress!)
      if (line === null) return
      const lines = state.echoLines
      const prefix = statusLinePrefix
      let idx = statusLineIdx.current
      if (idx < 0 || idx >= lines.length || !lines[idx].startsWith(prefix)) {
        idx = -1
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].startsWith(prefix)) { idx = i; break }
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
  }, [props.scrollProgress, props.buildStatusLine, props.buildStatusLines, state.mode, state.echoLines, state.setEchoLine, state.appendEcho])

  // ---- 内容流（contentLines） ----
  const contentLineIdxRef = useRef<number[]>([])
  const contentTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map())

  useEffect(() => {
    if (!props.contentLines || state.mode === 'typing') return
    const lines = props.contentLines

    // Init tracking array
    if (contentLineIdxRef.current.length !== lines.length) {
      contentLineIdxRef.current = new Array(lines.length).fill(-1)
    }

    for (let i = 0; i < lines.length; i++) {
      const cl = lines[i]
      const existing = contentTimersRef.current.get(i)
      if (existing) clearInterval(existing)

      // First push: append the content line and record its index
      const marker = `\0c:${i}`
      const currentLines = echoLinesRef.current
      let found = false
      for (let j = currentLines.length - 1; j >= 0; j--) {
        if (currentLines[j].startsWith(marker)) {
          contentLineIdxRef.current[i] = j
          found = true
          break
        }
      }
      if (!found) {
        state.appendEcho(marker)
        contentLineIdxRef.current[i] = currentLines.length
      }

      const timer = setInterval(() => {
        const text = cl.getLine()
        if (!text) return
        const idx = contentLineIdxRef.current[i]
        if (idx >= 0) {
          state.setEchoLine(idx, marker + text)
        }
      }, cl.updateInterval)
      contentTimersRef.current.set(i, timer)
    }

    return () => {
      contentTimersRef.current.forEach(t => clearInterval(t))
      contentTimersRef.current.clear()
    }
  }, [props.contentLines, state.mode])


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

  // ---- click → active ----
  const handleBarClick = useCallback((e: React.MouseEvent) => {
    if (B.activationMode === 'none') return
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    if (state.mode === 'idle') state.setMode('active')
  }, [state.mode, state.setMode, B.activationMode])

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
          // 一次构建完整数组 + replaceEchoLines 同时更新 internal + Zustand
          // → 一次 render → 一条 SHRINK 动画（避免 clearEcho + effect 两步）
          const statusLine = props.buildStatusLine?.(props.scrollProgress ?? 0)
          const lines = statusLine ? [T.welcomeText, statusLine] : [T.welcomeText]
          state.replaceEchoLines(lines)
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
  const isSlotMode = slotOrch !== null
  const isActive = state.mode === 'active'
  const isTypingPhase = isSlotMode ? !slotOrch!.isTypewriterDone : state.mode === 'typing'
  const showInputLine = !isTypingPhase
  // Slot 模式下的 echo 内容
  const slotDisplayedText = isSlotMode ? slotOrch!.typewriterDisplayed : ''
  const slotEchoLines = isSlotMode ? slotOrch!.echoLines : state.echoLines
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

  // 内容行显示——去除内部标记前缀 \0c:N
  const displayLine = (line: string) => line.startsWith('\0c:') ? line.slice(4) : line

  return (
    <div className={`terminal-bar${props.className ? ' ' + props.className : ''}`} style={{
      fontFamily: L.fontFamily,
      fontSize: L.fontSize,
      zIndex: L.zIndex,
      bottom: L.top !== undefined ? 'auto' : L.bottom,
      top: L.top,
      left: L.left ?? (L.right === undefined ? '0' : undefined),
      right: L.right ?? (L.left === undefined ? '0' : undefined),
    }} aria-hidden={!isActive}>
      <div
        ref={barInnerRef}
        className={`terminal-bar-inner${isActive ? ' active' : ''}`}
        style={{
          width: L.maxWidth,
          borderRadius: L.borderRadius,
          padding: L.padding,
          marginLeft: L.left !== undefined ? '0' : undefined,
          marginRight: L.right !== undefined ? '0' : undefined,
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
            {isSlotMode ? (
              isTypingPhase ? (
                <>
                  <span className="echo-prefix">{slotDisplayedText}</span>
                  <span className="terminal-typing-cursor">{'█'}</span>
                </>
              ) : (
                <>
                  {slotEchoLines.map((line, i) => (
                    <span key={i}>{i > 0 ? '\n' : ''}{line}</span>
                  ))}
                </>
              )
            ) : (
              isTypingPhase ? (
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
                    <span key={i}>{'\n'}{displayLine(line)}</span>
                  ))}
                </>
              )
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

// Slot 子组件（声明式编排）
TerminalBar.Welcome = Slot.Welcome
TerminalBar.Section = Slot.Section
TerminalBar.ContentLine = Slot.ContentLine
