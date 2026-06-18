import { useEffect, useRef, useCallback, useState } from 'react'
import Scrollable from './Scrollable'
import type { ScrollableHandle, ScrollOverlayState } from './Scrollable'
import { useAnimateHeight } from './useAnimateHeight'
import { useSlotOrchestration } from './useSlotOrchestration'
import { useCommandSystem } from './useCommandSystem'
import { Slot } from './slots'
import type { TerminalMode } from '../stores/scrollStore'
import type { ReactNode } from 'react'
import './TerminalBar.css'

// ============================================================
// TerminalBar — 纯抽象容器引擎
//
// 不提供 welcome text、status line、placement、size 的默认值。
// 内容仅通过 Slot children（Welcome/Section/ContentLine）进入。
// 内置唯一激活方式：click to toggle。
// onPlayEcho / onClearEcho 由消费方（MainTerminal）提供，命令
// 输出通过声明式 Section slot 走统一 Slot 管线。
// ============================================================

interface TerminalBarText {
  promptChar?: string
  placeholder?: string
}

interface TerminalBarLayout {
  maxEchoLines: number
  maxWidth: string
  borderRadius: string
  padding: string
  fontSize: string
  fontFamily: string
  zIndex: number
  bottom?: string; top?: string; left?: string; right?: string
}

interface TerminalBarAnimation {
  heightAnimPerLine?: number
}

type ActivationMode = 'click' | 'none'

interface TerminalBarBehavior {
  activationMode?: ActivationMode
  blurTimeout?: number
}

export interface TerminalBarControlledState {
  mode?: TerminalMode; echoLines?: string[]; inputValue?: string
  onModeChange?: (mode: TerminalMode) => void
  onEchoLinesChange?: (lines: string[]) => void
  onInputValueChange?: (value: string) => void
}

export interface TerminalBarCommandConfig {
  onCommand?: (input: string) => string
  onClear?: () => void
  /** 命令输出回调 — 消费方提供，将 lines 写入自己的 Section slot */
  onPlayEcho?: (lines: string[]) => void
  /** 清屏回调 — 消费方清除自己的命令 Section slot */
  onClearEcho?: () => void
}

export interface TerminalBarProps {
  layout: TerminalBarLayout
  text?: TerminalBarText
  animation?: TerminalBarAnimation
  behavior?: TerminalBarBehavior
  className?: string

  /** 受控状态 — mode / echoLines / inputValue */
  state?: TerminalBarControlledState
  /** 命令配置 — onCommand / onClear / onPlayEcho / onClearEcho */
  commands?: TerminalBarCommandConfig

  /** 变化时 Scrollable 自动滚到底部 — 消费方（MainTerminal）主动触发 */
  autoScrollKey?: number
  scrollProgress?: number
  onThemeUpdate?: (sp: number) => Record<string, string>
  /** 主题切换时递增 → TerminalBar 立即重绘 --tw-* inline style */
  themeKey?: number
  children?: ReactNode
}

const ANIMATION_DEFAULTS: TerminalBarAnimation = {
  heightAnimPerLine: 0.15,
}

const BEHAVIOR_DEFAULTS: TerminalBarBehavior = {
  activationMode: 'click', blurTimeout: 100,
}

export default function TerminalBar(props: TerminalBarProps) {
  const { layout: L } = props
  const T = { promptChar: '$', placeholder: "type 'help' for available commands", ...props.text }
  const A = { ...ANIMATION_DEFAULTS, ...props.animation }
  const B = { ...BEHAVIOR_DEFAULTS, ...props.behavior }
  const { mode: controlledMode, echoLines: controlledEchoLines, inputValue: controlledInputValue,
    onModeChange, onEchoLinesChange, onInputValueChange } = props.state ?? {}
  const { onCommand, onClear, onPlayEcho, onClearEcho } = props.commands ?? {}

  const slots = Slot.collectSlots(props.children)

  const slotOrch = useSlotOrchestration(
    slots,
    true, controlledEchoLines, onEchoLinesChange,
  )

  const [mode, setMode] = useState<TerminalMode>(controlledMode ?? 'typing')
  const [inputValue, setInputValue] = useState(controlledInputValue ?? '')
  const [hasFocus, setHasFocus] = useState(false)

  useEffect(() => { if (controlledMode !== undefined) setMode(controlledMode) }, [controlledMode])
  useEffect(() => { if (controlledInputValue !== undefined) setInputValue(controlledInputValue) }, [controlledInputValue])

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  const barInnerRef = useRef<HTMLDivElement | null>(null)
  const scrollableRef = useRef<ScrollableHandle | null>(null)
  const onModeChangeRef = useRef(onModeChange)
  onModeChangeRef.current = onModeChange

  useEffect(() => {
    const sp = props.scrollProgress
    if (sp === undefined || !props.onThemeUpdate) return
    const el = barInnerRef.current; if (!el) return
    const vars = props.onThemeUpdate(sp)
    if (vars) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v as string)
  }, [props.scrollProgress, props.onThemeUpdate, props.themeKey])

  const cmdDeps = {
    mode, inputValue,
    setMode: (m: string) => { setMode(m as TerminalMode); onModeChange?.(m as TerminalMode) },
    clearInput: () => { setInputValue(''); onInputValueChange?.('') },
    setInputValue: (v: string) => { setInputValue(v); onInputValueChange?.(v) },
    playEcho: (lines: string[]) => { onPlayEcho?.(lines) },
    clearEcho: () => { onClearEcho?.() },
    onCommand, onClear, promptChar: T.promptChar,
    scrollableRef, blurTimeout: B.blurTimeout ?? 100, hiddenInputRef, setHasFocus,
  }
  const cmd = useCommandSystem(cmdDeps)

  useAnimateHeight(
    () => scrollableRef.current?.getScrollElement(),
    slotOrch?.echoLines ?? [],
    { durationPerLine: A.heightAnimPerLine, onComplete: () => scrollableRef.current?.scrollToBottom() },
  )

  useEffect(() => { if (mode === 'active' && hiddenInputRef.current) hiddenInputRef.current.focus() }, [mode])
  useEffect(() => { if (mode !== 'active') setHasFocus(false) }, [mode])

  // Typewriter+exitGap 完成后，mode typing → idle
  useEffect(() => {
    if (slotOrch?.isTypewriterDone && mode === 'typing') {
      setMode('idle')
      onModeChangeRef.current?.('idle')
    }
  }, [slotOrch?.isTypewriterDone, mode])

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    if (B.activationMode === 'none') return
    e.stopPropagation(); e.nativeEvent.stopImmediatePropagation()
    if (mode === 'idle') { setMode('active'); onModeChange?.('active') }
  }, [mode, B.activationMode, onModeChange])

  const isActive = mode === 'active'
  const isTypingPhase = slotOrch ? !slotOrch.isTypewriterDone : mode === 'typing'
  const showInputLine = !isTypingPhase
  const inputLineVisible = showInputLine && (hasFocus || inputValue.length > 0)
  const echoLines = slotOrch?.echoLines ?? []
  const displayedText = slotOrch?.typewriterDisplayed ?? ''

  const renderOverlay = useCallback(({ canScrollUp, canScrollDown }: ScrollOverlayState) => (
    <>
      <span className={`echo-scroll-up${canScrollUp ? ' visible' : ''}`} aria-hidden="true">{'▲'}</span>
      <span className={`echo-scroll-down${canScrollDown ? ' visible' : ''}`} aria-hidden="true">{'▼'}</span>
    </>
  ), [])

  return (
    <div className={`terminal-bar${props.className ? ' ' + props.className : ''}`} style={{
      fontFamily: L.fontFamily, fontSize: L.fontSize, zIndex: L.zIndex,
      bottom: L.top !== undefined ? 'auto' : L.bottom, top: L.top,
      left: L.left ?? (L.right === undefined ? '0' : undefined),
      right: L.right ?? (L.left === undefined ? '0' : undefined),
    }} aria-hidden={!isActive}>
      <div ref={barInnerRef}
        className={`terminal-bar-inner${isActive ? ' active' : ''}`}
        style={{ width: L.maxWidth, borderRadius: L.borderRadius, padding: L.padding,
          marginLeft: L.left !== undefined ? '0' : undefined, marginRight: L.right !== undefined ? '0' : undefined }}
        onClick={handleBarClick}>
        <Scrollable ref={scrollableRef} scrollable={isActive}
          maxHeight={`calc(${L.maxEchoLines} * 1.6em)`} autoScrollKey={props.autoScrollKey}
          overlay={renderOverlay} className="terminal-echo-scrollable">
          <div className="terminal-echo">
            {isTypingPhase ? (
              <><span className="echo-prefix">{displayedText}</span><span className="terminal-typing-cursor">{'█'}</span></>
            ) : (
              echoLines.map((line, i) => <span key={i}>{i > 0 ? '\n' : ''}{line}</span>)
            )}
          </div>
        </Scrollable>

        {showInputLine && (
          <div className={`terminal-input-line${inputLineVisible ? ' visible' : ''}`}>
            <span className="terminal-prompt">{T.promptChar}</span>
            {!isActive && !inputValue && <span className="terminal-cursor dim">{'█'}</span>}
            {isActive && inputValue && <span className="terminal-input-text">{inputValue}</span>}
            {isActive && <span className="terminal-cursor bright">{'█'}</span>}
            {!inputValue && <span className="terminal-placeholder">{T.placeholder}</span>}
            {isActive && (
              <input ref={hiddenInputRef} type="text" value={inputValue}
                onChange={cmd.handleInputChange} onKeyDown={cmd.handleKeyDown}
                onFocus={cmd.handleFocus} onBlur={cmd.handleBlur}
                autoComplete="off" autoCorrect="off" spellCheck={false}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', outline: 'none', pointerEvents: 'none' }}
                aria-label="Terminal command input" />
            )}
          </div>
        )}
      </div>
      <Slot.Provider value={true}>{props.children}</Slot.Provider>
    </div>
  )
}

TerminalBar.Welcome = Slot.Welcome
TerminalBar.Section = Slot.Section
TerminalBar.ContentLine = Slot.ContentLine
