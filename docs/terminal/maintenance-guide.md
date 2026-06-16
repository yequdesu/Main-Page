# Terminal Bar — 维护指南

> 面向开发者的维护、调试与扩展指南。技术规格见 [`specification.md`](./specification.md)，操作手册见 [`operation-guide.md`](./operation-guide.md)。

---

## 目录

1. [代码地图](#1-代码地图)
2. [开发环境](#2-开发环境)
3. [状态管理详解](#3-状态管理详解)
4. [动画系统维护](#4-动画系统维护)
5. [扩展指南](#5-扩展指南)
6. [已知问题与注意事项](#6-已知问题与注意事项)
7. [调试指南](#7-调试指南)
8. [测试指南](#8-测试指南)

---

## 1. 代码地图

### 1.1 文件依赖关系

```
                    ┌─────────────────┐
                    │  scrollStore.ts │  ← Zustand store（Terminal slice）
                    └───────┬─────────┘
                            │
            ┌───────────────┼───────────────────┐
            │               │                   │
            ▼               ▼                   ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
    │ TerminalBar  │ │ useTerminal  │ │ App.tsx          │
    │ .tsx         │ │ Activation   │ │ (scroll/click    │
    │              │ │ .ts          │ │  guard)          │
    └───┬────┬─────┘ └──────────────┘ └──────────────────┘
        │    │
    ┌───┤    ├──────────┐
    │   │    │          │
    ▼   │    ▼          ▼
┌────┐│ ┌─────────┐ ┌──────────────┐
│use ││ │commands │ │useEchoSeq    │
│Type││ │.ts      │ │uence.ts      │
│writ││ └─────────┘ └──────┬───────┘
│er  ││                    │
│.ts ││                    ▼
└──┬─┘│          ┌──────────────┐
   │  │          │useAnimate    │
   │  │          │Height.ts     │
   │  │          └──────┬───────┘
   │  │                 │
   │  │                 ▼
   │  │          ┌──────────────┐
   │  │          │useTerminal   │
   │  │          │State.ts      │
   │  │          └──────┬───────┘
   │  │                 │
   │  │                 ▼
   │  │          ┌──────────────┐
   │  │          │  Scrollable  │
   │  │          │  .tsx        │
   │  │          └──────────────┘
   │  │
   │  └──────────┐
   ▼             ▼
┌────────────────────┐
│  TerminalBar.css   │
└────────────────────┘
```

**依赖方向：** 所有箭头指向被依赖方。`TerminalBar` 是唯一的组装点，hooks 和 commands 都是独立的纯逻辑模块。

### 1.2 修改影响范围

| 修改目标 | 可能影响 | 风险等级 |
|----------|----------|:---:|
| `commands.ts` — 添加命令 | 无（纯数据驱动） | 🟢 低 |
| `commands.ts` — 修改 `executeCommand` | `TerminalBar.handleKeyDown` | 🟡 中 |
| `useTypewriter.ts` | `TerminalBar` 打字机行为 | 🟡 中 |
| `useEchoSequence.ts` | `TerminalBar` 回显动画 | 🟡 中 |
| `useAnimateHeight.ts` | `TerminalBar` 高度动画 | 🟡 中 |
| `Scrollable.tsx` | 所有使用该组件的地方（当前仅 TerminalBar） | 🟡 中 |
| `TerminalBar.tsx` — 渲染逻辑 | 用户可见 UI | 🔴 高 |
| `TerminalBar.css` | 用户可见视觉 | 🔴 高 |
| `scrollStore.ts` — Terminal slice | `TerminalBar`, `App.tsx`, `useTerminalActivation` | 🔴 高 |
| `useTerminalActivation.ts` | `App.tsx`（当迁移后） | 🟢 低（当前未使用） |

### 1.3 关键代码位置速查

| 需要修改... | 去这里 | 关注点 |
|-------------|--------|--------|
| 添加新命令 | `commands.ts:9` | `commandRegistry` 数组 |
| 改打字机速度 | `TerminalBar.tsx:119-123` | `startDelay` / `charInterval` |
| 改回显策略 | `TerminalBar.tsx:82` | `echoStrategy` 变量 |
| 改回显速度 | `useEchoSequence.ts:31-33` | 默认 `lineDelay` / `charInterval` |
| 改高度动画速度 | `TerminalBar.tsx` DEFAULTS.animation.heightAnimPerLine 或传 `animation={{ heightAnimPerLine: 0.3 }}` | props 覆盖 |
| 改最大可见行数 | `TerminalBar.tsx` DEFAULTS.layout.maxEchoLines 或传 `layout={{ maxEchoLines: 8 }}` | props 覆盖 |
| 改欢迎文本 | `TerminalBar.tsx` DEFAULTS.text.welcomeText 或传 `text={{ welcomeText: '...' }}` | props 覆盖 |
| 改颜色 | `App.tsx` 的 `handleThemeUpdate` 回调 | 注入 `onThemeUpdate` |
| 改状态行格式 | `App.tsx` 的 `handleBuildStatusLine` 回调 | 注入 `buildStatusLine` |
| 改 `clear` 行为 | `TerminalBar.tsx` handleKeyDown `clear`/`cls` 分支 | 一次构建含状态行的完整数组 |
| 改命令 | `App.tsx` 的 `handleCommand` 回调 | 注入 `onCommand` |
| 状态行更新时机 | `TerminalBar.tsx` `useEffect`（scrollProgress deps） | 注意：勿改回 `useLayoutEffect`，见 §6.8 |
| 改颜色插值范围 | `TerminalBar.tsx:98` | `sp <= 0.40` / `sp >= 0.55` |
| 改颜色的暗/亮值 | `TerminalBar.tsx:102-111` | `lerpHex` / `lerpRgba` 调用 |
| 改玻璃强度 | `TerminalBar.css` | `.terminal-bar-inner` 的 `backdrop-filter` / `background` |
| 改面板宽度 | `TerminalBar.css` | `.terminal-bar-inner` 的 `width` / `max-width` |
| 改 z-index 层级 | `TerminalBar.css` | `.terminal-bar` 的 `z-index` |
| 改激活键 | `useTerminalActivation.ts:49` | `e.key === '/'` |

---

## 2. 开发环境

### 2.1 启动

```bash
pnpm dev        # 启动 Vite 开发服务器 → http://localhost:5173
pnpm test       # 运行全部测试
pnpm build      # TypeScript 编译 + 生产构建
```

### 2.2 快速验证 Terminal Bar 功能

每次修改后，手动验证以下流程：

```
1. 页面加载 → 观察 typing 动画（打字机逐字显示）
2. 动画结束 → 确认状态行出现（# Act 1 · OceanVoyage · scroll ...%）
3. 滚动页面 → 确认状态行百分比实时更新
4. 按 / → 确认终端激活（$ 提示符 + 闪烁光标 + placeholder）
5. 输入 help → Enter → 确认命令列表以逐行动画显示
6. 按 ArrowUp / ArrowDown → 确认回显区滚动 + ▲/▼ 指示器
7. 按 Esc → 确认退出 active，页面恢复滚动
8. 点击终端栏 → 确认重新激活
9. 输入 day / night → 确认主题切换
10. 输入 clear → 确认回显区重置
11. 滚动到 Act 2 → 确认终端文字颜色平滑变暗
12. 确认 active 态时鼠标滚轮无法滚动页面
```

### 2.3 HMR 行为

- **`.tsx` / `.ts` 文件：** Vite HMR 自动热更新，状态保留
- **`.css` 文件：** HMR 热更新，样式即时生效
- **修改 `scrollStore.ts`：** HMR 可能导致状态丢失，需手动刷新浏览器

---

## 3. 状态管理详解

### 3.1 状态所有权

```
Zustand scrollStore（全局持久化）
  ├─ terminalMode: 'typing' | 'idle' | 'active'  ← App.tsx 和 TerminalBar 共享
  ├─ echoLines: string[]                          ← 仅 TerminalBar 读写
  ├─ inputValue: string                           ← 仅 TerminalBar 读写
  └─ typewriterDone: boolean                      ← 仅 TerminalBar 读写

React useState（组件局部）
  └─ hasFocus: boolean                            ← 仅 TerminalBar 内部

useRef（实例持久化，不触发渲染）
  ├─ echoPlayingRef                               ← 抑制状态行更新
  ├─ prevLineCount / prevHeightRef                ← 高度动画状态
  ├─ animatingRef / heightTimerRef                ← 高度动画控制
  └─ statusLineIdx                                ← 状态行位置追踪
```

### 3.2 两种订阅模式的适用场景

```typescript
// 模式 A：selector hook — 触发 React re-render
// 适用：UI 渲染依赖的值（echoLines 变了 → 重新渲染回显区）
const echoLines = useScrollStore((s) => s.echoLines)

// 模式 B：.subscribe() — 不触发 re-render
// 适用：高频更新、副作用操作（颜色插值、状态行更新）
useEffect(() => {
  const unsub = useScrollStore.subscribe(() => {
    updateColors()  // 直接操作 DOM，不需要 React 参与
  })
  return unsub
}, [])
```

**原则：** 如果操作不需要 React 重新渲染（直接操作 DOM、ref、或其他副作用），使用 `.subscribe()`。如果需要更新 JSX 中显示的内容，使用 selector hook。

### 3.3 直接写入状态

```typescript
// 在 subscribe 回调或事件处理器中，可以直接用 .setState() 批量更新
useScrollStore.setState({ echoLines: newLines })

// 等价于逐个调用 action，但只触发一次 re-render
```

### 3.4 状态行的更新策略

状态行（`# Act N · Name · scroll X%`）的更新逻辑位于 `TerminalBar.tsx:146-173`：

```
subscribe 回调触发
  ↓
echoPlayingRef.current === true？ → 跳过（回显动画进行中）
  ↓
在 echoLines 中查找以 "# Act " 开头的行
  ├─ 找到 → 内容不同？更新该行
  └─ 未找到 → 追加新状态行到末尾
  ↓
使用 useScrollStore.setState() 批量更新
```

**为什么不用 selector hook？** 状态行随每次 scroll 事件更新（60Hz），如果触发 React re-render 会严重影响性能。直接操作 store 数组并 `setState()` 只触发依赖 `echoLines` 的组件更新。

---

## 4. 动画系统维护

### 4.1 打字机动画

**位置：** `useTypewriter.ts` + `TerminalBar.tsx` typewriter completion effect

**调参：**

```typescript
// TerminalBar.tsx — DEFAULTS.animation 或 props
// typewriterStartDelay: 800 (ms)
// typewriterCharInterval: 40 (ms)
// 更换欢迎文本 → DEFAULTS.text.welcomeText 或 props.text.welcomeText
```

**完成后的 gap 过渡（1.5s 光标闪烁）：**

打字机全部字符显示完毕后，`useEffect` 设置 `setTimeout(1500)`，保持 typing 模式让光标继续闪烁。1.5s 后在 timer 回调内统一执行：`setTypewriterDone(true)` → `setMode('idle')` → `resetToWelcome()`。

**⚠️ `setTypewriterDone(true)` 必须放在 timer 回调内，不能同步调用。** 原因：`typewriterDone` 在 effect deps 中。若同步调用，effect 立即重跑，cleanup 的 `clearTimeout` 会杀死刚设置的 timer，状态机卡死在 typing。详见 [dev-blog: 案例二](../../docs/dev-blog/react-effect-timing-traps.md#案例二setstate-杀死了自己的-settimeout)。

### 4.2 回显序列动画

**位置：** `useEchoSequence.ts` + `TerminalBar.tsx:71-92`

**两阶段流程：**

```
Phase 1：appendEcho(' ') × N  →  容器高度从 N 行增长到 N+M 行
Phase 2：setEchoLine(idx, text) × M  →  占位空白替换为真实文本
```

**为什么需要两阶段？** 如果直接追加真实文本，回显区的 CSS transition 增长会和文本替换同时发生，产生视觉抖动。先用空白占位让容器高度先到位，再替换文本内容。

**切换策略：**

```typescript
// TerminalBar.tsx L82
const echoStrategy: EchoStrategy = 'line-by-line'
// 可选：'direct' | 'line-by-line' | 'char-by-char'
```

**调参：**

```typescript
// TerminalBar.tsx L83-86
const { play: _playEcho, cancel: cancelEcho } = useEchoSequence(
  appendEcho, setEchoLine,
  {
    strategy: echoStrategy,
    growDelay: 0.25,     // Phase 1→Phase 2 的等待时间（秒）
    onLineRevealed: handleLineRevealed,
    // lineDelay: 60,    // 默认值，line-by-line 时生效
    // charInterval: 25, // 默认值，char-by-char 时生效
  },
)
```

**⚠️ 取消时机：** 如果用户在回显动画期间输入新命令，旧动画会被中断。`cancelEcho()` 设置 `cancelledRef`，`play()` 在每个异步步骤间检查此标志。如果需要在动画期间禁用输入，检查 `echoPlayingRef.current`。

### 4.3 高度动画

**位置：** `useAnimateHeight.ts`（hook），`TerminalBar.tsx:176-183`（调用点）

**核心机制：** CSS `transition: height {dur}s ease` + `offsetHeight` 强制布局快照，封装在 `useAnimateHeight` hook 中。

**动画策略（三个分支）：**

```
echoLines 引用变化 → useLayoutEffect 触发
  ↓
┌─ curr < prev：SHRINK ───────────────────────┐
│ 始终 lock oldH + 新 transition              │
│ （不合并——收缩是用户主动操作如 clear）       │
│ clear 特殊：一次构建完整数组（含状态行），    │
│ 避免 useLayoutEffect 残留回调覆盖动画        │
├─ curr > prev：GROW ─────────────────────────┤
│ animatingRef=false → lock oldH + 新         │
│   transition + offsetHeight                 │
│ animatingRef=true → 仅 height = newH        │
│   （transition 自然转向，连续不断开）         │
├─ curr === prev：Phase 2 内容替换 ──────────┤
│ 仅 prevHeightRef = scrollHeight             │
│ （追踪折行导致的高度变化，不触发动画）       │
└─────────────────────────────────────────────┘
  ↓
transitionend 事件 → 清理 inline styles + scrollToBottom()
setTimeout 安全超时 → 兜底（transitionend 未触发时）
```

**`offsetHeight` 的必要性：** 设置 `height=oldH` → 读取 `offsetHeight`（强制浏览器计算布局，创建"布局快照"）→ 设置 `height=newH`。浏览器在两次赋值之间看到了布局变化，才会触发 CSS transition。删除 `offsetHeight` 这行会导致 transition 不启动。

**依赖隔离：** `getElement` 和 `options` 通过 ref 存储而非放入 deps 数组。Effect 仅在 `items`（echoLines 数组引用）变化时触发，与原方案 `[echoLines]` 依赖行为一致。避免每次 render 都重新运行动画逻辑。

**调参：**

```typescript
// TerminalBar.tsx L15
const HEIGHT_ANIM_PER_LINE = 0.15  // 秒/行 — 增大 = 动画更慢

// useAnimateHeight.ts — durationPerLine 选项
// SHRINK: duration = (prev - curr) * durationPerLine
// GROW:   duration = durationPerLine（固定，单次增长时长）
```

**⚠️ 为什么用 `useLayoutEffect` 而非 `useEffect`？** 高度动画需要在浏览器绘制前同步完成 `oldH → transition → newH` 的设置序列。`useEffect` 的异步时机（paint 之后）会导致内容先跳变到新高度再被锁定回旧高度，产生闪烁。

**⚠️ 曾评估 GSAP 方案：** `gsap.to()` 方案因需 kill/restart tween 处理连续推送（CSS transition 的 `animatingRef` 合并更自然），且 CSS transition 跑在合成器线程（无 JS 开销），最终放弃。

### 4.4 颜色插值

**位置：** `TerminalBar.tsx:95-116`

**插值范围：** `scrollProgress` 从 0.40 到 0.55。此范围对应 Act 1（暗色背景）→ Act 2（白化过渡）的颜色转变。

**修改插值范围：**

```typescript
// TerminalBar.tsx L98
const raw = sp <= 0.40 ? 0 : sp >= 0.55 ? 1 : (sp - 0.40) / 0.15
//                                        ↑ 改这两个阈值
```

**修改具体颜色：** 直接修改 `lerpHex` / `lerpRgba` 的参数，第一个参数是暗色值（Act 1），第二个参数是亮色值（Act 3）。

**⚠️ 为什么通过 subscribe 而非 selector hook？** 每次 scroll 事件更新颜色，60Hz 频率。用 selector hook 会导致 TerminalBar 每帧重新渲染；用 subscribe + `style.setProperty()` 直接操作 DOM，React 完全不参与。

---

## 5. 扩展指南

### 5.1 添加新命令

只需修改 `src/terminal/commands.ts`，向 `commandRegistry` 数组 push 新条目：

```typescript
// src/terminal/commands.ts
{
  name: 'hello',               // 主命令名（必须）
  aliases: ['hi', 'greet'],    // 别名（可选）
  description: 'Say hello',    // 帮助文本
  handler: () => {             // 返回输出字符串
    return 'Hello, world!'
  },
}
```

**无需修改其他文件。** `executeCommand` 会自动匹配，`help` 命令会自动列出。

**handler 可以做什么：**

```typescript
// 访问全局状态
handler: () => {
  const sp = useScrollStore.getState().scrollProgress  // Zustand getState() 不会触发订阅
  return `Current scroll: ${Math.round(sp * 100)}%`
}

// 操作 DOM
handler: () => {
  document.body.classList.toggle('special-mode')
  return 'Toggled special mode'
}

// 访问 window 变量
handler: () => {
  return `Debug mode: ${(window as any).__DEBUG__ ?? 'not set'}`
}
```

**⚠️ handler 必须同步返回字符串。** 如果命令需要异步操作（如 fetch），需要额外机制（参见 5.6）。

### 5.2 修改回显策略

```typescript
// TerminalBar.tsx L82
const echoStrategy: EchoStrategy = 'line-by-line'
// 可选：'direct' | 'line-by-line' | 'char-by-char'
```

**各策略适用场景：**

| 策略 | 适用 | 不适用 |
|------|------|--------|
| `direct` | 短输出（1-2 行），如 `debug` | 长输出，缺乏终端感 |
| `line-by-line` | **默认**，类终端体验，中等输出 | 需要逐字符动画感 |
| `char-by-char` | 模拟远程登录延迟，短输出 | 长输出等待时间过长 |

### 5.3 自定义回显动画参数

```typescript
// TerminalBar.tsx L83-86
const { play: _playEcho, cancel: cancelEcho } = useEchoSequence(
  appendEcho, setEchoLine,
  {
    strategy: echoStrategy,
    growDelay: 0.25,          // 可改为 0（立即替换）
    lineDelay: 100,           // 添加此行：逐行延迟 100ms
    charInterval: 15,         // 添加此行：逐字符延迟 15ms
    onLineRevealed: handleLineRevealed,
  },
)
```

### 5.4 调整 Liquid Glass 视觉效果

修改 `TerminalBar.css`：

```css
/* 更透明 — 降低 background alpha */
.terminal-bar-inner {
  background: linear-gradient(
    135deg,
    rgba(15, 25, 45, 0.30),   /* 0.50 → 0.30 */
    rgba(20, 35, 55, 0.25)    /* 0.45 → 0.25 */
  );
}

/* 更模糊 — 增大 blur */
.terminal-bar-inner {
  backdrop-filter: blur(40px) saturate(180%);  /* 20px → 40px */
}

/* 更强边框 — 增大 border alpha */
.terminal-bar-inner {
  border: 1px solid rgba(100, 180, 255, 0.30);  /* 0.18 → 0.30 */
}

/* 更强光泽 — 增大 ::before 渐变 alpha */
.terminal-bar-inner::before {
  background:
    radial-gradient(ellipse at 25% 15%, rgba(80, 150, 255, 0.20), transparent 50%),
    /* ... 增大其他层的 alpha */
}
```

### 5.5 复用 Scrollable 组件

`Scrollable` 是通用组件，可在项目其他位置复用：

```tsx
import Scrollable, { type ScrollableHandle, type ScrollOverlayState } from './terminal/Scrollable'

function ChatPanel() {
  const scrollRef = useRef<ScrollableHandle>(null)
  const [msgCount, setMsgCount] = useState(0)

  const renderOverlay = useCallback(({ canScrollDown }: ScrollOverlayState) => (
    canScrollDown && (
      <button
        className="new-message-indicator"
        onClick={() => scrollRef.current?.scrollToBottom()}
      >
        ↓ New messages
      </button>
    )
  ), [])

  return (
    <Scrollable
      ref={scrollRef}
      scrollable={true}
      maxHeight="400px"
      overlay={renderOverlay}
      autoScrollKey={msgCount}     // 新消息 → 自动滚底
    >
      {messages.map(m => <Message key={m.id} {...m} />)}
    </Scrollable>
  )
}
```

**暴露的命令式 API：**

```typescript
scrollRef.current?.scrollBy({ top: 100, behavior: 'smooth' })
scrollRef.current?.scrollToBottom()
const lh = scrollRef.current?.getLineHeight()      // 首次调用读取 CSS，后续缓存
const el = scrollRef.current?.getScrollElement()    // 原生 DOM 引用
```

### 5.6 添加异步命令

当前 `Command.handler` 是同步的。如需支持异步（如 API 请求），需扩展架构：

```typescript
// 方案：修改 Command 接口 + TerminalBar 处理逻辑

// 1. 扩展 commands.ts
interface Command {
  name: string
  aliases?: string[]
  description: string
  handler: () => string | Promise<string>  // 允许 async
}

// 2. TerminalBar handleKeyDown 中
const output = await executeCommand(trimmed)  // 改为 await
// ... 其余逻辑不变
```

### 5.7 迁移 App.tsx 使用 useTerminalActivation

当前 `App.tsx` 第 154-165 行内联了 `/` 键监听。`useTerminalActivation` hook 已就绪，迁移步骤：

```tsx
// App.tsx
import { useTerminalActivation } from './terminal/useTerminalActivation'

export default function App() {
  const { onKeyDown, isActive, activate } = useTerminalActivation()

  // 替换现有的 keydown 监听
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  // 替换现有的 isTerminalActive 派生逻辑
  const onWheel = (e: WheelEvent) => {
    if (isActive) return
    // ...
  }
}
```

迁移后可删除 App.tsx 中的 `terminalMode` 直接访问和 `subscribe`。

### 5.8 添加命令历史

当前版本不支持 ↑↓ 回溯历史命令。实现方案：

1. 在 `scrollStore.ts` Terminal slice 中添加 `commandHistory: string[]` 和 `historyIndex: number`
2. 在 `TerminalBar.handleKeyDown` 的 `ArrowUp` / `ArrowDown` 分支中（当前用于滚动回显区），增加 active 且无内容溢出时的历史回溯逻辑：

```typescript
if (e.key === 'ArrowUp') {
  // 如果回显区可滚动，优先滚动回显区
  // 否则回溯历史命令
  const history = useScrollStore.getState().commandHistory
  if (history.length > 0 && !canScrollUp) {
    // 显示上一条历史命令
  }
}
```

---

## 6. 已知问题与注意事项

### 6.1 useTerminalActivation 已集成

**状态：** ✅ 已迁移——App.tsx 现在通过 `useTerminalActivation()` 获取 `onKeyDown` 和 `isActive`，不再内联 `/` 键逻辑或手动 subscribe terminalMode。

### 6.2 TerminalBar.tsx 代码量较大

**状态：** 单个文件约 430 行，包含渲染、动画、颜色插值、状态行管理等。

**影响：** 新增功能时文件持续膨胀。

**可能的拆分方案：**

```
TerminalBar.tsx          ← 保留主组件 + 渲染
useTerminalColors.ts     ← 提取颜色插值逻辑
useHeightAnimation.ts    ← 提取高度动画逻辑
useStatusLine.ts         ← 提取状态行更新逻辑
```

**决策：** 当前保持单文件，待行数超过 500 或复杂度显著增加时拆分。过早拆分会导致 prop drilling 或过多的 store 依赖。

### 6.3 状态行查找效率

`TerminalBar.tsx:153-159` 的状态行查找使用线性扫描 (`findLastIndex` 等价逻辑)。如果 `echoLines` 极大（>1000 行），这可能成为性能瓶颈。

**缓解措施：** 使用 `statusLineIdx` ref 缓存上次位置，大部分情况下 O(1) 命中。仅在缓存失效时回退到线性扫描。

### 6.4 高度动画的连续增长

当回显动画逐行替换时，每次 `setEchoLine` 都创建新数组（`[...lines]`），触发 `useLayoutEffect`。连续增长通过 `animatingRef` 合并，但逻辑较复杂。如果未来出现高度动画异常，首先检查 `animatingRef.current` 的状态。

### 6.5 CSS transition 与高度计算的同步

高度动画依赖 `el.offsetHeight`（强制重排）来触发 CSS transition：

```typescript
el.style.height = oldH + 'px'     // 设置起始高度
el.style.transition = '...'
el.offsetHeight                    // 强制重排 — 不可删除
el.style.height = newH + 'px'     // 设置目标高度 → 触发 transition
```

移除 `el.offsetHeight` 这行会导致起始高度和目标高度在同一帧设置，transition 不会触发。

### 6.6 Safari backdrop-filter 兼容性

Safari 需要 `-webkit-backdrop-filter` 前缀。当前 `TerminalBar.css` 中已包含此前缀。如需修改毛玻璃效果，确保同时更新标准属性和 `-webkit-` 前缀。

### 6.7 clear 命令的特殊处理

`clear` 命令**不**经过 `useEchoSequence` 动画，而是直接构建完整数组并调用 `onEchoLinesChange`：

```typescript
if (trimmed === 'clear' || trimmed === 'cls') {
  const statusLine = props.buildStatusLine?.(props.scrollProgress ?? 0)
  const lines = statusLine ? [welcomeText, statusLine] : [welcomeText]
  props.onEchoLinesChange?.(lines)
  return
}
```

**三个关键设计点：**

1. **保持 mode 不变：** 不调用 `setMode('idle')`，终端保持 active——用户可继续输入
2. **一次构建完整数组：** 欢迎文本 + 状态行在同一个 `onEchoLinesChange` 调用中完成，避免分步更新
3. **分步更新的陷阱：** 若先设 `[welcomeText]` 再在 `useEffect` 中 `appendEcho`，React 的 `useLayoutEffect` 嵌套同步 re-render 会产生残留回调——正确的高动画被残留回调覆盖

### 6.8 useLayoutEffect 与嵌套同步 re-render 陷阱

在 TerminalBar 中，`useAnimateHeight` 内部使用 `useLayoutEffect` 管理 CSS transition。如果在同一个 commit 阶段的其他 `useLayoutEffect` 中触发状态更新（如 `appendEcho`），React 会同步处理新 render，但**原始 render 的剩余 `useLayoutEffect` 回调仍会以旧 state 执行**。这会导致：

- `useAnimateHeight` 先为同步 render 正确设置 transition
- 再被原始 render 的残留 `useLayoutEffect` 用旧 state 覆盖

**教训：** 避免在 `useLayoutEffect` 中触发会影响同一动画目标的状态更新。需要同步更新时，应在事件处理器中一次构建最终状态（参考 §6.7 的 `clear` 处理），而非依赖 effect 链。

### 6.9 类型导入路径

`ScrollableHandle` 和 `ScrollOverlayState` 类型定义在 `Scrollable.tsx` 中，需从同一文件导入：

```typescript
import Scrollable from './Scrollable'
import type { ScrollableHandle, ScrollOverlayState } from './Scrollable'
```

不要从其他文件重新导出这些类型。

### 6.10 调试记录索引

关键 bug 的详细排查过程记录在 `docs/dev-blog/` 中：

| 文件 | 内容 |
|------|------|
| `react-effect-timing-traps.md` | `useLayoutEffect` 残留回调覆盖动画；`setTypewriterDone` 同步调用导致 `clearTimeout` 杀死 timer |
| `slot-orchestration-debug.md` | Slot 轮询失效（pollRef Map 残留）、rolling 丢行（缓冲区未累积）、滚动闪烁（sub-pixel checkScroll） |
| `tone-mapping-debug.md` | R3F ACES 色调映射导致颜色偏差 |
| `instanced-mesh-shader-compile.md` | InstancedMesh2 `setColorAt` 后需 `materialsNeedsUpdate()` |
| `scene-graph-visibility.md` | DustField 嵌套在 Act1 group 内导致跨 Act 不可见 |
| `matrix-compose-quaternion-nan.md` | 非 THREE.Quaternion 对象导致 Matrix4.compose 产生 NaN |

---

## 7. 调试指南

### 7.1 浏览器 DevTools 断点位置

| 调试目标 | 文件 | 断点位置 |
|----------|------|----------|
| 终端激活流程 | `TerminalBar.tsx` | `handleBarClick` 第 246 行 |
| 命令执行 | `TerminalBar.tsx` | `handleKeyDown` 的 `Enter` 分支，第 265 行 |
| 回显动画开始 | `TerminalBar.tsx` | `playEcho` 调用，第 278 行 |
| 高度动画触发 | `TerminalBar.tsx` | `useLayoutEffect` 第 181 行 |
| 颜色插值更新 | `TerminalBar.tsx` | `update()` 第 97 行 |
| 状态行更新 | `TerminalBar.tsx` | subscribe 回调内 `update()` 第 148 行 |
| 打字机进度 | `useTypewriter.ts` | `schedule` 内 `setDisplayedText` 第 35 行 |
| 回显逐行替换 | `useEchoSequence.ts` | Phase 2 `setEchoLine` 第 56/64/76 行 |
| 命令匹配 | `commands.ts` | `executeCommand` 第 64 行 |
| / 键激活 | `useTerminalActivation.ts` | `onKeyDown` 第 49 行 |
| 滚动状态检测 | `Scrollable.tsx` | `checkScroll` 第 76 行 |

### 7.2 Console 调试命令

```js
// 查看当前 terminal 状态
window.__ZUSTAND_STORE__  // 如果暴露了 store

// 或者通过 React DevTools → Components → TerminalBar → hooks 查看

// 直接操作 store（需在模块作用域访问）
// 在 src/stores/scrollStore.ts 中添加：
if (typeof window !== 'undefined') (window as any).__store = useScrollStore

// 然后可以在 Console 中：
__store.getState().terminalMode       // 'typing' | 'idle' | 'active'
__store.getState().echoLines          // string[]
__store.setState({ terminalMode: 'idle' })  // 手动切换状态
```

### 7.3 常见调试场景

**场景 1：终端无法激活**

```
1. 检查 terminalMode 当前值：__store.getState().terminalMode
2. 如果是 'typing' → typewriterDone 是否为 true
3. 检查 / 键事件是否被拦截：在 handleKeyDown 打断点
4. 检查 App.tsx 中 / 键逻辑（第 154-165 行）
```

**场景 2：命令执行无输出**

```
1. 在 executeCommand() 打断点，确认返回值
2. 检查 useEchoSequence 的 play() 是否被调用
3. 检查 echoPlayingRef.current 是否为 true（被之前的动画阻塞）
4. 确认 cancelledRef 是否为 true（动画被取消）
```

**场景 3：高度动画异常（不增长/不收缩）**

```
1. 在 useLayoutEffect 第 181 行打断点
2. 检查 prev（prevLineCount.current）和 curr（echoLines.length）
3. 检查 oldH（prevHeightRef.current）和 newH（el.scrollHeight）
4. 确认 animatingRef.current 的状态
5. 检查 CSS transition 是否正确设置
```

**场景 4：颜色不变化**

```
1. 确认 scrollProgress 在 0.40-0.55 范围内
2. 检查 barInnerRef.current 是否存在
3. 在 update() 函数内打断点，确认 t 值
4. 检查 TerminalBar.css 中对应元素是否引用了 var(--tw-*)
```

**场景 5：▲/▼ 指示器不显示**

```
1. 确认回显区内容超出 maxHeight（> 5 行 = `calc(5 * 1.6em)`）
2. 确认 terminalMode === 'active'（scrollable=true 仅 active 时）
3. 在 Scrollable.checkScroll 打断点，确认 canScrollUp / canScrollDown 值
```

### 7.4 调试 CSS 动画

```css
/* 临时减慢动画以便观察 */
.terminal-bar-inner * {
  transition-duration: 2s !important;  /* 所有 CSS transition 变为 2s */
}

/* 或者在 DevTools → Elements → Computed 中查看 transition 属性 */
```

---

## 8. 测试指南

### 8.1 测试文件概览

| 文件 | 用例数 | 测试对象 | 运行环境 |
|------|:---:|------|:---:|
| `commands.test.ts` | 7 | 命令注册、执行、别名、未知命令 | node |
| `useTypewriter.test.ts` | 5 | 打字机延迟、逐字输出、清理 | node (vi.advanceTimers) |
| `Scrollable.test.tsx` | 7 | 渲染、scrollable class、overlay、ref API | jsdom |
| `useTerminalActivation.test.ts` | 7 | 激活逻辑、/ 键、稳定引用 | jsdom |

### 8.2 运行测试

```bash
pnpm test                              # 全部测试
pnpm vitest run src/terminal           # 仅 terminal 模块
pnpm vitest run --reporter=verbose     # 详细输出
pnpm vitest --watch                    # 监听模式
```

### 8.3 测试模式参考

**纯逻辑测试（commands.test.ts）：**

```typescript
import { describe, it, expect } from 'vitest'
import { executeCommand, commandRegistry } from '../commands'

describe('executeCommand', () => {
  it('should return help output for "help"', () => {
    const result = executeCommand('help')
    expect(result).toContain('Available commands')
  })

  it('should match aliases', () => {
    expect(executeCommand('light')).toContain('switched to day mode')
    expect(executeCommand('dark')).toContain('switched to night mode')
  })
})
```

**Hook 测试（useTypewriter.test.ts）：**

```typescript
import { renderHook, act } from '@testing-library/react'
import { useTypewriter } from '../useTypewriter'

it('should type characters sequentially', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() =>
    useTypewriter({ echoText: 'Hi' })
  )

  act(() => vi.advanceTimersByTime(800 + 40)) // startDelay + 1 char
  expect(result.current.displayedText).toBe('H')

  act(() => vi.advanceTimersByTime(40))
  expect(result.current.displayedText).toBe('Hi')
  expect(result.current.isDone).toBe(true)
})
```

**组件测试（Scrollable.test.tsx）：**

```typescript
import { render, screen } from '@testing-library/react'
import Scrollable from '../Scrollable'

it('should render children', () => {
  render(
    <Scrollable scrollable maxHeight="100px">
      <div>test content</div>
    </Scrollable>
  )
  expect(screen.getByText('test content')).toBeDefined()
})
```

### 8.4 添加新测试

添加新功能后，建议在对应的 `__tests__/` 文件中添加测试：

- **新命令** → `commands.test.ts`
- **新 hook** → 新建 `__tests__/useNewHook.test.ts`
- **Scrollable 新功能** → `Scrollable.test.tsx`
- **TerminalBar 新功能** → 当前无 TerminalBar 组件测试（依赖 Zustand store 和 DOM 交互复杂），建议先通过手动验证清单确认

### 8.5 测试配置

确保 `vitest.config.ts` 中包含必要的配置：

```typescript
// vitest 配置关键项
{
  environment: 'jsdom',         // Scrollable / useTerminalActivation 测试需要
  globals: true,                // 使 describe/it/expect 全局可用
  setupFiles: ['./vitest.setup.ts'],  // 如有 setup 文件
}
```

---

## 附录

### A. 相关文档

| 文档 | 位置 | 内容 |
|------|------|------|
| 技术规格 | [`specification.md`](./specification.md) | 架构、API、设计决策 |
| 操作手册 | [`operation-guide.md`](./operation-guide.md) | 用户使用指南 |
| v2 设计文档 | `docs/superpowers/specs/2026-06-13-terminal-bar-v2-design.md` | 原始设计规格 |
| v1 设计文档 | `docs/superpowers/specs/2026-06-13-terminal-cli-bar-design.md` | v1 设计参考 |
| v2 手册（旧版） | `docs/terminal-bar-v2-manual.md` | 前一版综合手册 |

### B. 关键常量和默认值速查

| 常量 | 文件 | 默认值 | 说明 |
|------|------|:---:|------|
| `DEFAULTS.text.welcomeText` | TerminalBar.tsx | `'# YeQuDesu · Personal Site · ready'` | 欢迎信息（可通过 props 覆盖） |
| `DEFAULTS.layout.maxEchoLines` | TerminalBar.tsx | `5` | 最大可见行数（可通过 props 覆盖） |
| `DEFAULTS.animation.heightAnimPerLine` | TerminalBar.tsx | `0.15` | 高度动画速度（可通过 props 覆盖） |
| `ECHO_GROW_DELAY` | TerminalBar.tsx | `0.25` | 回显占位延迟（s） |
| `startDelay` | useTypewriter | `800` | 打字机启动延迟（ms） |
| `charInterval` | useTypewriter | `40` | 打字机字符间隔（ms） |
| `lineDelay` | useEchoSequence | `60` | 回显逐行延迟（ms） |
| `charInterval` | useEchoSequence | `25` | 回显逐字符延迟（ms） |
| `growDelay` | useEchoSequence | `0.25` | 回显占位→替换延迟（s） |
| 颜色插值起点 | TerminalBar.tsx | `sp = 0.40` | 白化开始 |
| 颜色插值终点 | TerminalBar.tsx | `sp = 0.55` | 白化完成 |
| `font-size` | TerminalBar.css | `0.68rem` | 终端文字大小 |
| `backdrop-filter` | TerminalBar.css | `blur(20px) saturate(180%)` | 毛玻璃参数 |
| `border-radius` | TerminalBar.css | `12px` | 面板圆角 |
