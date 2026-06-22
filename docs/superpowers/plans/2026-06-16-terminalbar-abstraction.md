# TerminalBar 抽象化重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TerminalBar 从"携带默认实现的具象组件"重构为"纯抽象容器引擎"，新建 MainTerminal 承载 MainPage 专属配置。

**Architecture:** TerminalBar 只保留 click-to-activate 和通用动画/行为默认值；layout 必传，内容仅通过 Slot children 进入。MainTerminal 作为 thin wrapper 提供 MainPage 的布局/字体/welcome/status line + `/` 键激活。App.tsx 不再直接使用 TerminalBar 或 useTerminalActivation。

**Tech Stack:** React 18, TypeScript, GSAP, Zustand

---

### Task 1: 重构 TerminalBar — 移除默认值和 propsToSlots

**Files:**
- Modify: `src/terminal/TerminalBar.tsx`

- [ ] **Step 1: 重写 TerminalBarProps 和相关类型**

移除所有 legacy props（`buildStatusLine`、`buildStatusLines`、`contentLines`、`statusLinePrefix`）。移除 `TerminalBarTextConfig`、`TerminalBarLayoutConfig`、`TerminalBarAnimationConfig`、`TerminalBarBehaviorConfig`、`TerminalBarContentLine` 接口。`layout` 变为必传。`text` 简化为 `promptChar` + `placeholder`。`behavior.activationMode` 移除 `'key'` 变体。

将文件头部（第 1 行到第 55 行）替换为：

```tsx
import { useEffect, useRef, useCallback, useState } from 'react'
import Scrollable from './Scrollable'
import type { ScrollableHandle, ScrollOverlayState } from './Scrollable'
import type { EchoStrategy } from './useEchoSequence'
import { useAnimateHeight } from './useAnimateHeight'
import { useSlotOrchestration } from './useSlotOrchestration'
import { useCommandSystem } from './useCommandSystem'
import { Slot, type TerminalSlot } from './slots'
import type { TerminalMode } from '../stores/scrollStore'
import type { ReactNode } from 'react'
import './TerminalBar.css'

// ============================================================
// TerminalBar — 纯抽象容器引擎
//
// 不提供 welcome text、status line、placement、size 的默认值。
// 内容仅通过 Slot children（Welcome/Section/ContentLine）进入。
// 内置唯一激活方式：click to toggle。
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
  typewriterStartDelay?: number; typewriterCharInterval?: number
  skipTypewriter?: boolean; echoLineDelay?: number; echoCharInterval?: number
  echoStrategy?: EchoStrategy; echoGrowDelay?: number; heightAnimPerLine?: number
}

type ActivationMode = 'click' | 'none'

interface TerminalBarBehavior {
  activationMode?: ActivationMode
  blurTimeout?: number
}

export interface TerminalBarProps {
  text?: TerminalBarText
  layout: TerminalBarLayout
  animation?: TerminalBarAnimation
  behavior?: TerminalBarBehavior
  className?: string

  mode?: TerminalMode; echoLines?: string[]; inputValue?: string; typewriterDone?: boolean
  onModeChange?: (mode: TerminalMode) => void
  onEchoLinesChange?: (lines: string[]) => void
  onInputValueChange?: (value: string) => void
  onTypewriterDoneChange?: (done: boolean) => void

  onCommand?: (input: string) => string; onClear?: () => void
  /** clear 命令后恢复的默认行（不传时回退到空数组） */
  getDefaultLines?: () => string[]
  scrollProgress?: number
  onThemeUpdate?: (sp: number) => Record<string, string> | void
  children?: ReactNode
}
```

- [ ] **Step 2: 替换 DEFAULTS 和 propsToSlots/mergeSlots**

删除 `DEFAULTS` 对象（第 57–63 行）、`propsToSlots` 函数（第 65–102 行）、`mergeSlots` 函数（第 104–106 行）。替换为简洁的常量 + 组件体开头：

```tsx
const ANIMATION_DEFAULTS: TerminalBarAnimation = {
  typewriterStartDelay: 800, typewriterCharInterval: 40,
  skipTypewriter: false, echoLineDelay: 60, echoCharInterval: 25,
  echoStrategy: 'line-by-line' as EchoStrategy, echoGrowDelay: 0.25, heightAnimPerLine: 0.15,
}

const BEHAVIOR_DEFAULTS: TerminalBarBehavior = {
  activationMode: 'click', blurTimeout: 100,
}

export default function TerminalBar(props: TerminalBarProps) {
  const { layout: L } = props
  const T = { promptChar: '$', placeholder: "type 'help' for available commands", ...props.text }
  const A = { ...ANIMATION_DEFAULTS, ...props.animation }
  const B = { ...BEHAVIOR_DEFAULTS, ...props.behavior }

  const slots = Slot.collectSlots(props.children)

  const slotOrch = useSlotOrchestration(
    slots.length > 0 ? slots : [] as TerminalSlot[],
    true, props.echoLines, props.onEchoLinesChange,
  )

  const [mode, setMode] = useState<TerminalMode>(props.mode ?? 'typing')
  const [inputValue, setInputValue] = useState(props.inputValue ?? '')
  const [hasFocus, setHasFocus] = useState(false)

  useEffect(() => { if (props.mode !== undefined) setMode(props.mode) }, [props.mode])
  useEffect(() => { if (props.inputValue !== undefined) setInputValue(props.inputValue) }, [props.inputValue])

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  const barInnerRef = useRef<HTMLDivElement | null>(null)
  const scrollableRef = useRef<ScrollableHandle | null>(null)

  useEffect(() => {
    const sp = props.scrollProgress
    if (sp === undefined || !props.onThemeUpdate) return
    const el = barInnerRef.current; if (!el) return
    const vars = props.onThemeUpdate(sp)
    if (vars) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v as string)
  }, [props.scrollProgress, props.onThemeUpdate])

  const echoLen = slotOrch?.echoLines.length ?? 0
  const cmdDeps = {
    mode, inputValue, echoLinesLength: echoLen,
    setMode: (m: string) => { setMode(m as TerminalMode); props.onModeChange?.(m as TerminalMode) },
    clearInput: () => { setInputValue(''); props.onInputValueChange?.('') },
    setInputValue: (v: string) => { setInputValue(v); props.onInputValueChange?.(v) },
    replaceLines: (lines: string[]) => { props.onEchoLinesChange?.(lines) },
    getDefaultLines: () => props.getDefaultLines?.() ?? [],
    playEcho: async (_startIndex: number, lines: string[]) => {
      const current = props.echoLines ?? []; props.onEchoLinesChange?.([...current, ...lines])
    },
    onCommand: props.onCommand, onClear: props.onClear, promptChar: T.promptChar,
    scrollableRef, blurTimeout: B.blurTimeout, hiddenInputRef, setHasFocus,
  }
  const cmd = useCommandSystem(cmdDeps)

  useAnimateHeight(
    () => scrollableRef.current?.getScrollElement(),
    slotOrch?.echoLines ?? [],
    { durationPerLine: A.heightAnimPerLine, onComplete: () => scrollableRef.current?.scrollToBottom() },
  )

  useEffect(() => { if (mode === 'active' && hiddenInputRef.current) hiddenInputRef.current.focus() }, [mode])
  useEffect(() => { if (mode !== 'active') setHasFocus(false) }, [mode])

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    if (B.activationMode === 'none') return
    e.stopPropagation(); e.nativeEvent.stopImmediatePropagation()
    if (mode === 'idle') { setMode('active'); props.onModeChange?.('active') }
  }, [mode, B.activationMode, props.onModeChange])

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
          maxHeight={`calc(${L.maxEchoLines} * 1.6em)`} overlay={renderOverlay} className="terminal-echo-scrollable">
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
    </div>
  )
}

TerminalBar.Welcome = Slot.Welcome
TerminalBar.Section = Slot.Section
TerminalBar.ContentLine = Slot.ContentLine
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page && pnpm build 2>&1 | tail -20
```

期望：构建失败（MainTerminal 尚未创建，App.tsx 仍引用旧接口），但 TerminalBar.tsx 自身的类型应无错误。

实际上需要先完成所有 Task 后再 build。此步骤改为仅检查 TypeScript：

```bash
npx tsc --noEmit src/terminal/TerminalBar.tsx 2>&1
```

---

### Task 2: 创建 MainTerminal

**Files:**
- Create: `src/MainTerminal.tsx`

- [ ] **Step 1: 创建 MainTerminal.tsx**

```tsx
import { useEffect, useCallback, useRef } from 'react'
import TerminalBar from './terminal/TerminalBar'
import type { TerminalMode } from './stores/scrollStore'

// ============================================================
// MainTerminal — MainPage 专属终端封装
//
// 提供：
//   - 居中底部布局 + 字体 + 尺寸默认值
//   - welcome text + status line 的 Slot 声明
//   - / 键激活（MainPage 专属交互）
//
// 与 ExperimentTerminal 对称——均为 TerminalBar 的 thin wrapper。
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
  typewriterStartDelay: 800,
  typewriterCharInterval: 40,
  echoLineDelay: 60,
  echoCharInterval: 25,
  echoStrategy: 'line-by-line' as const,
  echoGrowDelay: 0.25,
  heightAnimPerLine: 0.15,
}

export interface MainTerminalProps {
  mode?: TerminalMode
  echoLines?: string[]
  inputValue?: string
  typewriterDone?: boolean
  onModeChange?: (mode: TerminalMode) => void
  onEchoLinesChange?: (lines: string[]) => void
  onInputValueChange?: (value: string) => void
  onTypewriterDoneChange?: (done: boolean) => void
  onCommand?: (input: string) => string
  onClear?: () => void
  scrollProgress?: number
  buildStatusLine?: (sp: number) => string | null
  onThemeUpdate?: (sp: number) => Record<string, string> | void
}

export default function MainTerminal(props: MainTerminalProps) {
  const {
    mode, echoLines, inputValue, typewriterDone,
    onModeChange, onEchoLinesChange, onInputValueChange, onTypewriterDoneChange,
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

  // ---- clear 命令后的默认行 ----
  const getDefaultLines = useCallback(() => {
    const status = statusLinesRef.current()
    return status.length > 0 ? ['# YeQuDesu · Personal Site · ready', ...status] : ['# YeQuDesu · Personal Site · ready']
  }, [])

  return (
    <TerminalBar
      layout={MAIN_LAYOUT}
      animation={MAIN_ANIMATION}
      mode={mode}
      echoLines={echoLines}
      inputValue={inputValue}
      typewriterDone={typewriterDone}
      onModeChange={onModeChange}
      onEchoLinesChange={onEchoLinesChange}
      onInputValueChange={onInputValueChange}
      onTypewriterDoneChange={onTypewriterDoneChange}
      onCommand={onCommand}
      onClear={onClear}
      getDefaultLines={getDefaultLines}
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
    </TerminalBar>
  )
}
```

- [ ] **Step 2: 验证类型检查**

```bash
cd /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page && npx tsc --noEmit src/MainTerminal.tsx 2>&1
```

---

### Task 3: 更新 App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 替换 import 并移除 useTerminalActivation**

将第 12–14 行：
```tsx
import TerminalBar from './terminal/TerminalBar'
import { useTerminalActivation } from './terminal/useTerminalActivation'
import { executeCommand } from './terminal/commands'
```

替换为：
```tsx
import MainTerminal from './MainTerminal'
import { executeCommand } from './terminal/commands'
```

将第 56 行：
```tsx
const { onKeyDown: onTerminalKeyDown, isActive: isTerminalActive } = useTerminalActivation()
```

替换为：
```tsx
const isTerminalActive = terminalMode === 'active'
```

- [ ] **Step 2: 替换 JSX 中的 TerminalBar 为 MainTerminal**

将第 283–295 行：
```tsx
      <TerminalBar
        mode={terminalMode}
        echoLines={echoLines}
        inputValue={inputValue}
        onModeChange={handleModeChange}
        onEchoLinesChange={handleEchoLinesChange}
        onInputValueChange={handleInputChange}
        onTypewriterDoneChange={handleTypewriterDoneChange}
        scrollProgress={sp}
        buildStatusLine={handleBuildStatusLine}
        onThemeUpdate={handleThemeUpdate}
        onCommand={handleCommand}
      />
```

替换为：
```tsx
      <MainTerminal
        mode={terminalMode}
        echoLines={echoLines}
        inputValue={inputValue}
        onModeChange={handleModeChange}
        onEchoLinesChange={handleEchoLinesChange}
        onInputValueChange={handleInputChange}
        onTypewriterDoneChange={handleTypewriterDoneChange}
        scrollProgress={sp}
        buildStatusLine={handleBuildStatusLine}
        onThemeUpdate={handleThemeUpdate}
        onCommand={handleCommand}
      />
```

- [ ] **Step 3: 移除 onTerminalKeyDown 事件监听**

将第 161–170 行的 useEffect 中的 `keydown` 监听移除：

```tsx
  useEffect(() => {
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('click', onClick)
    }
  }, [onWheel, onClick])
```

（仅移除 `keydown` 相关的两行和 `onTerminalKeyDown` 依赖）

---

### Task 4: 清理 useTerminalActivation.ts

**Files:**
- Delete: `src/terminal/useTerminalActivation.ts`

- [ ] **Step 1: 删除文件**

```bash
rm /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page/src/terminal/useTerminalActivation.ts
```

- [ ] **Step 2: 检查是否有其他引用**

```bash
grep -rn "useTerminalActivation" /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page/src --include="*.tsx" --include="*.ts"
```

期望：无输出（所有引用已移除）。

- [ ] **Step 3: 若存在测试文件，也删除**

```bash
rm -f /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page/src/terminal/__tests__/useTerminalActivation.test.ts
```

---

### Task 5: 验证构建和测试

- [ ] **Step 1: 完整构建**

```bash
cd /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page && pnpm build 2>&1
```

期望：构建成功，无类型错误。

- [ ] **Step 2: 运行测试**

```bash
cd /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page && pnpm test 2>&1
```

期望：所有测试通过。

---

### Task 6: 更新 HANDOFF.md

**Files:**
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: 更新 HANDOFF.md 反映新架构**

将文件更新为：

```markdown
# TerminalBar 抽象化重构 — 会话交接

> 日期：2026-06-16
> 分支：`componentization-experiment`

## 当前状态

TerminalBar 已抽象化为纯容器引擎。MainTerminal 承载 MainPage 专属配置，与 ExperimentTerminal 形成对称架构。**编译通过，测试通过，需要在 `pnpm dev` 中验证行为完整性。**

## 架构

```
App.tsx ── MainTerminal (布局/字体/welcome/status + / 键激活) ── TerminalBar (纯引擎)
          ExperimentTerminal (实验布局 + planet/orbit slots) ── TerminalBar (纯引擎)
```

## 变更清单

| 文件 | 状态 | 说明 |
|------|:---:|------|
| `src/terminal/TerminalBar.tsx` | 重写 | 移除所有默认值 + propsToSlots；layout 必传；内容仅通过 Slot children |
| `src/MainTerminal.tsx` | **新建** | MainPage 专属封装：布局/字体/welcome/status line + `/` 键激活 |
| `src/App.tsx` | 修改 | TerminalBar → MainTerminal；移除 useTerminalActivation |
| `src/terminal/useTerminalActivation.ts` | 删除 | 逻辑合并进 MainTerminal |
| `src/ExperimentTerminal.tsx` | 不变 | 已使用纯 Slot children 模式 |

## 交互模型

- TerminalBar：仅 click to toggle
- MainTerminal：click + `/` 键激活
- ExperimentTerminal：click only

## 不变文件

- `slots.tsx`、`useSlotOrchestration.ts`、`useCommandSystem.ts`、`useAnimateHeight.ts`、`useTypewriter.ts`
- `Scrollable.tsx/css`、`commands.ts`
- CSS 文件

## pnpm dev 验证清单

1. **主终端**：Typewriter → status line 出现 → 点击激活 → `/` 激活 → `help` → `clear`
2. **实验终端**（Act 3 左上角）：点击激活，planets/orbits 动画正常
3. **高度动画**：平滑
4. **颜色过渡**：Act 1→Act 2 文字颜色跟随
5. **多终端共存**：各自独立运行

## 已知风险

与上次交接相同（命令输出 bypass 动画管线、cmdDeps 每帧重建）。本次重构未涉及这些修复。
```

---

### Task 7: 提交

- [ ] **Step 1: 提交所有变更**

```bash
cd /Users/cydlen/Desktop/Git-Playground/YeQuDesu-Main-Page
git add src/terminal/TerminalBar.tsx src/MainTerminal.tsx src/App.tsx docs/HANDOFF.md docs/superpowers/specs/2026-06-16-terminalbar-abstraction-design.md docs/superpowers/plans/2026-06-16-terminalbar-abstraction.md
git rm src/terminal/useTerminalActivation.ts src/terminal/__tests__/useTerminalActivation.test.ts
git commit -m "refactor: abstract TerminalBar to pure engine, extract MainTerminal

- Remove all identity/layout defaults from TerminalBar
- Delete propsToSlots and legacy props (buildStatusLine, contentLines, etc.)
- TerminalBar: click-to-activate only, layout required, content via Slot children
- New MainTerminal: wrapper with MainPage defaults + / key activation
- App.tsx: use MainTerminal instead of TerminalBar + useTerminalActivation
- Delete useTerminalActivation.ts (logic merged into MainTerminal)
- ExperimentTerminal: unchanged (already pure Slot consumer)"
```
