# React Effect 时序陷阱：useLayoutEffect 残留回调 与 setState 杀 timer

> 日期：2026-06-14
> 标签：debug, React, useLayoutEffect, useEffect, setState, closure, TerminalBar

## 现象

TerminalBar 参数化解耦重构后出现两个回归：

1. **`cls` 命令收缩动画丢失**：执行 `clear` 后回显区高度直接跳变，无平滑过渡；且状态行重复追加
2. **Typewriter 完成后终端冻结**：欢迎文字逐字打印完毕后，状态行不出现、`/` 键无效、input 无法聚焦——终端卡在 typing 模式

---

## 案例一：useLayoutEffect 残留回调

### 背景

原始实现中，`cls` 命令的处理流程：

```
handleKeyDown:
  useScrollStore.setState({ echoLines: [welcome] })
    → subscribe 同步触发（React render 之前）
    → appendEcho(status)
    → Zustand 最终状态 = [welcome, status]

React 一次 render:
  echoLines = [welcome, status]（长度 2）
  useAnimateHeight: SHRINK N→2 ✓
```

Zustand 的 `subscribe` 在 React render **之前**同步触发，状态行追加与 echoLines 重置合并为一次 render。`useAnimateHeight` 看到的是已包含状态行的最终数组，一条 CSS transition 完成收缩。

### 重构后的问题

重构后 TerminalBar 不再 import Zustand。状态行更新改用 `useLayoutEffect`（试图以同步 pre-paint 语义模拟 subscribe）：

```
handleKeyDown:
  clearEcho() → echoLines = [welcome]（长度 1）

React render A:
  echoLines = [welcome]（长度 1）

  useLayoutEffect 队列（按 hook 定义顺序执行）:
    ① useAnimateHeight (render A):
       prev=N, curr=1 → SHRINK N→1
       → CSS transition 启动: N 行高度 → 1 行高度
       animatingRef = true

    ② 状态行 effect (render A):
       appendEcho(status) → setState → 同步 re-render B

       ═══ React 同步处理 render B ═══
       useAnimateHeight (render B):
         prev=1, curr=2 → GROW 1→2
         animatingRef=true → el.style.height = newH
         → CSS transition 重定向: N 行 → 2 行 ✓
       状态行 effect (render B):
         skip（状态行已存在）
       ═══ render B 结束 ═══

    ③ useAnimateHeight (render A 残留！) ⚠️
       curr=1（来自 render A 的闭包！）
       prev=2（被 render B 的 prevLineCount 更新）
       → SHRINK 2→1
       → CSS transition 被覆盖 ✗

    ④ 状态行 effect (render A 残留！) ⚠️
       appendEcho(status) → 重复追加 ✗
```

### 根因

React 在 `useLayoutEffect` 内部遇到 `setState` 时，会**同步**处理新 render。但原始 render 的剩余 `useLayoutEffect` 回调**不会**被丢弃——它们以**原始 render 的 state 闭包**继续执行。

关键：`useAnimateHeight` 通过 `prevLineCount` ref 在不同 effect 调用间共享状态，但 effect 闭包中的 `curr`（`items.length`）来自各自 render 的 props。当 render A 的残留 effect 以 `curr=1`（旧值）和 `prevLineCount.current=2`（被 render B 更新）执行时，错误地触发了二次 SHRINK。

### 修复

**不在 effect 链中追加状态行**。在 `handleKeyDown` 事件处理器中一次构建完整数组：

```typescript
if (trimmed === 'clear' || trimmed === 'cls') {
  const statusLine = props.buildStatusLine?.(props.scrollProgress ?? 0)
  const lines = statusLine ? [welcomeText, statusLine] : [welcomeText]
  props.onEchoLinesChange?.(lines)  // 单次调用，一次 render
  return
}
```

同时将状态行更新 effect 从 `useLayoutEffect` 回退为 `useEffect`（不再需要同步语义）。

### 教训

1. **`useLayoutEffect` + 同步 setState = 危险组合**。残留回调会以旧 state 继续执行，与 ref 共享状态交互时尤其致命
2. **需要同步更新的场景，应在事件处理器中一次构建最终状态**，而非依赖 effect 链
3. Zustand `subscribe` 在 render 前触发，React `useLayoutEffect` 在 render 后触发——两者时序本质不同，不可简单替换

---

## 案例二：setState 杀死了自己的 setTimeout

### 背景

Typewriter 动画完成后，希望光标闪烁 1.5s 后再显示状态行，作为 welcome text 与 status line 之间的视觉过渡。

### 问题实现

```typescript
// ❌ 有 bug 的实现
useEffect(() => {
  if (isDone && !state.typewriterDone) {
    state.setTypewriterDone(true)          // ①

    typewriterTimerRef.current = setTimeout(() => {
      state.setMode('idle')
      state.resetToWelcome()
    }, 1500)                                // ②
  }
  return () => clearTimeout(typewriterTimerRef.current)  // ③
}, [isDone, state.typewriterDone])          // ④
```

### 时序分析

```
isDone 变为 true
  ↓
effect 执行:
  ① state.setTypewriterDone(true)       ← setState → 触发 re-render
  ② setTimeout(..., 1500)               ← 设置 timer
  ↓
re-render（state.typewriterDone 变为 true）
  ↓
effect 重跑（typewriterDone 在 deps 中）:
  ③ cleanup: clearTimeout(oldTimer)     ← 杀死刚设置的 timer ✗
  条件: isDone && !typewriterDone       ← false → 无新 timer
  ↓
timer 永远不会触发 → mode 永远卡在 'typing'
```

### 根因

`setTypewriterDone(true)` 是 **effect 内部对自身依赖的修改**。React 在 state 变更后重跑 effect：
1. 先执行上一轮 effect 的 cleanup（`clearTimeout`）
2. 再执行新一轮 effect（条件为 false，跳过）

刚设置的 timer 在下一帧就被杀死。`state.typewriterDone` 已为 `true`，后续任何 render 都不会再进入该分支。

### 修复

`setTypewriterDone(true)` 延迟到 `setTimeout` 回调内部——timer 先触发，状态后变更：

```typescript
// ✓ 修复后
useEffect(() => {
  if (isDone && !state.typewriterDone) {
    typewriterTimerRef.current = setTimeout(() => {
      state.setTypewriterDone(true)      // 在 timer 回调内修改
      state.setMode('idle')
      state.resetToWelcome()
    }, 1500)
  }
  return () => clearTimeout(typewriterTimerRef.current)
}, [isDone, state.typewriterDone])
```

effect 首次执行时 `typewriterDone` 仍为 `false`，不触发重跑。timer 在 1.5s 后正常触发，内部调用 `setTypewriterDone(true)` 引发 re-render，但此时 effect deps 变化后的重跑 cleanup 已是 no-op（timer 已执行完毕）。

### 教训

在 `useEffect` 内部**同步修改自身依赖数组中的状态**时，effect 会立即重跑，cleanup 会杀死当前 effect 中设置的所有副作用（timers、subscriptions、pending animations）。**需要延迟的状态修改应与延迟的副作用同步执行**——都放在 timer 回调内。

---

## 共通模式

两个 bug 共享同一根本原因：**在 React 的 effect/state 生命周期中引入异步操作时，没有充分考虑 effect 重跑对副作用的影响**。

| 案例 | 异步操作 | effect 重跑原因 | 后果 |
|------|----------|----------------|------|
| 案例一 | `useLayoutEffect` → `setState` → 同步 render B → 残留 effect 回调 | `setState` 同步触发嵌套 render | 残留回调以旧 state 覆盖正确动画 |
| 案例二 | `setTimeout` 在 effect 内设置 | 同步 `setState` 触发 effect 重跑 → cleanup 杀 timer | timer 从未触发，状态机卡死 |

**原则：需要异步延迟的状态变更，其触发条件不应与延迟操作放在同一个 effect 的同步阶段。** 要么全部同步（原始方案），要么全部异步（案例二修复后），但不要一半同步一半异步。
