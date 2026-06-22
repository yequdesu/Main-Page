# Terminal Bar v2 设计文档

> 日期：2026-06-13
> 状态：设计完成，待实施
> 前提：基于 v1 实现（`2026-06-13-terminal-cli-bar-design.md`）

## 一、需求概述

在 v1 基础上进行三项重构优化：

| 需求 | 描述 |
|------|------|
| Scroll overlay 解耦 | ▲/▼ 指示器移出 echo 容器，作为独立 overlay 层；声明式联动接口；通用 `<Scrollable>` 原语 |
| Focus 机制重构 | 默认 click→focus；`/` 激活通过 `useTerminalActivation()` hook，TerminalBar 提供接口 |
| Liquid Glass 效果 | Vivid Glass — 高对比度毛玻璃 + 蓝色调径向渐变光泽 + 内高光 + 多层光晕 |

## 二、方案决策

### 2.1 Scroll Overlay — 方案 C：Scrollable 原语 + overlay slot

- **`<Scrollable>`** 通用滚动容器，通过 render props 向 overlay 注入滚动状态
- 联动接口：`{ canScrollUp, canScrollDown, scrollBy, scrollToBottom }`
- overlay 内容可完全替换（默认箭头，可改为进度条、行号等）

### 2.2 Focus — useTerminalActivation hook

```typescript
useTerminalActivation(): {
  onKeyDown: (e: KeyboardEvent) => void  // 父组件 spread 到 keydown listener
  activate: () => void                   // 程序式激活备用
  isActive: boolean                      // 替代父组件自行 subscribe
}
```

TerminalBar `onClick` → 直接激活。App.tsx 不再触碰 `terminalMode`/`setTerminalMode`。

### 2.3 Liquid Glass — Vivid Glass

- 多层径向渐变（3 层：主光泽 + 辅助光晕 + 环境光）
- 内阴影高光 `inset 0 1px 0 rgba(255,255,255,0.10)`
- 边框半透明蓝调 `rgba(100,180,255,0.18)`
- backdrop-filter: blur(28px)
- 随 scroll 白化动态调整色值（复用 v1 lerpHex 机制）

## 三、文件结构

```
src/terminal/
├── TerminalBar.tsx          # 主组件（重写）
├── TerminalBar.css          # 样式（重写）
├── Scrollable.tsx           # 通用滚动容器 + overlay slot（新增）
├── Scrollable.css           # 滚动容器样式（新增）
├── useTerminalActivation.ts # focus 激活 hook（新增）
├── commands.ts              # 命令注册表（不变）
├── useTypewriter.ts         # typewriter hook（不变）
└── __tests__/
    ├── commands.test.ts     # 不变
    ├── useTypewriter.test.ts# 不变
    └── ...                  # 新增测试
```

## 四、组件架构

### 4.1 组件树

```
App.tsx
  useTerminalActivation()          ← hook 返回 { onKeyDown, isActive }
  onKeyDown → window keydown
  isActive  → guard wheel/click

TerminalBar
├── <div.terminal-bar-inner>      ← liquid glass + onClick→focus
│   ├── <Scrollable scrollable={isActive} overlay={indicators}>
│   │   └── <div.terminal-echo>   ← 回显区
│   │       ├── typewriter / echoLines
│   │       └── cursor
│   └── <div.input-line>          ← 输入行
│       ├── prompt / cursor / placeholder / text
│       └── <input hidden>
```

### 4.2 Scrollable 接口

```typescript
interface ScrollableProps {
  scrollable: boolean                          // 是否允许滚动
  maxHeight: string                            // CSS max-height
  children: React.ReactNode                    // 滚动内容
  overlay: (state: ScrollOverlayState) => React.ReactNode  // overlay slot
}

interface ScrollOverlayState {
  canScrollUp: boolean
  canScrollDown: boolean
  scrollBy: (options: { top: number; behavior?: ScrollBehavior }) => void
  scrollToBottom: () => void
}

interface ScrollableHandle {
  scrollBy: (options: { top: number; behavior?: ScrollBehavior }) => void
  scrollToBottom: () => void
  getLineHeight: () => number
}
```

### 4.3 useTerminalActivation 接口

```typescript
function useTerminalActivation(): {
  onKeyDown: (e: KeyboardEvent) => void
  activate: () => void
  isActive: boolean
}
```

## 五、数据流

```
useTerminalActivation (App.tsx)
  └─ onKeyDown → '/' key → store.setTerminalMode('active')
  └─ activate() → store.setTerminalMode('active')
  └─ isActive ← store.terminalMode === 'active'

TerminalBar
  └─ onClick → store.setTerminalMode('active')  [click-to-focus]
  └─ terminalMode → 控制 Scrollable scrollable prop
  └─ terminalMode → 控制 input-line visible
  └─ terminalMode → 控制 color 动画

Scrollable
  └─ scrollable prop → CSS overflow-y
  └─ onScroll → checkScroll → overlay state
  └─ useEffect(echoLines) → scrollToBottom
```

## 六、测试策略

| 层级 | 内容 | 方式 |
|------|------|------|
| L1 纯函数 | `Scrollable` overlay state 逻辑 | Vitest |
| L1 hook | `useTerminalActivation` 状态切换 | Vitest + renderHook |
| L2 场景 | TerminalBar 三态 + click-to-focus | React Testing Library |
| L2 交互 | Scrollable overlay 联动 | RTL |

## 七、约束

1. Liquid glass CSS 变量命名遵循 `--tw-*` 前缀规范
2. Scrollable 为通用组件，不耦合 terminal 逻辑
3. useTerminalActivation 保持纯状态桥接，不引入 DOM 依赖
4. 保持 v1 全部功能：typewriter、三态、命令执行、动态颜色
5. `frameloop="demand"` 约束不变，不触发无谓渲染
6. 兼容 `.superpowers/` gitignore
