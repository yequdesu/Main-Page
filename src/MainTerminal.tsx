import { useEffect, useCallback, useRef, useState } from 'react'
import TerminalBar from './terminal/TerminalBar'
import type { TerminalMode } from './stores/scrollStore'

// ============================================================
// MainTerminal — MainPage 专属终端封装
//
// 提供：
//   - 居中底部布局 + 字体 + 尺寸默认值
//   - welcome / status / command 的 Slot 声明
//   - / 键激活（MainPage 专属交互）
//
// 与 InfoPanelTerminal 对称——均为 TerminalBar 的 thin wrapper。
// ============================================================

const MAIN_LAYOUT = {
  maxEchoLines: 5,
  maxWidth: 'min(90vw, 640px)',
  borderRadius: '12px',
  padding: '8px 14px',
  fontSize: '0.68rem',
  fontFamily: "'SF Mono','Fira Code','Cascadia Code','Consolas',monospace",
  zIndex: 15,
  bottom: '2rem',
} as const

const MAIN_ANIMATION = {
  heightAnimPerLine: 0.15,
}

export interface MainTerminalProps {
  mode?: TerminalMode
  echoLines?: string[]
  inputValue?: string
  onModeChange?: (mode: TerminalMode) => void
  onEchoLinesChange?: (lines: string[]) => void
  onInputValueChange?: (value: string) => void
  onCommand?: (input: string) => string
  onClear?: () => void
  scrollProgress?: number
  buildStatusLine?: (sp: number) => string | null
  onThemeUpdate?: (sp: number) => Record<string, string>
}

export default function MainTerminal(props: MainTerminalProps) {
  const {
    mode, echoLines, inputValue,
    onModeChange, onEchoLinesChange, onInputValueChange,
    onCommand, onClear, scrollProgress, buildStatusLine, onThemeUpdate,
  } = props

  // ---- / 键激活（MainPage 专属） ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '/' && mode === 'idle') {
        e.preventDefault()
        onModeChange?.('active')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, onModeChange])

  // ---- status line getter（跟随 scrollProgress 刷新） ----
  const statusLinesRef = useRef<() => string[]>(() => [])
  statusLinesRef.current = () => {
    if (!buildStatusLine || scrollProgress === undefined) return []
    const line = buildStatusLine(scrollProgress)
    return line ? [line] : []
  }

  const getStatusLines = useCallback(() => statusLinesRef.current(), [])

  // ---- 命令输出 Section ----
  const [commandLines, setCommandLines] = useState<string[]>([])
  const [commandVer, setCommandVer] = useState(0)
  const cmdLinesRef = useRef<string[]>([])
  cmdLinesRef.current = commandLines

  const handlePlayEcho = useCallback((lines: string[]) => {
    setCommandLines(lines)
    setCommandVer(v => v + 1)
  }, [])

  const handleClearEcho = useCallback(() => {
    setCommandLines([])
    setCommandVer(v => v + 1)
  }, [])

  // ---- echoLines 长度变化 + 命令活跃时 → 触发 autoScrollKey ----
  const cmdActiveRef = useRef(commandLines.length > 0)
  cmdActiveRef.current = commandLines.length > 0
  useEffect(() => {
    if (cmdActiveRef.current) {
      setEchoScrollKey(k => k + 1)
    }
  }, [echoLines?.length])

  const getCommandLines = useCallback(() => cmdLinesRef.current, [])

  // ---- echo 窗口滚动控制（MainPage 专属行为） ----
  const [echoScrollKey, setEchoScrollKey] = useState(0)

  return (
    <TerminalBar
      layout={MAIN_LAYOUT}
      animation={MAIN_ANIMATION}
      state={{ mode, echoLines, inputValue, onModeChange, onEchoLinesChange, onInputValueChange }}
      commands={{ onCommand, onClear, onPlayEcho: handlePlayEcho, onClearEcho: handleClearEcho }}
      autoScrollKey={echoScrollKey}
      scrollProgress={scrollProgress}
      onThemeUpdate={onThemeUpdate}
    >
      <TerminalBar.Welcome
        name="welcome"
        text="# YeQuDesu · Personal Site · ready"
        lineCount={1}
        animation={{ inline: 'literal', charInterval: 40, startDelay: 800, overflow: 'static' }}
        exitGap={1500}
      />
      {buildStatusLine && scrollProgress !== undefined && (
        <TerminalBar.Section
          name="status"
          getLines={getStatusLines}
          lineCount={1}
          animation={{ inline: 'directly', overflow: 'static' }}
          appearAfter="welcome:welcome"
        />
      )}
      {commandLines.length > 0 && (
        <TerminalBar.Section
          name={`command_${commandVer}`}
          getLines={getCommandLines}
          lineCount={commandLines.length}
          animation={{ inline: 'directly', rows: 'lineByLine', rowInterval: 150, pollInterval: 3000, overflow: 'static' }}
          appearAfter="section:status"
        />
      )}
    </TerminalBar>
  )
}
