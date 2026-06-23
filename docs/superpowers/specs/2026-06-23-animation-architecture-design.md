# 动画架构重构 — 双驱动系统设计

**日期**: 2026-06-23
**基于**: CyDlen 序列系统 + sp 驱动集中化

---

## 一、建模

### 两类驱动

```
┌─────────────────────────────────────────────────────────┐
│                    sp 驱动（可逆）                        │
│                                                         │
│  输入: f(sp)  纯函数                                     │
│  行为: 正反滚动对称                                       │
│  管理: src/animation/timeline.ts                         │
│                                                         │
│  海浪层叠 · 水幕 · 光束淡出 · 灯塔 · 迷雾 · 环境光       │
│  网格延伸/回收 · 风铃下落/回收 · 轨道 · 辉光 · Act可见性  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  非 sp 信号驱动（不可逆）                  │
│                                                         │
│  输入: signal(name, payload)                             │
│  行为: 状态机单向推进                                     │
│  管理: src/animation/sequenceStore.ts                    │
│                                                         │
│  R3F useFrame tick · Typewriter · PBD稳定 · 标签序列     │
│  Day/Night · 终端状态 · 行星点击 · 物理惯性              │
└─────────────────────────────────────────────────────────┘
```

### 两类系统的数据通过 `AnimContext` 共享

```ts
sp 系统  ──写入──→  animState.planet.worldPositions
                    animState.beam.direction       ←── 非sp 系统读取
非sp 系统 ──写入──→  animState.label.ready
                    animState.pbd.stable           ←── 组件读取
```

---

## 二、sp 系统：timeline.ts

### 结构

```ts
// src/animation/timeline.ts

// ── 注册 ──
interface SpAnimation {
  name: string
  range: [number, number]  // [start, end]
  init?: () => void        // 首次进入时调用一次
  update: (sp: number) => void
  exit?: () => void        // 离开时调用一次
  prevSp: number           // 内部：追踪方向
}

const registry: SpAnimation[] = []
export function registerSp(a: Omit<SpAnimation, 'prevSp'>) {
  registry.push({ ...a, prevSp: -1 })
}

// ── ScrollInvalidator 每帧调用一次 ──
export function tickSp(sp: number) {
  for (const a of registry) {
    const wasActive = a.prevSp >= a.range[0] && a.prevSp <= a.range[1]
    const isActive  = sp        >= a.range[0] && sp        <= a.range[1]

    if (isActive && !wasActive) a.init?.()
    if (isActive)                a.update(sp)
    if (!isActive && wasActive)  a.exit?.()
    a.prevSp = sp
  }
}
```

### 迁移示例

```ts
// ===== OceanWaves.tsx — 之前 =====
useFrame(() => {
  const sp = getState().scrollProgress
  const gf = clamped(sp, 0.24, 0.60)
  // ... 30 lines of animation
})

// ===== OceanWaves.tsx — 之后 =====
import { registerSp } from '@/animation/timeline'

registerSp({
  name: 'oceanCascade',
  range: [0.24, 0.60],
  update(sp) {
    const gf = clamped(sp, 0.24, 0.60)
    // ... 30 lines of animation
  },
})
```

---

## 三、非 sp 系统：sequenceStore.ts

### 结构（CyDlen 设计，略微精简）

```ts
// src/animation/sequenceStore.ts

type PhaseName = string
type SignalName = string
type SeqId = string

interface SequenceDef {
  id: SeqId
  phases: PhaseName[]
  on: Record<PhaseName, Record<SignalName, PhaseName>>  // phase × signal → nextPhase
}

// Zustand Store
interface SequenceStore {
  defs:      Record<SeqId, SequenceDef>
  state:     Record<SeqId, { phase: PhaseName; active: boolean }>

  signal:    (id: SeqId, sig: SignalName, payload?: any) => void
  reset:     (id: SeqId) => void
}

// Hook
function usePhase(id: SeqId): { phase: PhaseName; active: boolean }
function useSignal(id: SeqId): (sig: SignalName) => void
```

### 使用

```tsx
// FloatingLabels — 声明式等待
function FloatingLabels() {
  const { phase } = usePhase('act3-entry')

  if (phase < 'labelsRevealing') return null    // 替代 pbdReady && labelsGateOpen
  return labels.map(l => <Label ... />)
}

// InfoPanelTerminal — 完成时发信号
function InfoPanelTerminal() {
  const signal = useSignal('act3-entry')

  return <TerminalBar onModeChange={(m) => {
    if (m === 'idle') signal('welcomeDone')
  }} />
}

// useFrame tick — 帧作为信号源
import { useSignal } from './sequenceStore'
function useFrameTick() {
  const signal = useSignal('global-tick')
  useFrame((state) => signal('tick', { time: state.clock.elapsedTime, delta: state.clock.getDelta() }))
}
```

---

## 四、共享状态：animState

```ts
// src/animation/animState.ts

import { Vector3 } from 'three'

export const animState = {
  // ── sp 驱动写入 ──
  beam: {
    worldOrigin:    new Vector3(),
    worldDirection: new Vector3(),
  },
  planet: {
    worldPositions: [null, null, null] as (Vector3 | null)[],
    rawOrbitY:      [0, 0, 0],
  },
  ocean: {
    curtainOpacity: 0.90,
  },

  // ── 非sp 驱动写入 ──
  label: {
    ready: false,       // 替代 labelsGateOpen
  },
  pbd: {
    stable: false,      // 替代 _pbdReadyLogged
  },
}
```

两个系统都读写这个对象，消除模块级 import 链。

---

## 五、文件结构

```
src/animation/
├── timeline.ts          ← sp 注册系统 (registerSp / tickSp)
├── sequenceStore.ts     ← 信号状态机 (defineSequence / usePhase / useSignal)
├── animState.ts         ← 共享运行时数据
└── registers/           ← 各组件注册（可选，或内联在组件中）
    ├── oceanWaves.ts
    ├── gridLines.ts
    ├── windChime.ts
    └── ...
```

---

## 六、实施路径

### 阶段 1：timeline.ts + animState.ts（现在）

- [ ] 创建 `src/animation/timeline.ts`（registerSp + tickSp）
- [ ] 创建 `src/animation/animState.ts`（共享状态）
- [ ] 迁移 1 个组件验证（如 OceanWaves）
- [ ] 逐个迁移其余 10 个 sp 驱动组件

**收益：** 所有 sp 阈值集中可见，跨组件数据通过 animState 统一。

### 阶段 2：sequenceStore.ts（后续）

- [ ] 实现 Zustand 状态机基础设施
- [ ] 迁移 Act3 入场序列（替代 labelsGateOpen + pbdReady）
- [ ] 迁移 label shrink 序列

**收益：** 消除 setTimeout 隐式协作，声明式跨组件时序。

### 阶段 3：清理

- [ ] 删除分散的模块级共享变量（`_beamWorldOrigin` 等）
- [ ] 删除 `useWindChime.ts`（归入 timeline 注册）

---

## 七、设计原则

1. **sp 系统只管 sp**——不处理信号、不处理时间
2. **信号系统只管顺序**——不计算进度值、不操作 Three.js 对象
3. **animState 是唯一共享入口**——组件不互相 import
4. **渐进迁移**——每步可独立验证，不破坏现有功能
