# 动画排轴系统重构 — 交接文档

**日期**: 2026-06-22
**源分支**: `Editor-CyDlen-$-Terminal-Bar-$-Planet-Label`
**目标分支**: `Editor-CyDlen-$-Time-Line-Sys`
**前置归并**: `Planet-Label` → `Terminal-Bar` → `Editor-CyDlen`

---

## 一、当前动画排轴方式总览

> **实施约束**: 以下基于文档说明。实际编码时必须以源码为准，文档可能过期。

### 7 大类、19 种排轴方式

#### 一、逐字 / 逐行动画排轴

| # | 方式 | 文件 | 机制 |
|---|------|------|------|
| 1 | setTimeout 字符级 Typewriter | `useTypewriter.ts` | `schedule(startDelay)` → `charInterval` 递归 → `isDone` |
| 2 | GSAP Timeline 内容编排 | `useSlotOrchestration.ts` | `gsap.timeline()` + `tl.call` + `tl.addLabel` + `appearAfter` 依赖 |
| 3 | CSS Transition 行高动画 | `useAnimateHeight.ts` | `max-height` transition + `setTimeout` + `onComplete` |

#### 二、帧循环排轴

| # | 方式 | 文件 | 机制 |
|---|------|------|------|
| 4 | R3F useFrame (demand) | 9 个 Actor | `useFrame((state, delta) => {...})`，`frameloop="demand"` |
| 5 | rAF 独立循环 (PBD) | `useFloatingLabels.ts` | `requestAnimationFrame(loop)` 独立于 R3F |
| 6 | GSAP Ticker 物理惯性 | `App.tsx` | `gsap.ticker.add(ticker)` + velocity/friction |

#### 三、状态机排轴

| # | 方式 | 文件 | 机制 |
|---|------|------|------|
| 7 | TerminalBar 三态机 | `TerminalBar.tsx` | `typing → idle → active`，`onModeChange` 通知外部 |
| 8 | labelsGateOpen 门控 | `scrollStore` → `FloatingLabels` | Zustand 跨组件信号 |
| 9 | pbdReady 门控 | `useFloatingLabels.ts` | 模块级 `_pbdReadyLogged` 标志 |

#### 四、延迟 / 定时排轴

| # | 方式 | 文件 | 机制 |
|---|------|------|------|
| 10 | PBD 延迟跟随 (250ms) | `FloatingLabels.tsx` | `setTimeout(collapsedFitWidths, 250)` |
| 11 | 牵引线延迟出现 (500ms) | `FloatingLabels.tsx` | `setTimeout(guidesReady, 500)` |
| 12 | 退出超时 (15000ms) | `useFloatingLabels.ts` | `setTimeout(clearActiveTrackIdx, exitTimeout)` |
| 13 | setInterval 轮询 | `useSlotOrchestration.ts`, `PlanetLabelDebug.tsx` | 内容刷新 + debug 标志轮询 |

#### 五、CSS 动画排轴

| # | 方式 | 文件 |
|---|------|------|
| 14 | CSS Transitions | FloatingLabels.css, TerminalBar.css, App.css, InfoPanelTerminal.css, theme.css |
| 15 | CSS @keyframes | App.css (sc-bounce, ring-in, line-in), TerminalBar.css (cursor-blink) |

#### 六、GSAP 补间排轴

| # | 方式 | 文件 | 机制 |
|---|------|------|------|
| 16 | ScrollTrigger 滚动驱动 | `App.tsx` | `ScrollTrigger.create({ scrub: 0 })` |
| 17 | gsap.to 点击快进 | `App.tsx` | `gsap.to(tweenObj, { val: 1.0, duration: 2 })` |
| 18 | gsap.to Day/Night 过渡 | `useDayNight.ts` | `gsap.to(sceneBlendRef, { duration: 1.2 })` |

#### 七、序列排轴

| # | 方式 | 文件 | 机制 |
|---|------|------|------|
| 19 | Sequential Reveal | `FloatingLabels.tsx` | `showCount` + `typingDoneRef`，3 种策略 |

---

## 二、当前问题分析

### 分布式命令式的代价

```
Act 3 入场排轴（跨 5 个文件，隐式协调）:

App.tsx                 → needsAct3(sp) → 条件渲染 FloatingLabels / InfoPanelTerminal
InfoPanelTerminal.tsx   → 内部 typewriter → onModeChange('idle') → setLabelsGateOpen (store)
FloatingLabels.tsx      → labelsGateOpen 订阅 + pbdReady 门控 + showCount 序列
useFloatingLabels.ts    → rAF PBD 循环 → _pbdReadyLogged → setPbdReady
PlanetLabelGuideLines.tsx → guidesReady 门控（500ms setTimeout）
```

| 问题 | 表现 |
|------|------|
| 认知负荷 | 排轴关系跨 5 层组件，无法从单一入口理解完整时序 |
| 隐式依赖 | `250ms`、`500ms` 的 setTimeout 散落各处，没有显式关系 |
| 脆弱性 | 改动一个延迟值可能破坏下游，无编译时/运行时检查 |
| 调试困难 | 需 `console.log` 在多个文件中追踪 |
| 组件耦合 | `labelsGateOpen` 等 store 字段专为跨组件排轴而设，语义不通用 |

### 核心矛盾

**组件内部**：命令式编排可接受（封装内部状态）。  
**跨组件联动**：当前用隐式 setTimeout + Zustand 字段协调，缺乏统一的排轴抽象。

---

## 三、设计原则

1. **信号驱动**：组件完成后发出命名信号，不关心下游是谁
2. **声明式序列**：在一处声明 A→B→C 的转换关系
3. **组件只读 phase**：组件订阅当前序列阶段，不管理何时进入
4. **封装内部命令式**：组件内部仍可用命令式实现动画，但对外只暴露信号
5. **可组合**：序列可嵌套（父序列的阶段包含子序列）

---

## 四、API 设计

### 4.1 核心类型

```ts
// src/stores/sequenceStore.ts

type PhaseName = string
type SignalName = string
type SequenceId = string

interface SequenceDef {
  id: SequenceId
  phases: PhaseName[]         // 有序阶段列表
  on: TransitionTable         // phase × signal → nextPhase
  parent?: SequenceId         // 父序列 ID（可选，用于嵌套）
  parentPhase?: PhaseName     // 激活本序列的父序列阶段
}

// 转换表：当前 phase → { signal: nextPhase }
type TransitionTable = Record<PhaseName, Record<SignalName, PhaseName>>

// 运行时状态
interface SequenceState {
  phase: PhaseName
  active: boolean   // phase === 'complete' 时变为 false
}

// Zustand Store
interface SequenceStore {
  sequences: Record<SequenceId, SequenceState>
  defs: Record<SequenceId, SequenceDef>

  // 发出信号 → 查转换表 → 推进 phase
  signal: (seqId: SequenceId, sigName: SignalName) => void

  // 重置序列
  reset: (seqId: SequenceId) => void
  resetAll: () => void
}
```

### 4.2 Hook API

```ts
// 订阅当前 phase — 组件声明式等待
function usePhase(seqId: SequenceId): PhaseName

// 获取信号发射器 — 组件完成时调用
function useSignal(seqId: SequenceId): (sigName: SignalName) => void
```

### 4.3 signal() 核心逻辑（伪代码）

```ts
signal: (seqId, sigName) => {
  const seq = get().sequences[seqId]
  if (!seq?.active) return            // 已完成或未激活，忽略

  const def = get().defs[seqId]
  const next = def.on[seq.phase]?.[sigName]
  if (!next) return                    // 无效信号，静默忽略

  if (next === '__parent__') {
    // 冒泡：通知父序列本阶段完成
    if (def.parent) {
      get().signal(def.parent, `${seqId}:done`)
    }
    return
  }

  if (next === '__complete__') {
    set({ sequences: { ...get().sequences, [seqId]: { phase: next, active: false } } })
    return
  }

  set({ sequences: { ...get().sequences, [seqId]: { phase: next, active: true } } })
}
```

---

## 五、典型案例设计（伪代码）

### 案例 1: 跨组件 Act 3 入场排轴

> **替换**: `labelsGateOpen` + `pbdReady` 双重门控 + `setTimeout` 分散协调

```ts
// ===== 定义（src/sequences/act3.ts 或内联） =====

const act3Entry = defineSequence({
  id: 'act3-entry',
  phases: ['idle', 'infoPanelTyping', 'labelsRevealing', 'complete'],
  on: {
    idle:            { mount:            'infoPanelTyping' },
    infoPanelTyping: { welcomeDone:      'labelsRevealing' },
    labelsRevealing: { allLabelsReady:   'complete' },
  },
})

// ===== InfoPanelTerminal — 完成后发信号 =====

function InfoPanelTerminal() {
  const signal = useSignal('act3-entry')
  signal('mount')  // 组件挂载时发出（或由 App.tsx 在 needsAct3 时发出）

  return (
    <TerminalBar state={{
      onModeChange: (mode) => {
        if (mode === 'idle') signal('welcomeDone')
      }
    }} />
  )
}

// ===== FloatingLabels — 声明式等待 =====

function FloatingLabels() {
  const phase = usePhase('act3-entry')

  // 替代 pbdReady && labelsGateOpen
  if (phase < 'labelsRevealing') return <LabelsPlaceholder />

  return labels.map(l => <PlanetLabel key={l.trackIdx} trackIdx={l.trackIdx} />)
}
```

### 案例 2: 组件内子组件时序（label 收缩 → PBD → 牵引线）

> **替换**: 三处 `setTimeout` + 三个独立状态

```ts
// ===== 定义 =====

const labelShrink = defineSequence({
  id: 'label-shrink',
  phases: ['idle', 'visual', 'pbd', 'guideLine'],
  on: {
    idle:     { typewriterDone:    'visual' },
    visual:   { animationHalfway:  'pbd' },
    pbd:      { animationComplete: 'guideLine' },
  },
})

// ===== 消费（在 Pill 渲染中） =====

function CollapsedPill({ trackIdx }: { trackIdx: number }) {
  const seqId = `label-shrink-${trackIdx}`
  const phase = usePhase(seqId)

  // 宽度：visual 阶段到达 → 收缩
  const w = phase >= 'visual' ? fitWidths[trackIdx] : collapsedWidth

  // PBD 宽度：pbd 阶段到达 → 传入
  const pbdW = phase >= 'pbd' ? fitWidths[trackIdx] : undefined

  // 牵引线：guideLine 阶段到达 → 渲染
  const showGuide = phase >= 'guideLine'

  return <div style={{ width: w }}>...</div>
}

// ===== 信号发出 =====

function handleTypewriterComplete(trackIdx: number) {
  const signal = useSignal(`label-shrink-${trackIdx}`)

  signal('typewriterDone')                     // → visual

  // setTimeout 仍在内部使用，但只负责发出信号，不管理"何时触发"
  setTimeout(() => signal('animationHalfway'), 250)   // → pbd
  setTimeout(() => signal('animationComplete'), 500)  // → guideLine
}
```

### 案例 3: PBD 稳定信号（替代 `_pbdReadyLogged`）

```ts
// PBD rAF 循环中
const STABLE_FRAMES = 3
let stableCount = 0

function pbdRafLoop() {
  // ... stepPBD ...

  const maxV = Math.max(...bodies.map(b => Math.hypot(b.vx, b.vy)))
  if (allBodiesActive && maxV < STABLE_VELOCITY_THRESHOLD) {
    stableCount++
    if (stableCount >= STABLE_FRAMES) {
      signal('pbdStable')   // 替代 _pbdReadyLogged = true
    }
  } else {
    stableCount = 0
  }
}
```

### 案例 4: 序列嵌套（label-reveal 作为 act3-entry 的子阶段）

```ts
const act3Entry = defineSequence({
  id: 'act3-entry',
  phases: ['idle', 'infoPanelTyping', 'labelsRevealing', 'complete'],
  on: {
    idle:            { mount:            'infoPanelTyping' },
    infoPanelTyping: { welcomeDone:      'labelsRevealing' },
    labelsRevealing: { revealComplete:   'complete' },
  },
})

// 子序列：仅在父序列 labelsRevealing 阶段激活
const labelReveal = defineSequence({
  id: 'label-reveal',
  parent: 'act3-entry',
  parentPhase: 'labelsRevealing',
  phases: ['label0', 'label1', 'label2'],
  on: {
    label0: { typewriterDone: 'label1' },
    label1: { typewriterDone: 'label2' },
    label2: { typewriterDone: '__parent__' },  // 冒泡发出 revealComplete
  },
})

// 使用
function PlanetLabel({ trackIdx }: { trackIdx: number }) {
  const revealPhase = usePhase('label-reveal')
  if (revealPhase < `label${trackIdx}`) return null
  return <TerminalBar ... />
}
```

---

## 六、实现优先级

### 阶段 1: 基础设施（`src/stores/sequenceStore.ts`）

- [ ] Zustand store：`sequences` + `defs` + `signal()` + `reset()`
- [ ] Hook: `usePhase(seqId)` / `useSignal(seqId)`
- [ ] `defineSequence()` 辅助函数
- [ ] 嵌套序列支持（parent / parentPhase / `__parent__` 冒泡）
- [ ] 单元测试

### 阶段 2: 迁移跨组件排轴

- [ ] Act 3 入场序列：替代 `labelsGateOpen` + `pbdReady` 门控
- [ ] PBD 稳定信号：替代 `_pbdReadyLogged`

### 阶段 3: 迁移组件内子序列

- [ ] Label shrink 序列：替代 `visualFitWidths` / `collapsedFitWidths` / `guidesReady` 三状态
- [ ] Label reveal 序列：替代 `showCount` + `typingDoneRef`
- [ ] 牵引线延迟：绑定到序列 phase 而非独立 setTimeout

### 阶段 4: 评估 TerminalBar Slot 编排

- [ ] 如 GSAP timeline 工作良好，可维持现状
- [ ] 若迁移，以 `terminalSlots` 序列替代 `appearAfter` 字符串隐式依赖

---

## 七、实施约束

1. **以实际代码为准**：本文档中的文件路径、函数名、参数值可能已过期。实施前必须阅读源码确认。
2. **渐进式迁移**：每个阶段独立可验证，不破坏现有功能
3. **保持命令式内部**：组件内部仍可用 setTimeout/GSAP 实现具体动画，仅对外暴露信号
4. **不替换动画引擎**：R3F useFrame、GSAP timeline、CSS transitions 保持不变
5. **sequenceStore 仅管理时序**：不处理动画实现细节

---

## 八、关键源码索引

> 实施前按此列表逐文件确认当前状态。

| 文件 | 关键内容 |
|------|---------|
| `src/stores/scrollStore.ts` | `labelsGateOpen`, `setLabelsGateOpen` |
| `src/InfoPanelTerminal.tsx` | `onModeChange` → `setLabelsGateOpen(true)` |
| `src/actors/FloatingLabels.tsx` | `pbdReady && labelsGateOpen` 门控, `visualFitWidths`/`collapsedFitWidths`/`guidesReady`, `setTimeout(250)`/`setTimeout(500)`, `showCount`/`typingDoneRef` |
| `src/behaviors/useFloatingLabels.ts` | `_pbdReadyLogged`, rAF PBD 循环, `pbdReady` state, `staggerDelay`/`baseTypewriterDelay` |
| `src/behaviors/usePBDLayout.ts` | `stepPBD()`, module-level `_bodies`, `_prevTarget` |
| `src/actors/PlanetLabelGuideLines.tsx` | `guidesReady` 门控, 4 计算点, 3px 蒙版 |
| `src/terminal/useSlotOrchestration.ts` | GSAP timeline, `appearAfter`, `typewriterDone` |
| `src/terminal/useTypewriterGate.ts` | `exitGap` setTimeout, `typewriterDone` |
| `src/terminal/TerminalBar.tsx` | 三态机 `typing→idle→active`, `onModeChange` |
