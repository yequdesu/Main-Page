# Terminal CLI Bar 设计文档

> 日期：2026-06-13
> 状态：设计完成，待实施

## 一、需求概述

在页面底部实现一个 terminal 风格的交互式 CLI 输入框（bar）。既是视觉氛围元素，也是功能入口。

### 核心交互

| 特性 | 描述 |
|------|------|
| 激活方式 | 按 `/` 键激活输入（类似 VS Code command palette） |
| 未激活态 | 显示动态状态信息 + dim 光标 `▎` 在行首 + placeholder 提示 |
| 已激活态 | 用户输入 + 亮色闪烁光标 `█`，placeholder 消失 |
| 初始加载 | 回显区以 typewriter 逐字打印效果出现，打字期间输入行隐藏 |
| 退出激活 | Esc / 失焦 → 回到 idle 态 |

### 初始命令

| 命令 | 功能 |
|------|------|
| `help` | 列出所有可用命令及说明 |
| `debug` | 切换 debug 模式（开启/关闭调试信息显示） |
| `day` / `night` | 切换日间/夜间显示模式 |

命令通过注册表模式实现，后续可扩展。

---

## 二、方案评估

### 方案 A：纯自建（采纳）

基于项目现有 Zustand + React state 从零构建。命令注册表模式，Unicode 块字符光标，typewriter 用 `setTimeout`/`requestAnimationFrame` 驱动。

- **Pros**：零依赖，~200 行覆盖全部需求；完全控制双模式切换行为；typewriter、光标、CSS 过渡精调无限制；命令注册表天然可扩展；与项目 Zustand + useFrame 模式一致
- **Cons**：需自行处理键盘事件、command history、accessibility

### 方案 B：cmdk 做命令引擎（备选）

[cmdk](https://github.com/pacocoursey/cmdk)（~6KB, 9.1k⭐）提供命令过滤、键盘导航、列表虚拟化。自建终端 UI 皮肤覆盖其上。

- **Pros**：命令过滤、键盘导航、WAI-ARIA 开箱即用
- **Cons**：设计为浮动 Dialog，改造为固定底部 bar 需大量样式覆盖；无法原生支持"未激活显示状态信息"的双模式；typewriter、光标切换仍需自建；对初始 3 个命令来说过重

### 方案 C：终端模拟器库（备选）

如 [@zqui/react-terminal](https://www.npmjs.com/package/@zqui/react-terminal)（~196KB），自带主题、文件系统模拟。

- **Pros**：开箱即用的终端视觉（7+ 主题），内建命令系统
- **Cons**：196KB 严重过度引入；文件系统模拟等全部用不到；定制双模式行为需 fork 内部逻辑

**决策**：采纳方案 A。当未来需求超出方案 A 能力范围（如需要 PTY、ANSI 转义序列、大量命令的 fuzzy search）时，可参考方案 B 或 C 进行升级。

---

## 三、架构设计

### 3.1 文件结构

```
src/terminal/
├── TerminalBar.tsx      # 固定底部 bar，回显区 + 输入行，键盘事件
├── commands.ts           # 命令注册表 + 执行器
└── useTypewriter.ts     # 逐字打印 hook

src/stores/scrollStore.ts # 新增 TerminalSlice
```

### 3.2 状态机

```
        页面加载
           │
           ▼
       ┌───────┐  typewriter 完成  ┌──────┐  / 键  ┌────────┐
       │typing │ ───────────────→ │ idle │ ─────→ │ active │
       └───────┘                  └──────┘        └────────┘
                                      ↑                │
                                      │   Esc / 失焦    │
                                      └────────────────┘
```

| 状态 | 触发 | 回显区 | 输入行 | 光标 |
|------|------|--------|--------|------|
| `typing` | 页面加载 | 逐字打印 + 行尾 `█` 闪烁 | **隐藏** | 回显行尾 `█` |
| `idle` | typewriter 完成 / Esc | 静态文字 + 实时更新 | `$▎` + placeholder | `▎` dim 不闪 |
| `active` | `/` 键 | 静态 + 命令输出追加 | `$` + 用户输入 + `█` | `█` 亮 + 闪烁 |

### 3.3 光标方案

使用 Unicode 块字符代替 CSS 绘制的 span，天然坐落在字体 baseline 上：

| 状态 | 字符 | Unicode | 样式 |
|------|------|---------|------|
| 未激活 | `▎` | U+258E (1/4 宽) | dim 不闪烁 |
| 激活 | `█` | U+2588 (全宽) | 亮色 + `opacity` 步进闪烁 (1s step-end) |
| 打字中 | `█` | U+2588 (全宽) | 回显行尾闪烁 |

### 3.4 Typewriter Hook

```typescript
// useTypewriter.ts
interface TypewriterConfig {
  startDelay: number    // 页面加载后延迟，默认 800ms
  charInterval: number  // 字符间隔，默认 40ms
  echoText: string      // 要打印的文本
}

function useTypewriter(config: TypewriterConfig): {
  displayedText: string       // 当前已显示的字符
  isTyping: boolean           // 是否正在打字中
  isDone: boolean             // 是否已完成
}
```

- 使用 `setTimeout` 链式调度逐个字符
- `startDelay` 后打出第一个字符，之后每 `charInterval` 打一个
- 组件卸载时清除 timer，防止内存泄漏

### 3.5 命令注册表

```typescript
// commands.ts
export interface Command {
  name: string
  aliases?: string[]
  description: string
  handler: () => string | void  // 返回输出文本追加到回显区
}

export const commandRegistry: Command[] = [
  { name: 'help',    description: 'Show available commands', handler: ... },
  { name: 'debug',   description: 'Toggle debug mode',      handler: ... },
  { name: 'day',     aliases: ['light'], description: ... },
  { name: 'night',   aliases: ['dark'],  description: ... },
]

export function executeCommand(input: string): string
```

`executeCommand` 做 trim + 精确匹配（含别名），未匹配返回 `"command not found: xxx"`。

### 3.6 Zustand TerminalSlice

在 `scrollStore.ts` 中新增：

```typescript
type TerminalMode = 'typing' | 'idle' | 'active'

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
  setTypewriterDone: (done: boolean) => void
}
```

### 3.7 组件结构

```
TerminalBar
├── <div.terminal-bar>          ← position: fixed; bottom: 2rem; z-index: 15
│   ├── <div.echo-area>         ← 回显区，左对齐，monospace
│   │   ├── echoLines[0]        ← 打字时逐字增长
│   │   ├── echoLines[1..n]     ← 命令输出追加行
│   │   └── <cursor-typing>     ← 仅 typing 态 + 未完成时显示
│   └── <div.input-line>        ← typing 态隐藏，idle/active 态可见
│       ├── <span.prompt>$</span>
│       ├── <span.cursor>       ← idle: ▎ dim | active: █ blink
│       ├── <span.placeholder>  ← 仅 idle 态 + inputValue 为空
│       └── <span.input-text>   ← 仅 active 态 + inputValue 非空
```

### 3.8 CSS 定位

```
z-index 层级：
  20 — footer
  15 — TerminalBar          ← 新增
  10 — brand-text
   5 — scroll-hint / focus-overlay
```

Bar 采用 `position: fixed; bottom: 2rem; left: 0; right: 0`，半透明深色背景 + `backdrop-filter: blur()`，与现有 DOM 叠加层风格一致。

---

## 四、集成方案

### 4.1 App.tsx

```tsx
// 挂载（与 brand-text、footer 同级，Canvas 外部）
<TerminalBar />

// keydown 监听扩展
// 当 key === '/' 且 terminalMode === 'idle' 且非输入元素聚焦时：
//   e.preventDefault()
//   setTerminalMode('active')

// 当 terminalMode === 'active' 时：
//   阻止滚轮事件（类似 isAct3Focused 逻辑）
//   阻止点击快进
```

### 4.2 回显内容更新

`TerminalBar` 内部通过 `useEffect` 订阅 `scrollProgress` 变化，更新 `echoLines[0]`：

```
# Act 1 · OceanVoyage · scroll 34% · 58 fps
```

回显格式可通过组件 prop 或配置对象自定义。

### 4.3 Debug 模式

`debug` 命令切换时，可设置：
- `window.__DEBUG__` 全局标志
- 或 Zustand 专用 debug slice
- 或直接操作 body class 触发额外 UI 元素

具体调试功能由后续需求定义，本次仅建立开关机制。

---

## 五、测试策略

| 层级 | 内容 | 方式 |
|------|------|------|
| L1 纯函数 | `executeCommand` 匹配/未匹配/别名 | Vitest |
| L1 纯函数 | `useTypewriter` 逻辑（timer 序列） | Vitest + vi.useFakeTimers |
| L2 场景图 | TerminalBar 三态渲染 | @react-three/test-renderer 或 React Testing Library |
| L2 交互 | `/` 激活 → 输入 → Enter 执行 → 输出追加 | 集成测试 |

---

## 六、约束与注意事项

1. 方案 A 为首选；若未来需求超出其能力范围，可迁移至方案 B 或 C
2. 命令注册表保持纯数据，不依赖 React 上下文
3. Typewriter timer 必须在组件卸载时清理
4. `TerminalBar` 为纯 DOM 组件，不挂载到 R3F Canvas 内
5. active 态时必须防止页面滚轮和点击快进（复用 `isAct3Focused` 模式）
6. monospace 字体栈：`'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace`
