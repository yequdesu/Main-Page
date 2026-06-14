# Terminal Bar — 技术说明书

> 版本：v2
> 日期：2026-06-13
> 源码：`src/terminal/`
> 设计文档：`docs/superpowers/specs/2026-06-13-terminal-bar-v2-design.md`

---

## 目录

1. [产品概述](#1-产品概述)
2. [架构设计](#2-架构设计)
3. [模块详细说明](#3-模块详细说明)
4. [Zustand Store 接口](#4-zustand-store-接口)
5. [动画系统](#5-动画系统)
6. [视觉系统](#6-视觉系统)
7. [集成接口](#7-集成接口)
8. [设计决策与权衡](#8-设计决策与权衡)

---

## 1. 产品概述

Terminal Bar 是一个类终端风格的 DOM 覆盖层组件，固定于页面底部，为用户提供命令行交互界面。它通过 glass-morphism 毛玻璃效果悬浮在 WebGL 3D 场景之上，视觉风格随页面滚动进度动态过渡。

### 1.1 核心功能

| 功能 | 说明 |
|------|------|
| 打字机入场动画 | 页面加载时逐字打印欢迎信息 |
| 命令行输入 | 支持 `/` 键或点击激活，输入命令并执行 |
| 命令输出动画 | 执行结果以逐行动画方式追加到回显区 |
| 回显区滚动 | 内容溢出时可滚动，伴有 ▲/▼ 指示器 |
| 实时状态行 | idle 态实时显示当前 Act 和滚动进度 |
| 动态颜色过渡 | 文本颜色随 3D 场景白化（Act 1→Act 2）平滑插值 |
| Liquid Glass 视觉 | 毛玻璃 + 多层径向渐变光晕 + 动态 box-shadow |

### 1.2 技术栈

| 层面 | 技术 |
|------|------|
| UI 框架 | React 19（纯 DOM 组件，非 R3F） |
| 状态管理 | Zustand v5（`scrollStore` 的 Terminal slice） |
| 动画 | `setTimeout` 链（打字机、回显序列）、CSS transition（高度动画）、`requestAnimationFrame`（滚动） |
| 样式 | CSS custom properties + `backdrop-filter` + `smoothstep` 颜色插值 |
| 测试 | Vitest + @testing-library/react + jsdom |

---

## 2. 架构设计

### 2.1 文件清单

```
src/terminal/
├── TerminalBar.tsx              # 主组件（~385 行）— fixed 底部 bar
├── TerminalBar.css              # 样式 — glass + overlay + input + cursor
├── Scrollable.tsx               # 通用滚动容器 + overlay render prop
├── Scrollable.css               # 滚动容器样式（隐藏原生滚动条）
├── commands.ts                  # 命令注册表 + 执行器
├── useTypewriter.ts             # 逐字打印 hook
├── useEchoSequence.ts           # 命令输出动画 hook（两阶段）
├── useAnimateHeight.ts          # CSS transition 高度动画 hook
├── useTerminalActivation.ts     # 终端激活 hook（声明式接口）
└── __tests__/
    ├── commands.test.ts         # 命令系统测试（7 用例）
    ├── useTypewriter.test.ts    # 打字机测试（5 用例）
    ├── Scrollable.test.tsx      # 滚动容器测试（7 用例）
    └── useTerminalActivation.test.ts  # 激活 hook 测试（7 用例）
```

### 2.2 组件树

```
App.tsx
  │
  ├─ useTerminalActivation()  ← 未使用，App 自行实现 / 键监听
  │
  └─ <TerminalBar>            ← 无条件挂载，fixed 定位覆盖 canvas
       │
       ├─ useTypewriter()      ← 打字机动画状态
       ├─ useEchoSequence()    ← 命令输出动画控制器
       ├─ useAnimateHeight()   ← 高度动画（CSS transition，按行数变化触发）
       │
       └─ <div.terminal-bar-inner>     ← glass panel，onClick→激活
            │
            ├─ <Scrollable>            ← 通用滚动容器
            │   ├─ <div.scrollable-content>
            │   │   └─ <div.terminal-echo>   ← 回显文本（pre-wrap）
            │   └─ <div.scrollable-overlay>  ← ▲/▼ 指示器（absolute）
            │
            └─ <div.terminal-input-line>     ← CSS transition 显隐
                ├─ $ 提示符
                ├─ 闪烁光标 █
                ├─ placeholder 文本
                └─ <input hidden>            ← 捕获键盘（opacity: 0, 0×0）
```

### 2.3 数据流

```
                        ┌──────────────────────────┐
                        │      Zustand Store        │
                        │  scrollStore              │
                        │  ┌──────────────────────┐ │
                        │  │ TerminalSlice         │ │
                        │  │  terminalMode         │ │
                        │  │  echoLines[]          │ │
                        │  │  inputValue           │ │
                        │  │  typewriterDone       │ │
                        │  └──────────────────────┘ │
                        └──────┬──────────┬────────┘
                               │          │
              selector hooks   │          │  subscribe()（非渲染）
                               │          │
              ┌────────────────▼──┐  ┌────▼───────────────────┐
              │  TerminalBar      │  │  App.tsx                │
              │  (React re-render)│  │  (scroll/click guard)   │
              │                   │  │                         │
              │  • echo 渲染      │  │  • wheel 事件阻止       │
              │  • input 受控     │  │  • click 事件阻止       │
              │  • 状态行更新     │  │  • / 键监听             │
              └───────────────────┘  └─────────────────────────┘
```

**双重订阅模式（Zustand 最佳实践）：**

- **selector hooks**（`useScrollStore(s => s.xxx)`）→ 触发 React re-render，用于 UI 渲染
- **`.subscribe()`**（`useScrollStore.subscribe(callback)`）→ 不触发 re-render，用于颜色插值、状态行更新等高频操作

### 2.4 状态机

```
          页面加载
             │
             ▼
         ┌───────┐  typewriter 动画完成   ┌──────┐  / 键 / click   ┌────────┐
         │typing │ ────────────────────→ │ idle │ ──────────────→ │ active │
         └───────┘                       └──────┘                 └────────┘
                                             ↑                         │
                                             │      Esc / 失焦         │
                                             └─────────────────────────┘
```

| 状态 | 触发条件 | UI 表现 |
|------|----------|---------|
| `typing` | 页面加载 | 打字机动画逐字显示 `# YeQuDesu · Personal Site · ready`，光标闪烁 |
| `idle` | typewriter 完成 / Esc / 失焦 | 显示欢迎文本 + 实时状态行，`/` 提示可见 |
| `active` | `/` 键 / 点击 bar | 显示 `$` 提示符 + 输入光标 + placeholder，可输入命令 |

**状态约束：**
- `typing` → `idle`：自动转换（不可逆）
- `idle` ↔ `active`：用户操作驱动
- `typing` 态下 `/` 键无效（`useTerminalActivation.activate()` 仅从 `idle` 转换）

---

## 3. 模块详细说明

### 3.1 TerminalBar（主组件）

**文件：** `src/terminal/TerminalBar.tsx`

**签名：** `export default function TerminalBar()` — 无 props，所有状态来自 Zustand。

**模块级常量：**

| 常量 | 值 | 用途 |
|------|-----|------|
| `DEFAULT_ECHO_TEXT` | `'# YeQuDesu · Personal Site · ready'` | 初始欢迎信息 |
| `MAX_ECHO_LINES` | `5` | 回显区最大可见行数（用于 `max-height: calc(5 * 1.6em)`） |
| `HEIGHT_ANIM_PER_LINE` | `0.15` | 每行高度动画时长（秒），增长与收缩共用 |
| `ECHO_GROW_DELAY` | `0.25` | 回显占位→真内容替换的延迟（秒） |

**内部 Ref：**

| Ref | 类型 | 用途 |
|-----|------|------|
| `hiddenInputRef` | `HTMLInputElement` | 隐藏 input 元素引用，用于 `focus()` |
| `barInnerRef` | `HTMLDivElement` | glass panel 引用，用于 CSS 变量注入 |
| `scrollableRef` | `ScrollableHandle` | Scrollable 命令式方法（scroll、lineHeight） |
| `echoPlayingRef` | `boolean` | 回显动画进行中标志，抑制状态行更新 |
| `prevLineCount` | `number` | 上一次 echoLines 长度，触发高度动画 |
| `prevHeightRef` | `number` | 上一次 scrollHeight，高度动画的起始值 |
| `heightTimerRef` | `setTimeout` | 高度动画安全超时清理 |
| `animatingRef` | `boolean` | 高度动画进行中标志 |
| `statusLineIdx` | `number` | 状态行在 echoLines 数组中的索引 |

**关键方法：**

```
handleBarClick()      — 点击 bar 激活（stopPropagation ×2）
handleKeyDown()       — Escape / Enter / ArrowUp / ArrowDown
handleInputChange()   — 受控 input onChange
handleFocus()         — 设置 hasFocus = true
handleBlur()          — 100ms 延迟检查，失焦则退回 idle
buildStatusLine()     — 构建实时状态行字符串
renderOverlay()       — 渲染 ▲/▼ 滚动指示器
```

**渲染逻辑：**

```
typing 阶段：
  <span.echo-prefix>{displayedText}</span>   ← 打字机输出
  <span.terminal-typing-cursor>█</span>       ← 闪烁光标

idle / active 阶段：
  <span.echo-prefix>{echoLines[0]}</span>     ← 首行（欢迎信息）
  {echoLines.slice(1).map(...)}               ← 后续行（状态行 + 命令输出）

输入行（!isTypingPhase）：
  idle 态：光标 dim + placeholder
  active 态：$ 提示符 + 输入文本 + 光标 bright + placeholder
```

### 3.2 Scrollable（通用滚动容器）

**文件：** `src/terminal/Scrollable.tsx`

**设计援引：** Radix UI ScrollArea — overlay + viewport 分层模式

**导出接口：**

```typescript
// Props
interface ScrollableProps {
  scrollable: boolean                           // 是否启用滚动
  maxHeight: string                             // CSS max-height
  children: ReactNode                           // 滚动内容
  overlay?: (state: ScrollOverlayState) => ReactNode  // render prop
  autoScrollKey?: number                        // 变化时自动滚底
  onScrollStateChange?: (state: ScrollOverlayState) => void
  className?: string
}

// overlay 接收的滚动状态
interface ScrollOverlayState {
  canScrollUp: boolean
  canScrollDown: boolean
}

// 命令式 Ref 接口
interface ScrollableHandle {
  scrollBy(options: { top: number; behavior?: ScrollBehavior }): void
  scrollToBottom(): void
  getLineHeight(): number
  getScrollElement(): HTMLDivElement | null
}
```

**实现要点：**

- **滚动检测算法：** 使用 `distFromTop > 1` / `distFromBottom > 1`（1px 阈值避免 sub-pixel 误触），内容高度 ≤ 容器高度时强制双向不可滚动
- **隐藏原生滚动条：** `scrollbar-width: none`（Firefox）+ `::-webkit-scrollbar { display: none }`（WebKit）
- **overlay 分层：** `pointer-events: none` 保证点击穿透，内部 flex `space-between` 定位 ▲ 吸顶 / ▼ 吸底
- **autoScrollKey：** 外部传入的计数器变化 → 自动 `scrollToBottom()` + `requestAnimationFrame` 复查（内容可能异步渲染）
- **getLineHeight：** 首次调用读取 `getComputedStyle().lineHeight` 并缓存，后续返回缓存值

### 3.3 commands.ts（命令系统）

**文件：** `src/terminal/commands.ts`

**核心接口：**

```typescript
interface Command {
  name: string           // 主命令名
  aliases?: string[]     // 别名列表
  description: string    // 帮助文本
  handler: () => string  // 执行函数，返回输出字符串
}
```

**命令注册表（5 个内置命令）：**

| 命令 | 别名 | 描述 | 处理方式 |
|------|------|------|----------|
| `help` | — | 列出所有可用命令 | 遍历 registry 生成格式化列表 |
| `debug` | — | 切换调试模式 | 读写 `window.__DEBUG__` |
| `day` | `light` | 日间模式 | `<html>` 添加 `.light`，移除 `.dark` |
| `night` | `dark` | 夜间模式 | `<html>` 添加 `.dark`，移除 `.light` |
| `clear` | `cls` | 清屏 | handler 返回 `''`，实际清理由 `TerminalBar.handleKeyDown` 直接处理 |

**执行流程：**

```
executeCommand(input)
  ├─ input.trim() → 空字符串？返回 ''
  ├─ 按 name 或 aliases 匹配命令
  ├─ 未匹配 → "command not found: {input}\nType 'help'..."
  └─ 已匹配 → cmd.handler()
```

**扩展方式：** 只需向 `commandRegistry` 数组 push 新条目，无需修改其他文件。

### 3.4 useTypewriter（打字机动画）

**文件：** `src/terminal/useTypewriter.ts`

**接口：**

```typescript
interface TypewriterConfig {
  startDelay?: number    // 开始前延迟（ms），默认 800
  charInterval?: number  // 字符间隔（ms），默认 40
  echoText: string       // 要显示的文本
}

interface TypewriterState {
  displayedText: string  // 当前已显示的文本
  isTyping: boolean      // 打字进行中
  isDone: boolean        // 打字已完成
}
```

**实现机制：**

- 使用递归 `setTimeout` 调度，每次 +1 字符
- 清理函数设置 `cancelled` 标志 + `clearTimeout`
- `startDelay` 控制初始延迟（给页面加载留时间）
- `charInterval` 控制字符间间隔（模拟打字节奏）

**在 TerminalBar 中的使用：**

```
useTypewriter({ startDelay: 800, charInterval: 40, echoText: DEFAULT_ECHO_TEXT })
  → 返回 { displayedText, isTyping, isDone }

isDone 变为 true 时（useEffect 监听）：
  → setTypewriterDone(true)
  → setTerminalMode('idle')
  → echoLines = [DEFAULT_ECHO_TEXT]
```

### 3.5 useEchoSequence（回显动画）

**文件：** `src/terminal/useEchoSequence.ts`

**接口：**

```typescript
type EchoStrategy = 'direct' | 'line-by-line' | 'char-by-char'

interface EchoSequenceConfig {
  strategy?: EchoStrategy       // 回显策略，默认 'line-by-line'
  lineDelay?: number            // 逐行延迟（ms），默认 60
  charInterval?: number         // 逐字符延迟（ms），默认 25
  growDelay?: number            // 高度增长后→回显开始的延迟（秒），默认 0.25
  onLineRevealed?: () => void   // 每行内容替换后回调
}

interface EchoSequenceAPI {
  play: (startIndex: number, lines: string[]) => Promise<void>
  cancel: () => void
}
```

**两阶段动画：**

```
Phase 1 — 高度增长（占位符阶段）
  for each line in lines:
    appendEcho(' ')           ← 空白占位，触发 Scrollable 高度 CSS transition
  ↓ 容器高度从 old → new（CSS transition）

Phase 2 — 内容替换（growDelay 后）
  direct:      所有行立即替换为真实文本
  line-by-line: 逐行替换，lineDelay ms 间隔  ← 当前默认策略
  char-by-char: 逐字符替换，charInterval ms 间隔

每行替换后：onLineRevealed() → 如果用户在底部，平滑滚动到底部
```

**取消机制：** `cancel()` 设置 `cancelledRef.current = true`，`play()` 在每个异步步骤间检查此标志。

### 3.6 useAnimateHeight（高度动画）

**文件：** `src/terminal/useAnimateHeight.ts`

**接口：**

```typescript
function useAnimateHeight(
  getElement: () => HTMLElement | null | undefined,
  items: readonly unknown[],
  options?: { durationPerLine?: number; onComplete?: () => void },
): void
```

**职责：** 监听 `echoLines` 数组引用变化，当行数变化时用 CSS transition 动画过渡容器高度。

**动画策略（精确对应原方案）：**

| 场景 | 条件 | 行为 |
|------|------|------|
| **GROW（无运行中动画）** | `curr > prev && !animatingRef` | lock oldH → 新 CSS transition → height 动画到 newH |
| **GROW（动画运行中）** | `curr > prev && animatingRef` | 仅更新 `el.style.height = newH`，transition 自然转向 |
| **SHRINK** | `curr < prev` | 始终 lock oldH + 新 transition（不合并） |
| **内容替换（Phase 2）** | `curr === prev` | 仅更新 `prevHeightRef`，不触发动画 |

**关键机制：**

- **`offsetHeight` 强制布局快照：** 设置 `height=oldH` → 读取 `offsetHeight`（强制浏览器计算布局）→ 设置 `height=newH`。这是从 JS 触发 CSS transition 的唯一可靠方式——浏览器必须在两次 `height` 赋值之间"看到"一次布局计算才会识别属性变更。
- **`animatingRef` 合并连续增长：** 当 Phase 1 连续 `appendEcho` 时，第一次设置 transition，后续仅更新目标值。CSS transition 持续运行，自然转向新目标——无需重启动画。
- **`transitionend + setTimeout` 双保险清理：** `transitionend` 是正常路径，`setTimeout` 兜底处理 transition 不触发的情况（如高度无变化）。
- **ref 依赖隔离：** `getElement` 和 `options` 通过 ref 存储而非放入 deps 数组，确保 effect 仅在 `items`（echoLines 数组引用）变化时触发，与原方案 `[echoLines]` 依赖一致。

**在 TerminalBar 中的使用：**

```typescript
useAnimateHeight(
  () => scrollableRef.current?.getScrollElement(),
  echoLines,
  { durationPerLine: HEIGHT_ANIM_PER_LINE, onComplete: () => scrollToBottom() },
)
```

**与 GSAP 方案的比较：** 此前尝试过 `gsap.to()`（Web Animations API 变体），但 CSS transition 在此场景更具优势——动画跑在浏览器合成器线程（不占 JS 主线程），`animatingRef` 合并模式避免 tween kill/restart 的复杂性。

### 3.7 useTerminalActivation（激活控制）

**文件：** `src/terminal/useTerminalActivation.ts`

**接口：**

```typescript
interface TerminalActivationAPI {
  onKeyDown: (e: KeyboardEvent) => void  // / 键处理器
  activate: () => void                   // 程序式激活
  isActive: boolean                      // 是否 active
}
```

**逻辑：**
- `onKeyDown`：监听 `/` 键，忽略 INPUT/TEXTAREA 目标，调用 `preventDefault()` + `activate()`
- `activate`：仅当 `terminalMode === 'idle'` 时切换到 `'active'`
- `isActive`：selector 派生自 `terminalMode === 'active'`
- 返回对象通过 `useMemo` 稳定引用

**当前状态：** ⚠️ 此 hook 已定义、已测试，但 **App.tsx 未使用**。App.tsx 在第 154-165 行内联了相同的逻辑。这是有意保留的抽象，供未来重构 App.tsx 时使用。详见 [`maintenance-guide.md`](./maintenance-guide.md#61-已知问题)。

---

## 4. Zustand Store 接口

### 4.1 Terminal Slice 状态

```typescript
// src/stores/scrollStore.ts

type TerminalMode = 'typing' | 'idle' | 'active'

interface TerminalSlice {
  terminalMode: TerminalMode    // 当前状态
  echoLines: string[]           // 回显区文本行数组
  inputValue: string            // 当前输入文本
  typewriterDone: boolean       // 打字机是否完成
}
```

### 4.2 Terminal Actions

| Action | 签名 | 用途 |
|--------|------|------|
| `setTerminalMode` | `(mode: TerminalMode) => void` | 切换状态 |
| `setInputValue` | `(val: string) => void` | 更新输入值 |
| `appendEcho` | `(line: string) => void` | 追加一行到回显区 |
| `appendLastEcho` | `(text: string) => void` | 追加文本到最后一行末尾 |
| `setEchoLine` | `(index: number, text: string) => void` | 替换指定索引的行 |
| `clearInput` | `() => void` | 清空输入值 |
| `setTypewriterDone` | `(done: boolean) => void` | 标记打字机完成 |

### 4.3 读取方式

```typescript
// 响应式（触发 re-render）
const terminalMode = useScrollStore((s) => s.terminalMode)

// 非响应式（useFrame / subscribe 回调中使用）
const sp = useScrollStore.getState().scrollProgress

// 直接写入（subscribe 回调中批量更新）
useScrollStore.setState({ echoLines: newLines })
```

---

## 5. 动画系统

Terminal Bar 包含 **四个独立动画子系统**，各自有独立的触发时机和生命周期。

### 5.1 打字机动画（Typewriter）

| 属性 | 值 |
|------|-----|
| 触发时机 | 页面加载（组件挂载） |
| 负责模块 | `useTypewriter` |
| 动画技术 | 递归 `setTimeout` |
| 初始延迟 | 800ms |
| 字符间隔 | 40ms |
| 总时长（40 字符） | 800 + 40×40 = 2400ms |
| 终止条件 | 全部字符显示完毕 |
| 取消方式 | 组件卸载时 `clearTimeout` |

### 5.2 回显序列动画（Echo Sequence）

| 属性 | 值 |
|------|-----|
| 触发时机 | 用户输入命令 + Enter |
| 负责模块 | `useEchoSequence` |
| 动画技术 | `async/await` + `setTimeout` 包装的 `delay()` |
| Phase 1 | 追加空白占位行（触发高度增长） |
| Phase 2 | `growDelay`(0.25s) 后，逐行替换为真实文本（60ms 间隔） |
| 取消方式 | `cancel()` 设置 `cancelledRef`，各步骤间检查 |

**回显策略对比：**

| 策略 | 视觉表现 | 行间延迟 | 适用场景 |
|------|----------|----------|----------|
| `direct` | 所有输出瞬间出现 | 无 | 极短输出 |
| `line-by-line` | 逐行显示 | 60ms | **当前默认**，类终端效果 |
| `char-by-char` | 逐字符显示 | 25ms | 模拟远程登录延迟 |

### 5.3 高度动画（Height Animation）

| 属性 | 值 |
|------|-----|
| 触发时机 | `echoLines` 数组引用变化 |
| 负责模块 | `useAnimateHeight` hook（`TerminalBar` 调用） |
| 动画技术 | CSS `transition: height {duration}s ease` + `offsetHeight` 强制布局快照 |
| 增长速度 | `animatingRef=false` → 新 transition；`animatingRef=true` → 仅更新 height 目标值 |
| 收缩速度 | 始终 lock oldH + 新 transition |
| 清理方式 | `transitionend` 事件（正常路径）+ `setTimeout` 安全超时兜底 |

**SHRINK 流程：**

```
echoLines 行数减少
  ↓
lock oldH → overflow:hidden → transition = height {dur}s ease
  ↓
offsetHeight（强制布局快照——使浏览器"看见"起始高度）
  ↓
height = newH（触发 CSS transition）
  ↓
transitionend → 清理 inline styles → scrollToBottom()
```

**GROW 流程（`animatingRef` 合并）：**

```
echoLines 行数增长
  ↓
animatingRef=false？                               animatingRef=true？
  ├─ lock oldH + 新 transition + offsetHeight       └─ 仅 height = newH
  └─ height = newH（触发 transition）                   （transition 自然转向新目标）
  ↓
transitionend → 清理 → scrollToBottom()
```

### 5.4 动态颜色插值（Color Interpolation）

| 属性 | 值 |
|------|-----|
| 触发时机 | `scrollProgress` 变化 |
| 负责模块 | `TerminalBar` 内 `useEffect` + `useScrollStore.subscribe()` |
| 插值范围 | `scrollProgress` 0.40 → 0.55（smoothstep 映射到 0→1） |
| 更新频率 | 每次 scroll 事件（约 60Hz） |
| 更新方式 | `element.style.setProperty('--tw-*', value)` — 不触发 re-render |

**插值算法：**

```
raw = clamp((sp - 0.40) / 0.15, 0, 1)    // 线性映射
t   = raw² × (3 - 2×raw)                   // smoothstep（Hermite 插值）
color = lerpHex(darkValue, lightValue, t)  // 逐通道线性插值
```

**涉及的 CSS 变量（10 个）：**

| 变量 | 暗色值（Act 1） | 亮色值（Act 2+） |
|------|----------------|-------------------|
| `--tw-echo` | `#7c8aa0` | `#475569` |
| `--tw-prefix` | `#64748b` | `#334155` |
| `--tw-prompt` | `#0ea5e9` | `#0369a1` |
| `--tw-placeholder` | `rgba(255,255,255,0.15)` | `rgba(0,0,0,0.10)` |
| `--tw-input` | `#e2e8f0` | `#1e293b` |
| `--tw-cursor-bright` | `#e2e8f0` | `#1e293b` |
| `--tw-cursor-dim` | `#0ea5e9` | `#0369a1` |
| `--tw-ring` | `rgba(200,220,255,0.45)` | `rgba(30,64,175,0.30)` |
| `--tw-ring-outer` | `rgba(180,210,255,0.14)` | `rgba(30,64,175,0.08)` |
| `--tw-ring-active` | `rgba(180,210,255,0.30)` | `rgba(30,64,175,0.20)` |

---

## 6. 视觉系统

### 6.1 Liquid Glass 面板

**设计语言：** Vivid Glass — 参考 Apple Vision Pro 玻璃材质

**层级结构：**

```
.terminal-bar            ← fixed 定位容器，z-index: 15, pointer-events: none
  └─ .terminal-bar-inner  ← pointer-events: auto, centered, max-width: 640px
       ├─ 基底：半透明渐变 background
       ├─ 边框：淡蓝色 1px solid
       ├─ 模糊：backdrop-filter: blur(20px) saturate(180%)
       ├─ 高光：inset 0 1px 0 rgba(255,255,255,0.10)
       ├─ 阴影：多层 box-shadow（hover/active 增强）
       └─ ::before 伪元素：三层径向渐变光晕
```

**CSS 关键值：**

| 属性 | 值 |
|------|-----|
| `font-family` | `'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace` |
| `font-size` | `0.68rem` |
| `line-height` | `1.6` |
| `border-radius` | `12px` |
| `width` | `min(90vw, 640px)` |
| `backdrop-filter` | `blur(20px) saturate(180%)` |
| `border` | `1px solid rgba(100, 180, 255, 0.18)` |

### 6.2 光标动画

```css
/* idle 态 — 常亮 dim 光标 */
.terminal-cursor.dim { color: var(--tw-cursor-dim); }

/* active 态 — 闪烁 bright 光标 */
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
.terminal-cursor.bright {
  color: var(--tw-cursor-bright);
  animation: cursor-blink 1s step-end infinite;
}

/* typing 态 — 独立闪烁光标 */
.terminal-typing-cursor {
  animation: blink 1s step-end infinite;
}
```

### 6.3 输入行动画

```css
.terminal-input-line {
  max-height: 0;        /* collapse 状态 */
  opacity: 0;
  transition: max-height 0.2s ease, opacity 0.2s ease;
}

.terminal-input-line.visible {
  max-height: 2em;      /* expand 状态 */
  opacity: 1;
}
```

### 6.4 滚动指示器

```
.scrollable-overlay
  display: flex; flex-direction: column; justify-content: space-between;
  pointer-events: none;

  .echo-scroll-up    ← ▲ 吸顶，opacity toggle（.visible { opacity: 1 }）
  .echo-scroll-down  ← ▼ 吸底，opacity toggle
```

指示器使用 `transition: opacity 0.15s` 平滑显隐。

---

## 7. 集成接口

### 7.1 对 App.tsx 的接口

TerminalBar 作为子组件挂载在 App.tsx 中：

```tsx
// App.tsx 第 12 行
import TerminalBar from './terminal/TerminalBar'

// App.tsx 第 261 行
<TerminalBar />
```

**App.tsx 的职责：**

1. **滚动阻止：** 当 `terminalMode === 'active'` 时，阻止页面 wheel 和 click 事件
2. **键盘激活：** 全局 `keydown` 监听 `/` 键（App.tsx 第 154-165 行，内联实现）
3. **状态同步：** 通过 `useScrollStore.subscribe()` 跟踪 `terminalMode`

### 7.2 对外导出

`src/terminal/` 模块对外导出（供其他模块使用）：

| 导出 | 使用者 |
|------|--------|
| `default TerminalBar` | `App.tsx` |
| `Scrollable`（命名导出） | 可复用（当前仅 `TerminalBar` 使用） |
| `ScrollableHandle`（类型） | 可复用 |
| `ScrollOverlayState`（类型） | 可复用 |
| `useTerminalActivation`（命名导出） | 备用（当前未使用） |
| `TerminalActivationAPI`（类型） | 备用 |
| `useTypewriter`（命名导出） | 可复用（当前仅 `TerminalBar` 使用） |
| `TypewriterConfig`, `TypewriterState`（类型） | 可复用 |
| `useEchoSequence`（命名导出） | 可复用（当前仅 `TerminalBar` 使用） |
| `EchoStrategy`（类型） | 可复用 |
| `EchoSequenceConfig`, `EchoSequenceAPI`（类型） | 可复用 |
| `Command`（类型） | 可复用 |
| `commandRegistry`, `executeCommand` | 可复用 |

### 7.3 CSS 变量桥接

TerminalBar 通过 `barInnerRef.current.style.setProperty()` 设置 CSS 变量，所有子元素通过 `var(--tw-*)` 引用。这些变量是该组件的**内部实现细节**，不对外暴露。

---

## 8. 设计决策与权衡

### 8.1 组件定位：DOM overlay vs R3F 内

| 方案 | 优点 | 缺点 |
|------|------|------|
| **DOM overlay（采用）** | 文本渲染清晰、无障碍访问、CSS 动画简单 | 覆盖在 canvas 上，无法参与 3D 深度排序 |
| R3F `<Html>` | 参与 3D 空间定位 | 文本渲染模糊（canvas 纹理）、性能开销 |

**结论：** Terminal 是纯信息展示/输入界面，不需要 3D 定位，DOM overlay 是最佳选择。

### 8.2 Scrollable 分层架构 vs v1 sticky + float

| 维度 | v1（sticky + float） | v2（overlay 分层） |
|------|---------------------|---------------------|
| 定位方式 | `position: sticky; float: right; height: 0` | flex `space-between` + `align-self: flex-end` |
| 浏览器兼容 | sticky+float 语义冲突 | 标准 flexbox |
| DOM 关系 | 箭头在滚动容器子节点中 | 箭头在独立 overlay 层 |
| 可复用性 | 紧耦合 TerminalBar | 通用 `<Scrollable>` 组件 |

### 8.3 隐藏 input 模式

终端使用一个 `opacity: 0; width: 0; height: 0` 的隐藏 `<input>` 来捕获键盘事件，而非直接监听 `window.keydown`。原因：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **隐藏 input（采用）** | 原生焦点管理、自动获得 IME 支持、移动端键盘自动弹出 | 需要管理聚焦/失焦状态 |
| window.keydown 监听 | 不需要 DOM 焦点 | 无法利用原生输入法、需要手动过滤事件源 |

### 8.4 颜色插值：CSS Variables vs CSS-in-JS

| 方案 | 优点 | 缺点 |
|------|------|------|
| **CSS variables + setProperty（采用）** | 不触发 React re-render、批量更新高效 | 需要手动管理 ref |
| CSS-in-JS（styled-components） | 类型安全 | 运行时开销、每次更新触发 re-render |
| 行内 style | 简单 | 代码冗长 |

### 8.5 动画技术选型

| 动画 | 技术 | 原因 |
|------|------|------|
| 打字机 | 递归 `setTimeout` | 需要逐字符精确控制，`setInterval` 不适合可变间隔 |
| 回显序列 | `async/await` + `delay()` | 两阶段异步流程，`await` 比回调链清晰 |
| 高度动画 | CSS `transition` + `offsetHeight` | 合成器线程执行（不占 JS 主线程）；`animatingRef` 合并连续推送无需重启；曾评估 GSAP（引入 tween kill/restart 复杂度与依赖开销）后放弃 |
| 颜色插值 | `subscribe()` + `setProperty()` | 高频更新（60Hz），不能触发 re-render |

### 8.6 useTerminalActivation 的定位

该 hook 提供了声明式的终端激活接口，但 App.tsx 当前内联了相同的逻辑。这是有意保留的抽象层，等待 App.tsx 复杂到值得重构时迁移。详见 [`maintenance-guide.md#61`](./maintenance-guide.md#61-已知问题)。
