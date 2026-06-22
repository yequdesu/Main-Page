# Terminal CLI Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在页面底部实现 terminal 风格的交互式 CLI 输入框，支持 typewriter 初始动画、`/` 激活输入、可扩展命令系统。

**Architecture:** 3 个新文件 + 1 个修改。纯自建，Zustand 驱动状态，Unicode 块字符光标，命令注册表模式可扩展。

**Tech Stack:** React 19 + TypeScript + Zustand v5 + CSS（无额外依赖）

---

### Task 1: 命令注册表 `commands.ts`

**Files:**
- Create: `src/terminal/commands.ts`
- Create: `src/terminal/__tests__/commands.test.ts`

- [ ] **Step 1: 创建命令注册表和测试**

```typescript
// src/terminal/commands.ts
export interface Command {
  name: string
  aliases?: string[]
  description: string
  handler: () => string
}

// 命令注册表 — 纯数据，添加新命令只需 push
export const commandRegistry: Command[] = [
  {
    name: 'help',
    description: 'Show available commands',
    handler: () => {
      const lines = commandRegistry.map(
        (c) => `  ${c.name.padEnd(8)} ${c.description}`
      )
      return ['Available commands:', ...lines].join('\n')
    },
  },
  {
    name: 'debug',
    description: 'Toggle debug mode',
    handler: () => {
      const current = (window as any).__DEBUG__ === true
      ;(window as any).__DEBUG__ = !current
      return `debug mode: ${!current ? 'ON' : 'OFF'}`
    },
  },
  {
    name: 'day',
    aliases: ['light'],
    description: 'Switch to day mode',
    handler: () => {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      return 'switched to day mode'
    },
  },
  {
    name: 'night',
    aliases: ['dark'],
    description: 'Switch to night mode',
    handler: () => {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
      return 'switched to night mode'
    },
  },
]

export function executeCommand(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  const cmd = commandRegistry.find(
    (c) =>
      c.name === trimmed || (c.aliases && c.aliases.includes(trimmed))
  )

  if (!cmd) return `command not found: ${trimmed}\nType 'help' for available commands`

  return cmd.handler()
}
```

```typescript
// src/terminal/__tests__/commands.test.ts
import { describe, it, expect } from 'vitest'
import { executeCommand, commandRegistry } from '../commands'

describe('executeCommand', () => {
  it('returns help text for "help" command', () => {
    const result = executeCommand('help')
    expect(result).toContain('Available commands:')
    expect(result).toContain('help')
    expect(result).toContain('debug')
    expect(result).toContain('day')
    expect(result).toContain('night')
  })

  it('toggles debug mode with "debug"', () => {
    ;(window as any).__DEBUG__ = false
    const r1 = executeCommand('debug')
    expect(r1).toContain('ON')
    expect((window as any).__DEBUG__).toBe(true)

    const r2 = executeCommand('debug')
    expect(r2).toContain('OFF')
    expect((window as any).__DEBUG__).toBe(false)
  })

  it('matches aliases (day → light, night → dark)', () => {
    const r1 = executeCommand('light')
    expect(r1).toContain('day mode')

    const r2 = executeCommand('dark')
    expect(r2).toContain('night mode')
  })

  it('returns error for unknown command', () => {
    const result = executeCommand('foobar')
    expect(result).toContain('command not found: foobar')
  })

  it('returns empty string for blank input', () => {
    expect(executeCommand('')).toBe('')
    expect(executeCommand('  ')).toBe('')
  })

  it('trims whitespace from input', () => {
    const result = executeCommand('  help  ')
    expect(result).toContain('Available commands:')
  })

  it('commandRegistry has at least the 4 initial commands', () => {
    const names = commandRegistry.map((c) => c.name)
    expect(names).toContain('help')
    expect(names).toContain('debug')
    expect(names).toContain('day')
    expect(names).toContain('night')
  })
})
```

- [ ] **Step 2: 运行测试，确认全部通过**

Run: `pnpm vitest run src/terminal/__tests__/commands.test.ts`
Expected: 7 tests PASS

- [ ] **Step 3: 提交**

```bash
git add src/terminal/commands.ts src/terminal/__tests__/commands.test.ts
git commit -m "feat: add terminal command registry with help/debug/day/night"
```

---

### Task 2: 扩增 Zustand TerminalSlice

**Files:**
- Modify: `src/stores/scrollStore.ts`

- [ ] **Step 1: 在 scrollStore.ts 中新增 TerminalSlice 类型和初始状态**

读取 `src/stores/scrollStore.ts`，在文件末尾的 Slice 类型区域新增：

```typescript
// 在 FocusSlice 之后添加：
export type TerminalMode = 'typing' | 'idle' | 'active'

interface TerminalSlice {
  terminalMode: TerminalMode
  echoLines: string[]
  inputValue: string
  typewriterDone: boolean
}

interface TerminalActions {
  setTerminalMode: (mode: TerminalMode) => void
  setInputValue: (val: string) => void
  appendEcho: (line: string) => void
  clearInput: () => void
  setTypewriterDone: (done: boolean) => void
}
```

更新 `ScrollStore` 类型：

```typescript
// 将原来的：
export type ScrollStore = ScrollSlice & FocusSlice & ScrollActions & FocusActions
// 改为：
export type ScrollStore = ScrollSlice & FocusSlice & TerminalSlice & ScrollActions & FocusActions & TerminalActions
```

在 `create` 调用的初始状态和 actions 对象中新增：

```typescript
// 在 focus slice 初始值之后添加：
// ---- Terminal slice ----
terminalMode: 'typing' as TerminalMode,
echoLines: [] as string[],
inputValue: '',
typewriterDone: false,

// 在 focus actions 之后添加：
// ---- Terminal actions ----
setTerminalMode: (mode) => set({ terminalMode: mode }),
setInputValue: (val) => set({ inputValue: val }),
appendEcho: (line) =>
  set((s) => ({ echoLines: [...s.echoLines, line] })),
clearInput: () => set({ inputValue: '' }),
setTypewriterDone: (done) => set({ typewriterDone: done }),
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: 提交**

```bash
git add src/stores/scrollStore.ts
git commit -m "feat: add TerminalSlice to scrollStore (mode, echo, input)"
```

---

### Task 3: Typewriter Hook

**Files:**
- Create: `src/terminal/useTypewriter.ts`
- Create: `src/terminal/__tests__/useTypewriter.test.ts`

- [ ] **Step 1: 创建 hook 和测试**

```typescript
// src/terminal/useTypewriter.ts
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
```

```typescript
// src/terminal/__tests__/useTypewriter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTypewriter } from '../useTypewriter'

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string initially (before startDelay)', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'Hello', startDelay: 800, charInterval: 40 })
    )

    expect(result.current.displayedText).toBe('')
    expect(result.current.isTyping).toBe(true)
    expect(result.current.isDone).toBe(false)
  })

  it('starts typing after startDelay', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'Hello', startDelay: 800, charInterval: 40 })
    )

    act(() => { vi.advanceTimersByTime(800) })
    expect(result.current.displayedText).toBe('H')
    expect(result.current.isTyping).toBe(true)
  })

  it('types all characters over time', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'Hi', startDelay: 100, charInterval: 50 })
    )

    act(() => { vi.advanceTimersByTime(100) })  // 'H'
    expect(result.current.displayedText).toBe('H')

    act(() => { vi.advanceTimersByTime(50) })   // 'Hi'
    expect(result.current.displayedText).toBe('Hi')

    act(() => { vi.advanceTimersByTime(50) })   // done
    expect(result.current.isTyping).toBe(false)
    expect(result.current.isDone).toBe(true)
  })

  it('cleans up timer on unmount (no state update after unmount)', () => {
    const { result, unmount } = renderHook(() =>
      useTypewriter({ echoText: 'Hello', startDelay: 100, charInterval: 40 })
    )

    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.displayedText).toBe('H')

    unmount()

    // Advance past completion — should not throw
    act(() => { vi.advanceTimersByTime(500) })
    // No assertion needed — the test passes if no error is thrown
  })

  it('uses default startDelay=800 and charInterval=40', () => {
    const { result } = renderHook(() =>
      useTypewriter({ echoText: 'AB' })
    )

    act(() => { vi.advanceTimersByTime(799) })
    expect(result.current.displayedText).toBe('')

    act(() => { vi.advanceTimersByTime(1) })   // 800ms
    expect(result.current.displayedText).toBe('A')

    act(() => { vi.advanceTimersByTime(40) })  // 840ms
    expect(result.current.displayedText).toBe('AB')
  })
})
```

- [ ] **Step 2: 安装 @testing-library/react（如未安装）**

Run: `pnpm ls @testing-library/react 2>&1 || pnpm add -D @testing-library/react`
Expected: 确认依赖可用

- [ ] **Step 3: 运行测试**

Run: `pnpm vitest run src/terminal/__tests__/useTypewriter.test.ts`
Expected: 5 tests PASS

- [ ] **Step 4: 提交**

```bash
git add src/terminal/useTypewriter.ts src/terminal/__tests__/useTypewriter.test.ts
git commit -m "feat: add useTypewriter hook with configurable delay/interval"
```

---

### Task 4: TerminalBar 组件

**Files:**
- Create: `src/terminal/TerminalBar.tsx`
- Create: `src/terminal/TerminalBar.css`

- [ ] **Step 1: 创建 CSS 样式**

```css
/* src/terminal/TerminalBar.css */
.terminal-bar {
  position: fixed;
  bottom: 2rem;
  left: 0;
  right: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.68rem;
  line-height: 1.6;
  pointer-events: none;
}

.terminal-bar-inner {
  margin: 0 auto;
  width: min(90vw, 640px);
  background: rgba(15, 20, 35, 0.92);
  border: 1px solid rgba(100, 120, 160, 0.2);
  border-radius: 4px;
  padding: 8px 14px;
  backdrop-filter: blur(8px);
  transition: border-color 0.3s ease, background-color 0.3s ease;
}

.terminal-bar-inner.active {
  background: rgba(15, 20, 35, 0.96);
  border-color: rgba(100, 160, 220, 0.35);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

.terminal-echo {
  color: #7c8aa0;
  white-space: pre-wrap;
  word-break: break-all;
  text-align: left;
}

.terminal-echo .echo-prefix {
  color: #64748b;
}

.terminal-input-line {
  display: flex;
  align-items: baseline;
  text-align: left;
  margin-top: 5px;
  animation: terminal-input-fade-in 0.3s ease-out;
}

@keyframes terminal-input-fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}

.terminal-prompt {
  color: #0ea5e9;
  flex-shrink: 0;
}

.terminal-cursor {
  flex-shrink: 0;
}

.terminal-cursor.dim {
  color: #0ea5e9;
  opacity: 0.25;
}

.terminal-cursor.bright {
  color: #e2e8f0;
  animation: cursor-blink 1s step-end infinite;
}

@keyframes cursor-blink {
  50% { opacity: 0; }
}

.terminal-placeholder {
  color: rgba(255, 255, 255, 0.15);
  font-style: italic;
  margin-left: 4px;
}

.terminal-input-text {
  color: #e2e8f0;
}

.terminal-typing-cursor {
  color: #7c8aa0;
  animation: cursor-blink 1s step-end infinite;
}
```

- [ ] **Step 2: 创建 TerminalBar 组件**

```tsx
// src/terminal/TerminalBar.tsx
import { useEffect, useRef, useCallback } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import { useTypewriter } from './useTypewriter'
import { executeCommand } from './commands'
import { SCROLL_RIG } from '../types'
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

  const inputRef = useRef<HTMLInputElement | null>(null)
  const hiddenInputRef = useRef<HTMLInputElement | null>(null)

  // ---- Typewriter ----
  const { displayedText, isTyping, isDone } = useTypewriter({
    startDelay: 800,
    charInterval: 40,
    echoText: DEFAULT_ECHO_TEXT,
  })

  // 打字完成 → 切换到 idle
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
          // 将命令本身作为回显行
          appendEcho(`$ ${inputValue}`)
          // 将输出分行追加
          output.split('\n').forEach((line) => appendEcho(line))
        }
        clearInput()
        return
      }

      // 其他键：不做特殊处理，让 input onChange 处理
    },
    [inputValue, appendEcho, clearInput, setTerminalMode]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value)
    },
    [setInputValue]
  )

  const handleBlur = useCallback(() => {
    // 延迟检查，避免点击 bar 内部元素时误触发
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

  return (
    <div className="terminal-bar" aria-hidden={!isActive}>
      <div className={`terminal-bar-inner${isActive ? ' active' : ''}`}>
        {/* 回显区 */}
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

        {/* 输入行 — typing 阶段隐藏 */}
        {showInputLine && (
          <div className="terminal-input-line">
            <span className="terminal-prompt">{'$'}</span>
            {/* 光标 */}
            {!isActive && !inputValue && (
              <span className="terminal-cursor dim">{'▎'}</span>
            )}
            {isActive && (
              <span className="terminal-cursor bright">{'█'}</span>
            )}
            {/* placeholder（idle + 无输入） */}
            {!isActive && !inputValue && (
              <span className="terminal-placeholder">
                type 'help' for available commands
              </span>
            )}
            {/* 用户输入文本（active + 有输入） */}
            {isActive && inputValue && (
              <span className="terminal-input-text">{inputValue}</span>
            )}
            {/* 隐藏的 input 接收键盘 */}
            {isActive && (
              <input
                ref={hiddenInputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
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
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误（可能需要调整 import 路径或类型）

- [ ] **Step 4: 提交**

```bash
git add src/terminal/TerminalBar.tsx src/terminal/TerminalBar.css
git commit -m "feat: add TerminalBar component with typewriter + input modes"
```

---

### Task 5: 集成到 App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 App.tsx 中导入 TerminalBar 并挂载**

在 `import` 区域添加：

```typescript
import TerminalBar from './terminal/TerminalBar'
```

在 JSX 中挂载（与 brand-text、footer 同级，Canvas 外部），放在 `</SceneCanvas>` 之后，scroll-hint 之前：

```tsx
{/* 在 </SceneCanvas> 之后添加 */}
<TerminalBar />
```

- [ ] **Step 2: 扩展键盘和交互逻辑**

读取当前 `src/App.tsx`，找到 `onWheel`、`onClick` 和 event listeners 部分。

新增终端激活状态检测和 `/` 键监听：

```typescript
// 在 App 组件顶部，现有的 useState 区域添加：
const [isTerminalActive, setIsTerminalActive] = useState(false)

// 订阅 terminalMode
useEffect(() => {
  const unsub = useScrollStore.subscribe((s) => {
    setIsTerminalActive(s.terminalMode === 'active')
  })
  return unsub
}, [])
```

修改 `onWheel` — 阻止 terminal active 时的滚动：

```typescript
const onWheel = useCallback((e: WheelEvent) => {
  e.preventDefault()
  // 新增：terminal 激活时阻止滚动
  if (isTerminalActive) return
  if (isAct3Focused) return
  if (isClickPlaying && clickTweenRef.current) {
    clickTweenRef.current.kill()
    clickTweenRef.current = null
    setIsClickPlaying(false)
  }
  const step = e.deltaY / (window.innerHeight * SCROLL_VH) * 0.65
  physRef.current.velocity += step
  physRef.current.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, physRef.current.velocity))
}, [isAct3Focused, isClickPlaying, isTerminalActive])
```

修改 `onClick` — 阻止 terminal active 时的快进：

```typescript
const onClick = useCallback(() => {
  // 新增：terminal 激活时阻止点击快进
  if (isTerminalActive) return
  if (isClickPlaying) return
  if (isAct3Focused) return
  if (scrollProgress >= 0.995) return
  // ... 其余保持不变
}, [isClickPlaying, isAct3Focused, isTerminalActive, scrollProgress, setScrollProgress, syncScrollbar])
```

添加 `/` 键监听 — 在现有的 event listeners `useEffect` 中添加 keydown listener：

```typescript
// 在现有的 addEventListener('click', onClick) 之后添加：
const onKeyDown = (e: KeyboardEvent) => {
  // 如果焦点在 input/textarea 上，不拦截
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (e.key === '/') {
    e.preventDefault()
    const state = useScrollStore.getState()
    if (state.terminalMode === 'idle') {
      state.setTerminalMode('active')
    }
  }
}
window.addEventListener('keydown', onKeyDown)

// return cleanup 中添加：
// window.removeEventListener('keydown', onKeyDown)
```

完整的 event listeners `useEffect` 更新为：

```typescript
useEffect(() => {
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('click', onClick)
  window.addEventListener('keydown', onKeyDown)
  return () => {
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('click', onClick)
    window.removeEventListener('keydown', onKeyDown)
  }
}, [onWheel, onClick])
```

其中 `onKeyDown` 需要提前用 `useCallback` 包装（无依赖，因为直接读 `getState()`）：

```typescript
const onKeyDown = useCallback((e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  if (e.key === '/') {
    e.preventDefault()
    const state = useScrollStore.getState()
    if (state.terminalMode === 'idle') {
      state.setTerminalMode('active')
    }
  }
}, [])
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `pnpm tsc --noEmit`
Expected: 零错误

- [ ] **Step 4: 提交**

```bash
git add src/App.tsx
git commit -m "feat: integrate TerminalBar — mount, / activation, wheel/click block"
```

---

### Task 6: 运行全部测试并验证构建

- [ ] **Step 1: 运行全部测试**

Run: `pnpm test`
Expected: 所有测试通过（原有 13 + 新增 ~12）

- [ ] **Step 2: 生产构建验证**

Run: `pnpm build`
Expected: 构建成功，零 TypeScript 错误

- [ ] **Step 3: 启动开发服务器手动验证**

Run: `pnpm dev`

打开 `http://localhost:5173`，验证：
1. 页面加载后 typewriter 逐字打印 → 输入行淡入
2. 底部 bar 显示状态信息（Act · scroll%）
3. 按 `/` → 光标变亮闪烁，可输入
4. 输入 `help` + Enter → 回显区追加命令列表
5. 输入 `debug` + Enter → 回显 "debug mode: ON/OFF"
6. 输入 `day` / `day` → 回显切换提示
7. 输入未知命令 → 回显 "command not found"
8. Esc → 回到 idle 态
9. active 时滚轮和点击被阻止

- [ ] **Step 5: 最终提交（如有微调）**

```bash
git add -A
git commit -m "chore: final tweaks and verification for terminal CLI bar"
```
