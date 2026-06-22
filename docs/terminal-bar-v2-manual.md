# Terminal Bar v2 — 操作手册、说明与维护指南

> 版本：v2  
> 日期：2026-06-13  
> 设计文档：`docs/superpowers/specs/2026-06-13-terminal-bar-v2-design.md`  
> v1 设计：`docs/superpowers/specs/2026-06-13-terminal-cli-bar-design.md`

---

## 目录

1. [架构概述](#1-架构概述)
2. [组件 API 参考](#2-组件-api-参考)
3. [Scrollable 通用组件](#3-scrollable-通用组件)
4. [useTerminalActivation Hook](#4-useterminalactivation-hook)
5. [Liquid Glass 视觉系统](#5-liquid-glass-视觉系统)
6. [操作手册](#6-操作手册)
7. [维护指南](#7-维护指南)
8. [扩展指南](#8-扩展指南)
9. [常见问题](#9-常见问题)

---

## 1. 架构概述

### 1.1 文件结构

```
src/terminal/
├── TerminalBar.tsx           # 主组件 — fixed 底部 bar，回显区 + 输入行
├── TerminalBar.css           # 样式 — liquid glass + overlay arrows + input line
├── Scrollable.tsx            # 通用滚动容器 + overlay slot（可复用）
├── Scrollable.css            # 滚动容器样式
├── useTerminalActivation.ts  # focus 激活 hook — 导出给 App.tsx 使用
├── useTypewriter.ts          # 逐字打印 hook（v1 保留）
├── commands.ts               # 命令注册表 + 执行器（v1 保留）
└── __tests__/
    ├── commands.test.ts
    ├── useTypewriter.test.ts
    ├── Scrollable.test.tsx
    └── useTerminalActivation.test.ts
```

### 1.2 组件树

```
App.tsx
  └─ useTerminalActivation()        ← hook: { onKeyDown, isActive }
       onKeyDown → window keydown   ← / 键激活
       isActive  → guard wheel/click ← 终端活跃时阻止页面滚动

TerminalBar
  ├─ <div.terminal-bar-inner>       ← liquid glass + onClick→focus
  │   ├─ <Scrollable>               ← 通用滚动容器
  │   │   ├─ <div.scrollable-content> ← overflow 控制
  │   │   │   └─ <div.terminal-echo>  ← 回显区内容
  │   │   └─ <div.scrollable-overlay> ← absolute 覆盖层（pointer-events: none）
  │   │       └─ overlay() => ▲/▼     ← flex space-between 定位
  │   └─ <div.input-line>           ← 输入行（CSS transition 显隐）
  │       ├─ prompt / cursor / placeholder
  │       └─ <input hidden>         ← 捕获键盘
```

### 1.3 数据流

```
                  ┌──────────────────────┐
                  │    Zustand Store      │
                  │  terminalMode         │
                  │  echoLines[]          │
                  │  inputValue           │
                  │  typewriterDone       │
                  └──────┬───────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
useTerminalActivation  TerminalBar          Scrollable
  onKeyDown('/')        onClick→focus        scrollable={isActive}
  isActive              overlay render       onScroll→checkScroll
  activate()            auto-scroll          scrollToBottom()
```

### 1.4 状态机

```
        页面加载
           │
           ▼
       ┌───────┐  typewriter 完成  ┌──────┐  / 键 / click  ┌────────┐
       │typing │ ───────────────→ │ idle │ ──────────────→ │ active │
       └───────┘                  └──────┘                 └────────┘
                                      ↑                         │
                                      │      Esc / 失焦         │
                                      └─────────────────────────┘
```

---

## 2. 组件 API 参考

### 2.1 TerminalBar

```typescript
// 无 props — 所有状态来自 Zustand store
export default function TerminalBar()
```

**职责**：
- 渲染 terminal bar UI（回显区 + 输入行）
- 管理三态切换（typing → idle → active）
- 内置 click-to-focus（点击 bar 任意位置激活）
- 键盘处理（Enter 执行命令，ArrowUp/Down 滚动，Escape 退出）
- 动态颜色插值（随页面 scroll 白化）

**依赖**：
- `useScrollStore` — terminalMode, echoLines, inputValue, typewriterDone
- `useTypewriter` — 逐字打印动画
- `Scrollable` — 回显区滚动容器
- `executeCommand` — 命令执行

### 2.2 commands.ts

```typescript
interface Command {
  name: string
  aliases?: string[]
  description: string
  handler: () => string
}

const commandRegistry: Command[]

function executeCommand(input: string): string
```

---

## 3. Scrollable 通用组件

### 3.1 设计动机

v1 中，滚动指示器（▲/▼）内嵌于 `.terminal-echo` 内，使用 `position: sticky` + `float: right` + `height: 0` 的复杂 CSS Hack。该方案存在浏览器兼容性和布局不稳定性。

v2 采用**分层架构**：滚动容器（viewport）与指示器（overlay）完全解耦。

### 3.2 接口

```typescript
interface ScrollableProps {
  /** 是否允许滚动（false → overflow: hidden，不捕获滚轮） */
  scrollable: boolean

  /** CSS max-height */
  maxHeight: string

  /** 滚动内容 */
  children: ReactNode

  /** overlay render prop — 声明式接收滚动状态 */
  overlay?: (state: ScrollOverlayState) => ReactNode

  /** 外部触发：值变化时自动滚到底部 */
  autoScrollKey?: number

  /** 滚动事件回调 */
  onScrollStateChange?: (state: ScrollOverlayState) => void

  /** 附加 className */
  className?: string
}

interface ScrollOverlayState {
  canScrollUp: boolean
  canScrollDown: boolean
}

// Ref 接口（命令式方法）
interface ScrollableHandle {
  scrollBy(options: { top: number; behavior?: ScrollBehavior }): void
  scrollToBottom(): void
  getLineHeight(): number
  getScrollElement(): HTMLDivElement | null
}
```

### 3.3 使用示例

```tsx
import Scrollable, { type ScrollableHandle, type ScrollOverlayState } from './Scrollable'

function MyComponent() {
  const ref = useRef<ScrollableHandle>(null)

  const overlay = useCallback(({ canScrollUp, canScrollDown }: ScrollOverlayState) => (
    <>
      {canScrollUp && <span className="arrow-up">▲</span>}
      {canScrollDown && <span className="arrow-down">▼</span>}
    </>
  ), [])

  return (
    <Scrollable
      ref={ref}
      scrollable={true}
      maxHeight="300px"
      overlay={overlay}
      autoScrollKey={messageCount}  // 新消息 → 自动滚底
    >
      {messages.map(m => <div key={m.id}>{m.text}</div>)}
    </Scrollable>
  )
}
```

### 3.4 实现原理

```
┌─ scrollable-wrapper (position: relative) ──────────┐
│                                                     │
│  ┌─ scrollable-content (overflow-y: auto/hidden) ─┐ │
│  │                                                  │ │
│  │  {children}                                      │ │
│  │                                                  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ scrollable-overlay (position: absolute) ───────┐ │
│  │  display: flex; flex-direction: column;          │ │
│  │  justify-content: space-between;                 │ │
│  │  pointer-events: none;                           │ │
│  │                                                  │ │
│  │  ┌─ ▲ (align-self: flex-end) ──────────────────┐ │ │
│  │  │  opacity toggle via .visible class           │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  │                    ...empty space...               │ │
│  │  ┌─ ▼ (align-self: flex-end) ──────────────────┐ │ │
│  │  │  opacity toggle via .visible class           │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**关键 CSS 属性**：
- `scrollable-wrapper`：`position: relative` — 为 overlay 建立定位上下文
- `scrollable-content`：`overflow: hidden` / `overflow-y: auto` — 由 `scrollable` prop 控制
- `scrollable-overlay`：`position: absolute; inset: 0` — 完全覆盖 content，`pointer-events: none` 保证点击穿透
- overlay 内部使用 `flex-direction: column; justify-content: space-between` — ▲ 吸顶、▼ 吸底

### 3.5 与 v1 的对比

| 维度 | v1 (sticky + float) | v2 (overlay 分层) |
|------|---------------------|--------------------|
| 定位方式 | `position: sticky; float: right; height: 0` | flex `space-between` + `align-self: flex-end` |
| 浏览器兼容 | sticky+float 语义冲突，不稳定 | 标准 flexbox，广泛兼容 |
| DOM 关系 | 箭头在滚动容器的子节点中 | 箭头在独立 overlay 层 |
| 可复用性 | 强耦合 TerminalBar | 通用 `<Scrollable>` 组件 |
| 自定义能力 | 仅能改 CSS | overlay render prop 可完全替换 |

---

## 4. useTerminalActivation Hook

### 4.1 设计动机

v1 中，App.tsx 直接调用 `useScrollStore.getState().setTerminalMode('active')` 和手动订阅 `terminalMode` 变化。这违反了封装原则 — App 不应知晓 terminal 内部状态管理。

v2 通过 hook 暴露声明式接口，App 无需触碰 `terminalMode`。

### 4.2 接口

```typescript
interface TerminalActivationAPI {
  /** 父组件 spread 到自己的 keydown handler */
  onKeyDown: (e: KeyboardEvent) => void

  /** 程序式激活（备用，如外部按钮触发） */
  activate: () => void

  /** terminal 是否处于 active 状态 */
  isActive: boolean
}

function useTerminalActivation(): TerminalActivationAPI
```

### 4.3 使用方式

```tsx
// App.tsx
import { useTerminalActivation } from './terminal/useTerminalActivation'

export default function App() {
  const { onKeyDown, isActive } = useTerminalActivation()

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])

  // 使用 isActive 替代手动 subscribe
  const onWheel = (e: WheelEvent) => {
    if (isActive) return  // terminal 活跃时阻止页面滚动
    // ...
  }
}
```

**调用方契约**：
1. 调用方负责将 `onKeyDown` 绑定到 `window.keydown`
2. 调用方使用 `isActive` 控制自身行为（wheel guard, click guard）
3. 调用方**不得**直接读写 `terminalMode`

---

## 5. Liquid Glass 视觉系统

### 5.1 设计语言

采用 **Vivid Glass** 风格 — 高对比度毛玻璃 + 蓝色调径向渐变光泽 + 内高光 + 多层光晕。

参考：Apple Vision Pro 玻璃材质设计语言。

### 5.2 CSS 实现

```css
.terminal-bar-inner {
  /* 半透明渐变基底 */
  background: linear-gradient(
    135deg,
    rgba(15, 25, 45, 0.50),
    rgba(20, 35, 55, 0.45)
  );

  /* 蓝色调边框 */
  border: 1px solid rgba(100, 180, 255, 0.18);

  /* 毛玻璃模糊 */
  backdrop-filter: blur(28px);

  /* 内高光 + 外阴影 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.10),
    0 8px 32px rgba(0, 0, 0, 0.20);
}

/* 多层径向渐变光晕（伪元素） */
.terminal-bar-inner::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 25% 15%, rgba(80, 150, 255, 0.12), transparent 50%),
    radial-gradient(ellipse at 75% 85%, rgba(60, 180, 240, 0.08), transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(120, 180, 255, 0.04), transparent 70%);
  border-radius: inherit;
}
```

### 5.3 动态颜色

CSS 变量 `--tw-*` 随页面 scroll 白化动态插值（smoothstep），由 `TerminalBar` 内 `useEffect` + `useScrollStore.subscribe` 驱动：

| 变量 | 暗色值 | 亮色值 | 用途 |
|------|--------|--------|------|
| `--tw-echo` | `#7c8aa0` | `#475569` | 回显文字 |
| `--tw-prefix` | `#64748b` | `#334155` | 回显前缀 |
| `--tw-prompt` | `#0ea5e9` | `#0369a1` | `$` 提示符 |
| `--tw-placeholder` | `rgba(255,255,255,0.15)` | `rgba(0,0,0,0.10)` | placeholder |
| `--tw-input` | `#e2e8f0` | `#1e293b` | 输入文字 |
| `--tw-cursor-bright` | `#e2e8f0` | `#1e293b` | 活跃光标 |
| `--tw-cursor-dim` | `#0ea5e9` | `#0369a1` | 非活跃光标 |

---

## 6. 操作手册

### 6.1 用户交互

| 操作 | 效果 |
|------|------|
| 页面加载 | typewriter 动画逐字打印状态行，约 2s 后进入 idle |
| 按 `/` | 激活 terminal（input 获取焦点，光标闪烁） |
| 点击 terminal bar | 同上（click-to-focus） |
| 输入命令 + Enter | 执行命令，输出追加到回显区 |
| ArrowUp / ArrowDown | 滚动回显区（行级粒度，仅 active 态） |
| Esc / 点击外部 | 退出 active → idle |

### 6.2 内置命令

| 命令 | 别名 | 效果 |
|------|------|------|
| `help` | — | 列出所有可用命令 |
| `debug` | — | 切换 `window.__DEBUG__` 标志 |
| `day` | `light` | 切换日间模式（添加 `.light` class） |
| `night` | `dark` | 切换夜间模式（添加 `.dark` class） |

### 6.3 idle 态状态行

idle 态回显区第一行实时更新页面状态：

```
# Act 1 · OceanVoyage · scroll 34%
```

格式：`# Act {N} · {ActName} · scroll {percent}%`，随页面滚动实时刷新。

### 6.4 迁移步骤

Sandbox 限制下，新文件以 V2 后缀创建。完成后执行迁移脚本：

```bash
bash .claude/migrate-to-v2.sh
pnpm dev   # 验证开发模式
pnpm test  # 验证测试
pnpm build # 验证生产构建
```

迁移脚本做了什么：
1. 备份 v1 文件（`.v1.bak` 后缀）
2. 将 V2 文件复制为正式文件名
3. 修复 import 路径
4. 清理 V2 临时文件

---

## 7. 维护指南

### 7.1 添加新命令

在 `src/terminal/commands.ts` 的 `commandRegistry` 数组中 push 新条目：

```typescript
{
  name: 'hello',
  aliases: ['hi'],
  description: 'Say hello',
  handler: () => 'Hello, world!',
}
```

无需修改任何其他文件。

### 7.2 自定义回显状态行

修改 `TerminalBar.tsx` 中的 `buildStatusLine` 函数：

```typescript
const buildStatusLine = useCallback(() => {
  const sp = useScrollStore.getState().scrollProgress
  // 自定义格式...
  return `custom format ${sp}`
}, [])
```

### 7.3 替换 Scrollable overlay

`Scrollable` 的 `overlay` prop 是 render prop，可完全替换指示器内容：

```tsx
<Scrollable
  overlay={({ canScrollUp, canScrollDown }) => (
    <div className="custom-scrollbar">
      <div className={`track ${canScrollUp ? 'active' : ''}`} />
      <div className={`track ${canScrollDown ? 'active' : ''}`} />
    </div>
  )}
>
```

### 7.4 调整 liquid glass 强度

修改 `TerminalBar.css` 中 `.terminal-bar-inner` 和 `::before` 的 rgba 值：

- **更透明**：降低 `background` rgba alpha（如 `0.50` → `0.30`）
- **更模糊**：增加 `backdrop-filter: blur()` 值（如 `28px` → `40px`）
- **更亮光泽**：增加 `::before` 径向渐变的 alpha
- **更强边框**：增加 `border` rgba alpha（如 `0.18` → `0.30`）

### 7.5 调试验证清单

每次修改后执行：

```bash
pnpm test          # 所有测试（含新增 Scrollable + useTerminalActivation）
pnpm build         # TypeScript 编译 + Vite bundle
pnpm dev           # 手动验证：
                   #   ✓ 页面加载 → typewriter 动画
                   #   ✓ 按 / 激活 → 光标闪烁
                   #   ✓ 输入 help → 输出命令列表
                   #   ✓ 输入 debug → 切换 debug 模式
                   #   ✓ ArrowUp/Down → 回显区滚动
                   #   ✓ ▲/▼ 指示器显示/隐藏
                   #   ✓ 点击 bar → 激活
                   #   ✓ Esc / 失焦 → 退出
                   #   ✓ 非 active 时页面滚轮正常
                   #   ✓ active 时页面滚轮被阻止
```

---

## 8. 扩展指南

### 8.1 Scrollable 复用场景

`Scrollable` 是通用组件，可在项目其他地方复用：

```tsx
// 聊天消息列表
<Scrollable
  scrollable={true}
  maxHeight="400px"
  overlay={({ canScrollDown }) => canScrollDown && <NewMessageIndicator />}
  autoScrollKey={messageCount}
>
  {messages.map(m => <ChatBubble key={m.id} {...m} />)}
</Scrollable>

// 代码预览
<Scrollable
  scrollable={true}
  maxHeight="200px"
  overlay={({ canScrollUp, canScrollDown }) => (
    <div className="line-numbers">
      {canScrollUp && <span>...more</span>}
    </div>
  )}
>
  <code>{codeContent}</code>
</Scrollable>
```

### 8.2 useTerminalActivation 扩展

若需要更多激活方式（如按钮），直接调用 `activate()`：

```tsx
const { activate, isActive } = useTerminalActivation()
return <button onClick={activate}>Open Terminal</button>
```

若需要快捷键更改（如 `/` → `Ctrl+K`），修改 hook 内部 `onKeyDown` 实现。

### 8.3 添加命令历史

在 Zustand store 中添加 `commandHistory: string[]`，在 `handleKeyDown` 中管理，通过 ArrowUp/ArrowDown 回溯。

---

## 9. 常见问题

### Q: Terminal bar 不响应点击？

确认 `.terminal-bar-inner` 设置了 `pointer-events: auto`（v2 默认启用）。

### Q: ▲/▼ 不显示？

- 确认回显区内容超出 `max-height`（需 > 6 行）
- 确认 terminal 处于 active 状态（仅 active 时 `scrollable=true`）
- 检查 `checkScroll()` 阈值（`> 0.5`，高分屏可能需要调整）

### Q: Liquid glass 效果不可见？

- 确认浏览器支持 `backdrop-filter`（Safari 需 `-webkit-backdrop-filter`）
- 确认 bar 下方有页面内容（玻璃需要背后有内容才能体现 blur 效果）

### Q: TypeScript 编译错误？

- 确认 `ScrollableHandle` 类型导入路径正确
- 确认 `useTerminalActivation` 返回类型匹配

### Q: 测试失败？

- `useTerminalActivation.test.ts` 需要在 `jsdom` 环境运行
- `Scrollable.test.tsx` 需要 `@testing-library/react`
- 确认 `vitest.config.ts` 中 `environment: 'jsdom'`
