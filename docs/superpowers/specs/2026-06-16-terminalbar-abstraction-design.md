# TerminalBar 抽象化重构 — 设计文档

> 日期：2026-06-16
> 分支：`componentization-experiment`

## 目标

将 TerminalBar 从"携带默认实现的具象组件"重构为"纯抽象容器引擎"，与 ExperimentTerminal 形成对称的消费模式。

## 核心原则

1. **TerminalBar 零身份默认值** — 不内置 welcome text、status line、placement、size
2. **内容统一入口** — 所有内容（welcome/status/rolling）均通过 Slot children 显式声明
3. **交互分层** — TerminalBar 仅提供 click-to-activate；`/` 键激活是 MainTerminal 专属逻辑
4. **MainTerminal ↔ ExperimentTerminal 对称** — 两者均为 TerminalBar 的 thin wrapper

## 交互模型

```
TerminalBar（通用引擎）
  └── 唯一激活方式：click to toggle

MainTerminal（MainPage 专属）
  └── 继承 click + 添加 / 键激活

ExperimentTerminal（实验终端）
  └── 继承 click
```

## 变更清单

### TerminalBar.tsx — 精简为纯引擎

**移除：**
- `DEFAULTS` 对象（text/layout/animation/behavior 默认值合并）
- `propsToSlots()` 函数
- `mergeSlots()` 函数
- `latestPropsRef`
- Props: `buildStatusLine`, `buildStatusLines`, `contentLines`, `statusLinePrefix`, `welcomeText`
- Interfaces: `TerminalBarTextConfig`, `TerminalBarLayoutConfig`, `TerminalBarAnimationConfig`, `TerminalBarBehaviorConfig`, `TerminalBarContentLine`
- `activationKey` 相关逻辑

**保留：**
- `promptChar` 默认 `'$'`（shell 通用约定）
- `placeholder` 默认 `"type 'help' for available commands"`
- 动画参数默认值（`typewriterCharInterval: 40`, `rowInterval: 250` 等）
- 行为默认值：`activationMode: 'click'`（唯一内置交互）
- `useSlotOrchestration` + `useCommandSystem` + `useAnimateHeight`
- `Slot.Welcome/Section/ContentLine` 静态组件注册
- 受控状态模式、主题更新、渲染 JSX

**layout prop 变为必传：**
```ts
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
```

### MainTerminal.tsx — 新建

承载原 TerminalBar 中 MainPage 专属配置：

- 布局默认值（bottom, maxWidth, fontSize 等）
- `<Welcome>` slot：`"# YeQuDesu · Personal Site · ready"`
- `<Section>` slot：`buildStatusLine` 映射为 `getLines`
- `/` 键 keydown 监听器（从 `useTerminalActivation` 迁移）

接口透传 App.tsx 的受控状态。

### App.tsx — 精简

- 移除 `useTerminalActivation` 调用和 `window keydown` 监听
- `<TerminalBar ...>` 替换为 `<MainTerminal ...>`
- 移除不再需要的 import

### useTerminalActivation.ts — 删除

逻辑已合并进 MainTerminal。

### ExperimentTerminal.tsx — 无变更

已使用纯 Slot children 模式，无需修改。

## 不变文件

- `slots.tsx`、`useSlotOrchestration.ts`、`useCommandSystem.ts`、`useAnimateHeight.ts`、`useTypewriter.ts`
- `Scrollable.tsx/css`、`commands.ts`
- CSS 文件
