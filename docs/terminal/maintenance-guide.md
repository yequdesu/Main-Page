# Terminal Bar — 维护指南

> 面向开发者的维护、调试与扩展指南。技术规格见 [`specification.md`](./specification.md)，操作手册见 [`operation-guide.md`](./operation-guide.md)。

---

## 目录

1. [代码地图](#1-代码地图)
2. [开发环境](#2-开发环境)
3. [架构详解](#3-架构详解)
4. [动画系统维护](#4-动画系统维护)
5. [扩展指南](#5-扩展指南)
6. [已知问题与注意事项](#6-已知问题与注意事项)
7. [调试指南](#7-调试指南)
8. [测试指南](#8-测试指南)

---

## 1. 代码地图

### 1.1 文件依赖关系

```
App.tsx
  ├── MainTerminal.tsx        ← MainPage 专属封装（布局/字体/welcome/status + / 键激活）
  │     └── TerminalBar.tsx   ← 纯抽象容器引擎（layout 必传，内容仅 Slot children）
  │           ├── useSlotOrchestration.ts  ← GSAP Timeline + echoLines 状态 + 轮询
  │           │     └── useTypewriterGate.ts ← typewriter 动画 + exitGap 延迟
  │           ├── useCommandSystem.ts      ← keyboard/blur 命令处理
  │           ├── useAnimateHeight.ts      ← CSS transition 高度动画
  │           ├── Scrollable.tsx           ← 通用滚动容器
  │           └── slots.tsx               ← Slot 类型定义 + collectSlots + Context
  ├── InfoPanelTerminal.tsx   ← 信息面板终端（Act 3 左上角）
  │     └── TerminalBar.tsx   (同上)
  ├── stores/
  │     ├── scrollStore.ts    ← Zustand — terminalMode / echoLines / inputValue
  │     └── realtimeStore.ts  ← Zustand — 行星/轨道/摄像机/debris 实时数据
  ├── actors/DustField.tsx    ← 发布摄像机 + debris 数据到 realtimeStore
  └── terminal/commands.ts    ← 命令注册（纯数据驱动）
```

**依赖方向：** 所有箭头指向被依赖方。`TerminalBar` 是唯一引擎，`MainTerminal` 和 `InfoPanelTerminal` 是对称的 thin wrapper。

### 1.2 修改影响范围

| 修改目标 | 可能影响 | 风险 |
|----------|----------|:---:|
| `commands.ts` — 添加命令 | 无（纯数据驱动） | 🟢 |
| `useTypewriterGate.ts` | typewriter 行为 + exitGap | 🟡 |
| `useAnimateHeight.ts` | 高度动画 + scroll 触发 | 🟡 |
| `useSlotOrchestration.ts` | GSAP timeline + 轮询 + echoLines 同步 | 🔴 |
| `slots.ts` — Slot 类型/collectSlots | 所有 TerminalBar 消费者 | 🔴 |
| `TerminalBar.tsx` — 渲染逻辑 | 用户可见 UI | 🔴 |
| `MainTerminal.tsx` / `InfoPanelTerminal.tsx` | 各自对应的终端实例 | 🟡 |
| `Scrollable.tsx` | 所有滚动容器 | 🟡 |
| `realtimeStore.ts` | InfoPanelTerminal 数据源 | 🟡 |

### 1.3 关键代码位置速查

| 需要修改... | 文件 | 关注点 |
|-------------|------|--------|
| 添加新命令 | `commands.ts` | `commandRegistry` 数组 |
| 改欢迎文本 | `MainTerminal.tsx` / `InfoPanelTerminal.tsx` | `Welcome` slot 的 `text` prop |
| 改 typewriter 速度 | `MainTerminal.tsx` / `InfoPanelTerminal.tsx` | `Welcome` slot 的 `charInterval` / `startDelay` |
| 改 exitGap | `Welcome` slot 的 `exitGap` prop | slot 配置，由 `useTypewriterGate` 消费 |
| 改最大可见行数 | `MainTerminal.tsx` / `InfoPanelTerminal.tsx` | `layout.maxEchoLines` |
| 改高度动画速度 | `TerminalBar` 的 `animation.heightAnimPerLine` prop | 消费方传入 |
| 改颜色 | `App.tsx` 的 `handleThemeUpdate` | 注入 `onThemeUpdate` |
| 改状态行格式 | `App.tsx` 的 `handleBuildStatusLine` | 注入 `buildStatusLine` |
| 改命令处理 | `useCommandSystem.ts` | `handleKeyDown` 逻辑 |
| 改激活键 | `MainTerminal.tsx` | `/` 键 keydown useEffect |
| 改 rolling 间隔 | `InfoPanelTerminal.tsx` | `ContentLine` slot 的 `rollingInterval` |
| 改布局/字体 | `MainTerminal.tsx` / `InfoPanelTerminal.tsx` | `layout` prop |
| 添加实时数据 | `realtimeStore.ts` + `DustField.tsx` | pub/sub 模式 |

---

## 2. 开发环境

### 2.1 启动

```bash
pnpm dev        # Vite → http://localhost:5173
pnpm test       # 全部测试 (34 tests)
pnpm build      # TypeScript + Vite 生产构建
```

### 2.2 快速验证

```
1. 页面加载 → typewriter 逐字显示 → exitGap 1.5s cursor 闪烁
2. 状态行出现 → 滚动页面 → 百分比实时更新
3. 按 / 或点击 → 终端激活
4. help → Enter → 命令输出逐行动画
5. ArrowUp/Down → 回显区滚动 + pinnedToBottom
6. Esc → 退出 active；clear → 清空回显区
7. Act 3 左上角 → InfoPanelTerminal 出现 → planets/orbits/rolling
8. 滚动到 Act 2 → 终端文字颜色平滑过渡
```

---

## 3. 架构详解

### 3.1 TerminalBar — 纯抽象容器引擎

TerminalBar 不提供任何身份/布局默认值。所有内容通过 Slot children（`Welcome` / `Section` / `ContentLine`）声明式进入。

```tsx
<TerminalBar
  layout={{ maxEchoLines: 5, maxWidth: '...', ... }}  // 必传
  state={{ mode, echoLines, inputValue, onModeChange, ... }}   // 受控状态
  commands={{ onCommand, onPlayEcho, onClearEcho }}            // 命令配置
>
  <TerminalBar.Welcome name="greeting" text="..." exitGap={1000} />
  <TerminalBar.Section name="status" getLines={...} appearAfter="welcome:greeting" />
</TerminalBar>
```

**数据流：**
```
Slot children → Slot.collectSlots() → TerminalSlot[]
    ↓
useSlotOrchestration(slots)
    ├── useTypewriterGate(welcomeSlot) → typewriterDone, displayedText
    ├── GSAP Timeline → activateSlot → writeSlotLines (rows: lineByLine / directly)
    ├── polling (status/rolling) → setInterval → writeSlotLines
    └── echoLines state → sync-out → onEchoLinesChange
    ↓
echoLines → TerminalBar 渲染
```

### 3.2 消费者对称性

| | MainTerminal | InfoPanelTerminal |
|---|---|---|
| 位置 | 底部居中 | Act 3 左上角 |
| 激活 | click + `/` 键 | click only |
| Welcome | "# YeQuDesu · Personal Site · ready" | "solar system:" |
| Slots | Welcome + Section(status) + Section(command) | Welcome + Section(planets) + ContentLine(rolling) |
| 数据源 | scrollStore (scrollProgress) | realtimeStore (行星/轨道/摄像机) |

### 3.3 状态管理

```
Zustand scrollStore
  ├─ terminalMode: 'typing' | 'idle' | 'active'
  ├─ echoLines: string[]        ← useSlotOrchestration sync-out 写入
  └─ inputValue: string

Zustand realtimeStore
  ├─ planetCoords / planetSpeeds / planetAngles
  ├─ orbitSpeeds / orbitAngles
  ├─ camera (pos / look / fov)
  └─ debrisCount

React useState (TerminalBar 内部)
  ├─ mode / inputValue (受控 or 内部)
  └─ hasFocus

React useState (MainTerminal)
  ├─ commandLines / commandVer
  └─ echoScrollKey (autoScrollKey)
```

---

## 4. 动画系统维护

### 4.1 Typewriter + exitGap

**位置：** `useTypewriterGate.ts`

```
useTypewriter (逐字动画)
    ↓ twDone = true
setTimeout(exitGap) — cursor 持续闪烁
    ↓ exitGap 到
typewriterDone = true → GSAP timeline 解锁 + mode→idle
```

**调参：** 修改 `Welcome` slot 的 `animation` props（`charInterval`, `startDelay`）和 `exitGap`。

### 4.2 GSAP Timeline + 轮询

**位置：** `useSlotOrchestration.ts`

- Timeline 依赖 `[typewriterDone, slots]`，仅在 typewriter+exitGap 完成后构建
- `rows: 'lineByLine'` — 每行独立 GSAP `call()`，间隔 `rowInterval`
- 轮询：`setInterval` 间隔由 `pollInterval`（默认 250ms）或 `rollingInterval`（rolling 模式）控制
- `echoLines` 截断：timeline 重建前截断至 `totalLines`（移除消失 slot 残留）

### 4.3 高度动画 + 滚动

**位置：** `useAnimateHeight.ts` + `Scrollable.tsx`

三个触发场景：
- GROW（`curr > prev`）→ CSS transition 高度动画 → `onComplete` → `scrollToBottom`
- SHRINK（`curr < prev`）→ CSS transition 高度动画 → `onComplete` → `scrollToBottom`
- 内容填充（`curr === prev && newH !== oldH`）→ 直接 `scrollToBottom`

`pinnedToBottom`：仅用户在底部时跟随滚动（援引 xterm.js / VS Code Terminal）。

### 4.4 退出间隙与颜色过渡

见操作手册 §5。

---

## 5. 扩展指南

### 5.1 添加新命令

修改 `src/terminal/commands.ts`，向 `commandRegistry` 添加条目即可。handler 必须同步返回字符串。

### 5.2 添加新的 Slot 消费者

参考 `MainTerminal.tsx` 和 `InfoPanelTerminal.tsx` 的模式：

```tsx
export default function MyTerminal() {
  return (
    <TerminalBar layout={MY_LAYOUT} state={...} commands={...}>
      <TerminalBar.Welcome name="..." text="..." exitGap={...} />
      <TerminalBar.Section name="..." getLines={...} appearAfter="welcome:..." />
    </TerminalBar>
  )
}
```

### 5.3 添加实时数据到 InfoPanelTerminal

1. 在 `realtimeStore.ts` 中添加字段 + setter
2. 在 `DustField.tsx` 的 `useFrame` 中调用 setter 发布数据
3. 在 `InfoPanelTerminal.tsx` 的 `handleRollingLine` 中读取并格式化

### 5.4 复用 Scrollable 组件

```tsx
import Scrollable, { type ScrollableHandle, type ScrollOverlayState } from './terminal/Scrollable'

<Scrollable ref={ref} scrollable maxHeight="400px" autoScrollKey={version}
  overlay={({ canScrollUp, canScrollDown }) => ...}>
  {content}
</Scrollable>
```

---

## 6. 已知问题与注意事项

### 6.1 useTerminalActivation 已删除

`/` 键激活逻辑已合并进 `MainTerminal.tsx` 的 `useEffect` 中。`useTerminalActivation.ts` 已删除。

### 6.2 TerminalBar 已精简

当前 TerminalBar.tsx ~210 行（从 ~430 行精简）。默认值和 propsToSlots 已移除。layout 必传。

### 6.3 DEFAULTS 对象已移除

TerminalBar 不再有 DEFAULTS。所有布局/文本/动画默认值由消费者（MainTerminal / InfoPanelTerminal）提供。

### 6.4 调试记录索引

| 文件 | 内容 |
|------|------|
| `echo-area-scroll-debug.md` | scrollToBottom 失效 + 无限更新循环 + pinnedToBottom |
| `slot-orchestration-debug.md` | 轮询失效、rolling 丢行、滚动闪烁 |
| `react-effect-timing-traps.md` | useLayoutEffect 残留回调 + clearTimeout 杀死 timer |
| `tone-mapping-debug.md` | R3F ACES 色调映射颜色偏差 |
| `instanced-mesh-shader-compile.md` | InstancedMesh2 setColorAt 后需 materialsNeedsUpdate |
| `scene-graph-visibility.md` | DustField 嵌套导致跨 Act 不可见 |

---

## 7. 调试指南

### 7.1 关键断点位置

| 调试目标 | 文件 |
|----------|------|
| Slot 收集 | `slots.tsx` — `collectSlots` |
| Typewriter 完成 | `useTypewriterGate.ts` — `setTimeout` 回调 |
| GSAP timeline 构建 | `useSlotOrchestration.ts` — timeline useEffect |
| 命令执行 | `useCommandSystem.ts` — `handleKeyDown` Enter 分支 |
| 高度动画 | `useAnimateHeight.ts` — `useLayoutEffect` |
| 滚动状态 | `Scrollable.tsx` — `checkScroll` / `scrollToBottom` |
| 激活键 | `MainTerminal.tsx` — `/` keydown useEffect |
| 实时数据发布 | `DustField.tsx` — `setCameraData` / `setDebrisCount` |

### 7.2 Console 调试

```js
// 暴露 store 到 window（在 scrollStore.ts 中）：
if (typeof window !== 'undefined') (window as any).__store = useScrollStore

// Console:
__store.getState().terminalMode       // 'typing' | 'idle' | 'active'
__store.getState().echoLines          // string[]
__store.setState({ terminalMode: 'idle' })
```

---

## 8. 测试指南

```bash
pnpm test                    # 6 files, 34 tests
pnpm vitest run src/terminal # terminal 模块
pnpm vitest --watch          # 监听
```

| 文件 | 测试对象 |
|------|----------|
| `commands.test.ts` | 命令注册、执行、别名 |
| `useTypewriter.test.ts` | 打字机延迟、逐字输出 |
| `Scrollable.test.tsx` | 渲染、scrollable class、overlay、ref API |
| `useTerminalActivation.test.ts` | 已删除 |

---

## 附录：关键常量和默认值速查

| 常量 | 位置 | 默认值 |
|------|------|:---:|
| `ANIMATION_DEFAULTS.heightAnimPerLine` | TerminalBar.tsx | `0.15` |
| `BEHAVIOR_DEFAULTS.activationMode` | TerminalBar.tsx | `'click'` |
| `BEHAVIOR_DEFAULTS.blurTimeout` | TerminalBar.tsx | `100` |
| `MAIN_LAYOUT.maxEchoLines` | MainTerminal.tsx | `5` |
| `MAIN_LAYOUT.fontSize` | MainTerminal.tsx | `0.68rem` |
| `CMD_ROW_INTERVAL` | MainTerminal.tsx | `3000` (ms) |
| InfoPanel `maxEchoLines` | InfoPanelTerminal.tsx | `8` |
| InfoPanel `rollingInterval` | InfoPanelTerminal.tsx | `500` (ms) |
| 颜色插值范围 | App.tsx `handleThemeUpdate` | `sp 0.40–0.55` |
