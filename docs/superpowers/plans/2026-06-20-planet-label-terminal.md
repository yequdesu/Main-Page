# Planet Label TerminalBar 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Canvas 2D Sprite PlanetLabel 替换为 DOM 层 TerminalBar 标签，通过 NDC 投影跟随行星位置。

**Architecture:** Planets.tsx useFrame 投影 3D 坐标 → realtimeStore.screenCoords → FloatingLabels 编排层（锚点避让 + 入场排序 + 展开退让）→ 3 个 Pill（position: fixed）→ 内部挂载 TerminalBar（variant prop 控制透明/玻璃效果）。

**Tech Stack:** React 19, Three.js 0.170, Zustand v5, GSAP 3.15, TypeScript 6, Vitest 4

**Spec:** `docs/superpowers/specs/2026-06-20-planet-label-terminal-design.md`

## Global Constraints

- Canvas prop: `flat` + `frameloop="demand"` 不可移除
- 每帧预分配 Vector3/Color，禁止热路径 `new`
- `getState()` 读 Zustand（useFrame 中），不触发 React re-render
- CSS transition 用于 DOM 动画，无 framer-motion
- 项目包管理器 pnpm
- 语言协定：中文注释，代码标识符保持原文

---

### Task 1: realtimeStore — 新增 screenCoords slice

**Files:**
- Modify: `src/stores/realtimeStore.ts`

**Interfaces:**
- Produces: `ScreenCoord { x: number; y: number; visible: boolean }`, `screenCoords: [ScreenCoord, ScreenCoord, ScreenCoord]`, `setScreenCoords(...)`

- [ ] **Step 1: 新增 ScreenCoord 接口和 store 字段**

在 `realtimeStore.ts` 中 `PlanetCoords` 接口后添加：

```typescript
// 在 PlanetCoords 接口之后添加
export interface ScreenCoord {
  /** 屏幕像素 X（行星中心投影） */
  x: number
  /** 屏幕像素 Y */
  y: number
  /** NDC.z < 1 且在视口内（±1.2 margin） */
  visible: boolean
}
```

- [ ] **Step 2: 扩展 RealtimeSlice 和 RealtimeActions**

在 `RealtimeSlice` 接口末尾添加：

```typescript
  /** 行星在屏幕上的投影坐标（trackIdx 0/1/2 → FS/Code/GitHub） */
  screenCoords: [ScreenCoord, ScreenCoord, ScreenCoord]
```

在 `RealtimeActions` 接口末尾添加：

```typescript
  setScreenCoords: (coords: [ScreenCoord, ScreenCoord, ScreenCoord]) => void
```

- [ ] **Step 3: 在 create() 中添加初始值和 action**

在 `create<RealtimeStore>()((set) => ({` 块内，`setDebrisCount` 之前添加：

```typescript
  screenCoords: [
    { x: 0, y: 0, visible: false },
    { x: 0, y: 0, visible: false },
    { x: 0, y: 0, visible: false },
  ],

  setScreenCoords: (coords) => set({ screenCoords: coords }),
```

- [ ] **Step 4: 验证编译**

Run: `pnpm exec tsc --noEmit src/stores/realtimeStore.ts`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/stores/realtimeStore.ts
git commit -m "feat(store): add screenCoords slice to realtimeStore for planet-to-screen projection"
```

---

### Task 2: useAnchorAvoidance — 锚点避让纯函数

**Files:**
- Create: `src/behaviors/useAnchorAvoidance.ts`
- Create: `src/behaviors/__tests__/useAnchorAvoidance.test.ts`

**Interfaces:**
- Produces: `calcAnchorPositions(inputs, viewport, collapsedWidth, expandedWidth) => AnchorResult[]`

- [ ] **Step 1: 编写失败测试**

创建 `src/behaviors/__tests__/useAnchorAvoidance.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { calcAnchorPositions, type AnchorInput, type AnchorResult } from '../useAnchorAvoidance'

const DEFAULT_VP = { width: 1920, height: 1080 }

function makeInput(
  x: number, y: number, visible = true, trackIdx = 0, expanded = false,
): AnchorInput {
  return { screenX: x, screenY: y, visible, trackIdx, expanded }
}

describe('calcAnchorPositions', () => {
  it('returns three results for three inputs', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 400), makeInput(900, 400), makeInput(1300, 400),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    expect(results).toHaveLength(3)
    results.forEach(r => {
      expect(r).toHaveProperty('x')
      expect(r).toHaveProperty('y')
    })
  })

  it('places pill above planet by default', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500), makeInput(900, 500, false), makeInput(1300, 500, false),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    // 默认偏移：行星上方，pill 底部在行星上方 8px
    // pill 高度约 2 * 1.6em + padding ≈ 56px
    const pillH = 60 // approximate
    expect(results[0].y).toBeLessThan(500 - pillH / 2)
  })

  it('returns {0,0} for invisible planets', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500, false), makeInput(900, 500, false), makeInput(1300, 500, false),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    results.forEach(r => {
      expect(r.x).toBe(0)
      expect(r.y).toBe(0)
    })
  })

  it('avoids overlapping pills by shifting outer ones', () => {
    // 三个行星在屏幕同一点，pill 必须不重叠
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500, true, 0), makeInput(500, 500, true, 1), makeInput(500, 500, true, 2),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    // 验证两两不重叠（10px 容差）
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const a = results[i], b = results[j]
        const overlapX = Math.abs(a.x - b.x) < (160 + 10)
        const overlapY = Math.abs(a.y - b.y) < (60 + 10)
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('keeps pills within viewport bounds', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(10, 10, true, 0),     // 左上角
      makeInput(1910, 10, true, 1),   // 右上角
      makeInput(10, 1070, true, 2),   // 左下角
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    results.forEach(r => {
      expect(r.x).toBeGreaterThanOrEqual(12)
      expect(r.x + 160).toBeLessThanOrEqual(1920 - 12)
      expect(r.y).toBeGreaterThanOrEqual(12)
      expect(r.y + 60).toBeLessThanOrEqual(1080 - 12)
    })
  })

  it('expanded pill gets extra space', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500, true, 0, true),  // 展开：260px 宽
      makeInput(500, 500, true, 1),
      makeInput(500, 500, true, 2),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    // 展开 pill 宽度为 260，其余为 160
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const aW = results[i].expanded ? 260 : 160
        const bW = results[j].expanded ? 260 : 160
        const a = results[i], b = results[j]
        const overlapX = Math.abs(a.x - b.x) < (Math.max(aW, bW) + 10)
        const overlapY = Math.abs(a.y - b.y) < (60 + 10)
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/behaviors/__tests__/useAnchorAvoidance.test.ts`
Expected: FAIL — `calcAnchorPositions` 未定义

- [ ] **Step 3: 实现 calcAnchorPositions**

创建 `src/behaviors/useAnchorAvoidance.ts`：

```typescript
/**
 * useAnchorAvoidance — 行星标签锚点避让算法。
 *
 * 输入 3 个行星的屏幕投影坐标，输出 3 个 Pill 的无碰撞屏幕位置。
 * 自内向外（trackIdx: 0→1→2）解析碰撞，外圈 pill 沿候选方向滑动。
 *
 * 援引：碰撞检测 — AABB 矩形重叠检测（游戏开发标准方法）
 */

export interface AnchorInput {
  /** 行星屏幕中心 X */
  screenX: number
  /** 行星屏幕中心 Y */
  screenY: number
  visible: boolean
  trackIdx: number
  /** 此标签是否处于展开模式（宽度更大） */
  expanded?: boolean
}

export interface AnchorResult {
  x: number
  y: number
  /** 标签是否处于展开模式 */
  expanded: boolean
}

interface Viewport {
  width: number
  height: number
}

/** Pill 估算高度（2 行 × 1.6em × fontSize 0.62rem + padding） */
const PILL_HEIGHT = 60
/** 默认锚点偏移（行星中心上方距离） */
const DEFAULT_OFFSET_Y = -35
/** 视口 margin */
const VP_MARGIN = 12
/** 碰撞容差 */
const COLLISION_TOLERANCE = 10
/** 候选滑动方向优先级 */
const CANDIDATE_DIRECTIONS: [number, number][] = [
  [0, -1],  // 上
  [0, 1],   // 下
  [1, 0],   // 右
  [-1, 0],  // 左
]
/** 每次滑动步长（px） */
const SLIDE_STEP = 68
/** 最大滑动步数 */
const MAX_SLIDES = 3

function pillRect(x: number, y: number, width: number): { left: number; right: number; top: number; bottom: number } {
  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + PILL_HEIGHT,
  }
}

function overlaps(a: ReturnType<typeof pillRect>, b: ReturnType<typeof pillRect>): boolean {
  return (
    a.left < b.right + COLLISION_TOLERANCE &&
    a.right > b.left - COLLISION_TOLERANCE &&
    a.top < b.bottom + COLLISION_TOLERANCE &&
    a.bottom > b.top - COLLISION_TOLERANCE
  )
}

function clampToViewport(x: number, y: number, width: number, vp: Viewport): { x: number; y: number } {
  return {
    x: Math.max(VP_MARGIN, Math.min(vp.width - width - VP_MARGIN, x)),
    y: Math.max(VP_MARGIN, Math.min(vp.height - PILL_HEIGHT - VP_MARGIN, y)),
  }
}

/**
 * 计算 3 个 Pill 的无碰撞屏幕位置。
 *
 * @param inputs       — 3 个行星的投影坐标
 * @param viewport     — 当前视口尺寸
 * @param collapsedW   — 紧凑模式 Pill 宽度
 * @param expandedW    — 展开模式 Pill 宽度
 * @returns 3 个 AnchorResult（按 trackIdx 索引）
 */
export function calcAnchorPositions(
  inputs: [AnchorInput, AnchorInput, AnchorInput],
  viewport: Viewport,
  collapsedW: number,
  expandedW: number,
): [AnchorResult, AnchorResult, AnchorResult] {
  // 初始位置：行星中心 + 正上方偏移
  const results: (AnchorResult & { _width: number })[] = inputs.map((inp, i) => {
    const w = inp.expanded ? expandedW : collapsedW
    return {
      x: inp.screenX - w / 2,
      y: inp.screenY + DEFAULT_OFFSET_Y - PILL_HEIGHT / 2,
      expanded: inp.expanded ?? false,
      _width: w,
    }
  })

  // 不可见的标签不参与避让
  const active = inputs.map((inp) => inp.visible)

  // 自内向外解析碰撞（trackIdx 0 优先级最高）
  const resolveOrder = [0, 1, 2]

  for (let tries = 0; tries < MAX_SLIDES; tries++) {
    let hasCollision = false

    for (const i of resolveOrder) {
      if (!active[i]) continue
      for (const j of resolveOrder) {
        if (i >= j || !active[j]) continue
        const ri = results[i], rj = results[j]
        if (overlaps(pillRect(ri.x, ri.y, ri._width), pillRect(rj.x, rj.y, rj._width))) {
          hasCollision = true
          // 将外圈（trackIdx 更大）的 pill 沿候选方向滑动
          const outer = i > j ? i : j
          const _inner = i > j ? j : i
          const dirIdx = tries % CANDIDATE_DIRECTIONS.length
          const [dx, dy] = CANDIDATE_DIRECTIONS[dirIdx]
          results[outer].x += dx * SLIDE_STEP
          results[outer].y += dy * SLIDE_STEP
        }
      }
    }

    if (!hasCollision) break
  }

  // 最终检查：若外圈 pill 仍有碰撞，推到视口角落
  for (const i of resolveOrder) {
    if (!active[i]) continue
    for (const j of resolveOrder) {
      if (i >= j || !active[j]) continue
      if (overlaps(pillRect(results[i].x, results[i].y, results[i]._width), pillRect(results[j].x, results[j].y, results[j]._width))) {
        // fallback：外圈 pill 推到视口底部排列
        const outer = i > j ? i : j
        results[outer].x = VP_MARGIN + outer * (collapsedW + 8)
        results[outer].y = viewport.height - PILL_HEIGHT - VP_MARGIN
      }
    }
  }

  // 视口约束 + 不可见归零
  for (let i = 0; i < 3; i++) {
    if (!active[i]) {
      results[i].x = 0
      results[i].y = 0
      continue
    }
    const clamped = clampToViewport(results[i].x, results[i].y, results[i]._width, viewport)
    results[i].x = clamped.x
    results[i].y = clamped.y
  }

  return results.map(r => ({ x: r.x, y: r.y, expanded: r.expanded })) as [AnchorResult, AnchorResult, AnchorResult]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/behaviors/__tests__/useAnchorAvoidance.test.ts`
Expected: 全部 6 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add src/behaviors/useAnchorAvoidance.ts src/behaviors/__tests__/useAnchorAvoidance.test.ts
git commit -m "feat(behavior): add useAnchorAvoidance — collision-free pill positioning algorithm"
```

---

### Task 3: TerminalBar — variant prop + CSS

**Files:**
- Modify: `src/terminal/TerminalBar.tsx`
- Modify: `src/terminal/TerminalBar.css`

**Interfaces:**
- Produces: `TerminalBarProps.variant?: 'glass' | 'transparent' | 'minimal'`

- [ ] **Step 1: 在 TerminalBarProps 中添加 variant**

在 `src/terminal/TerminalBar.tsx` 的 `TerminalBarProps` 接口中添加：

```typescript
  /** 视觉变体 — glass（默认，毛玻璃）/ transparent（半透明无 blur）/ minimal（无背景） */
  variant?: 'glass' | 'transparent' | 'minimal'
```

- [ ] **Step 2: 解构 variant 并传递到 data 属性**

在 `TerminalBar` 函数体内解构（`const { layout: L } = props` 行附近添加）：

```typescript
  const variant = props.variant ?? 'glass'
```

在外层 `<div className="terminal-bar">` 上添加 `data-variant`：

```tsx
    <div
      className={`terminal-bar${props.className ? ' ' + props.className : ''}`}
      data-variant={variant}
      style={{ ... }}
```

完整修改位置为约 L181：

```tsx
    <div
      className={`terminal-bar${props.className ? ' ' + props.className : ''}`}
      data-variant={variant}
      style={{
```

- [ ] **Step 3: 在 CSS 中添加 variant 样式**

在 `src/terminal/TerminalBar.css` 的 `.terminal-bar-inner` 块后面添加：

```css
/* ---- Variant: transparent — 半透明无 blur ---- */
.terminal-bar[data-variant="transparent"] .terminal-bar-inner {
  --tw-variant-bg: rgba(15, 23, 42, 0.55);
  --tw-variant-blur: none;
  --tw-variant-saturate: none;
  background: var(--tw-variant-bg, rgba(15, 20, 35, 0.05));
  backdrop-filter: var(--tw-variant-blur, blur(20px) saturate(180%));
  -webkit-backdrop-filter: var(--tw-variant-blur, blur(20px) saturate(180%));
  border: 1px solid rgba(148, 163, 184, 0.10);
}

/* ---- Variant: minimal — 无背景无描边 ---- */
.terminal-bar[data-variant="minimal"] .terminal-bar-inner {
  --tw-variant-bg: transparent;
  --tw-variant-blur: none;
  --tw-variant-saturate: none;
  background: var(--tw-variant-bg);
  backdrop-filter: var(--tw-variant-blur, blur(20px) saturate(180%));
  -webkit-backdrop-filter: var(--tw-variant-blur, blur(20px) saturate(180%));
  border: none;
  box-shadow: none;
}

.terminal-bar[data-variant="minimal"] .terminal-bar-inner:hover,
.terminal-bar[data-variant="minimal"] .terminal-bar-inner.active {
  box-shadow: none;
}
```

- [ ] **Step 4: 验证编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/terminal/TerminalBar.tsx src/terminal/TerminalBar.css
git commit -m "feat(terminal): add variant prop (glass/transparent/minimal) to TerminalBar"
```

---

### Task 4: planetCommands — 行星专属命令

**Files:**
- Create: `src/terminal/planetCommands.ts`
- Create: `src/terminal/__tests__/planetCommands.test.ts`

**Interfaces:**
- Produces: `createPlanetCommandHandler(trackIdx, link) => (input: string) => string`

- [ ] **Step 1: 编写失败测试**

创建 `src/terminal/__tests__/planetCommands.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPlanetCommandHandler } from '../planetCommands'
import type { PlanetLink } from '../../types'

// mock useScrollStore
vi.mock('../../stores/scrollStore', () => ({
  useScrollStore: {
    getState: vi.fn(() => ({
      focusedPlanetIdx: -1,
      setFocusedPlanetIdx: vi.fn(),
    })),
  },
}))

// mock _mainPlanetIndices from Planets
vi.mock('../../actors/Planets', () => ({
  _mainPlanetIndices: [10, 25, 50],
}))

const link: PlanetLink = { label: 'FS', accent: '#94a3b8', url: 'https://fs.yequdesu.top' }

describe('createPlanetCommandHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns info for "info" command', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('info')
    expect(result).toContain('FS')
    expect(result).toContain('https://fs.yequdesu.top')
    expect(result).toContain('轨道索引')
  })

  it('returns focus confirmation for "focus" command', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('focus')
    expect(result).toContain('已聚焦')
    expect(result).toContain('FS')
  })

  it('returns open confirmation for "open" command', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('open')
    expect(result).toContain('已打开')
    expect(openSpy).toHaveBeenCalledWith('https://fs.yequdesu.top', '_blank')
    openSpy.mockRestore()
  })

  it('returns error for unknown command', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('unknown')
    expect(result).toContain('command not found')
    expect(result).toContain('info')
    expect(result).toContain('focus')
    expect(result).toContain('open')
  })

  it('trims whitespace from input', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('  info  ')
    expect(result).toContain('FS')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/terminal/__tests__/planetCommands.test.ts`
Expected: FAIL — `createPlanetCommandHandler` 未定义

- [ ] **Step 3: 实现 createPlanetCommandHandler**

创建 `src/terminal/planetCommands.ts`：

```typescript
import { useScrollStore } from '../stores/scrollStore'
import { _mainPlanetIndices } from '../actors/Planets'
import type { PlanetLink } from '../types'

/**
 * 行星标签终端命令处理器。
 *
 * 独立命令集（不与 MainTerminal 全局命令合并）：
 *   info  — 显示轨道索引、标签名、URL、聚焦状态
 *   focus — 聚焦当前行星
 *   open  — 在新标签页打开行星链接
 *
 * 返回 TerminalBarCommandConfig.onCommand 兼容的回调。
 */
export function createPlanetCommandHandler(
  trackIdx: number,
  link: PlanetLink,
): (input: string) => string {
  return (input: string): string => {
    const trimmed = input.trim()
    if (!trimmed) return ''

    switch (trimmed) {
      case 'info': {
        const store = useScrollStore.getState()
        const planetIdx = _mainPlanetIndices[trackIdx]
        // planetIdx 可能是 undefined（尚未初始化）
        const isFocused = planetIdx !== undefined && store.focusedPlanetIdx === planetIdx
        return [
          `轨道索引: ${trackIdx}`,
          `标签: ${link.label}`,
          `URL: ${link.url}`,
          `聚焦状态: ${isFocused ? '已聚焦' : '未聚焦'}`,
        ].join('\n')
      }

      case 'focus': {
        const store = useScrollStore.getState()
        const planetIdx = _mainPlanetIndices[trackIdx]
        if (planetIdx !== undefined) {
          store.setFocusedPlanetIdx(planetIdx)
        }
        return `已聚焦: ${link.label}`
      }

      case 'open': {
        window.open(link.url, '_blank')
        return `已打开: ${link.url}`
      }

      default:
        return `command not found: ${trimmed}\n可用命令: info, focus, open`
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/terminal/__tests__/planetCommands.test.ts`
Expected: 全部 5 个测试 PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/planetCommands.ts src/terminal/__tests__/planetCommands.test.ts
git commit -m "feat(terminal): add planetCommands — info/focus/open for planet label terminals"
```

---

### Task 5: useScreenProjection — 3D→2D 投影 hook

**Files:**
- Create: `src/behaviors/useScreenProjection.ts`

**Interfaces:**
- Consumes: `_planetWorldPositions: (Vector3 | null)[]`（从 Planets.tsx 导入）
- Consumes: `useThree()` 的 camera 和 gl
- Produces: `project()` 函数，写入 `realtimeStore.setScreenCoords()`

- [ ] **Step 1: 实现 useScreenProjection**

创建 `src/behaviors/useScreenProjection.ts`：

```typescript
import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useRealtimeStore, type ScreenCoord } from '../stores/realtimeStore'

/**
 * useScreenProjection — 将 _planetWorldPositions 投影到屏幕坐标。
 *
 * 在 Planets.tsx 的 useFrame 中调用 project()。
 * 每帧 3 次 Vector3.project()，模块级预分配 _ndc，无额外堆分配。
 *
 * 援引：Three.js Vector3.project() — 官方 API
 */

const _ndc = new Vector3()

export function useScreenProjection(worldPositions: (Vector3 | null)[]) {
  const { camera, gl } = useThree()
  const store = useRealtimeStore.getState

  const project = () => {
    const w = gl.domElement.clientWidth
    const h = gl.domElement.clientHeight

    const coords: [ScreenCoord, ScreenCoord, ScreenCoord] = [
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
    ]

    for (let i = 0; i < 3; i++) {
      const pos = worldPositions[i]
      if (!pos) continue

      _ndc.copy(pos).project(camera)

      // NDC.z < 1 表示在相机前方；±1.2 margin 避免边缘闪烁
      const visible =
        _ndc.z < 1 &&
        _ndc.x > -1.2 && _ndc.x < 1.2 &&
        _ndc.y > -1.2 && _ndc.y < 1.2

      if (visible) {
        coords[i] = {
          // NDC [-1,1] → 屏幕像素 [0, viewportSize]
          x: ((_ndc.x + 1) / 2) * w,
          // NDC Y 向上，屏幕 Y 向下 → 翻转
          y: ((-_ndc.y + 1) / 2) * h,
          visible: true,
        }
      }
    }

    store().setScreenCoords(coords)
  }

  return { project }
}
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc --noEmit src/behaviors/useScreenProjection.ts`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/behaviors/useScreenProjection.ts
git commit -m "feat(behavior): add useScreenProjection — NDC projection of planet world positions to screen coords"
```

---

### Task 6: useFloatingLabels — 编排逻辑 hook

**Files:**
- Create: `src/behaviors/useFloatingLabels.ts`

**Interfaces:**
- Consumes: `LabelConfig[]`, `FloatingLabelsOptions`, store.screenCoords, store.scrollProgress, store.focusedPlanetIdx
- Consumes: `calcAnchorPositions` from useAnchorAvoidance
- Produces: `{ labels: LabelState[], handlePillClick(trackIdx), activeTrackIdx }`

- [ ] **Step 1: 实现 useFloatingLabels**

创建 `src/behaviors/useFloatingLabels.ts`：

```typescript
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { calcAnchorPositions, type AnchorInput, type AnchorResult } from './useAnchorAvoidance'
import type { ScreenCoord } from '../stores/realtimeStore'
import type { PlanetLink } from '../types'

/**
 * useFloatingLabels — 行星标签编排逻辑。
 *
 * 管理 3 个标签的：入场排序 + 锚点位置 + 展开/收起状态 + 退出超时。
 * 消费 realtimeStore.screenCoords，产出每个标签的 CSS 定位数据和状态。
 *
 * 援引：React Hooks 组合模式 — 逻辑与视图分离
 */

export type SequenceStrategy = 'index' | 'simultaneous' | 'proximity'

export interface LabelConfig {
  trackIdx: number
  planetLink: PlanetLink
  maxEchoLines: number
}

export interface LabelState {
  trackIdx: number
  config: LabelConfig
  /** Pill 屏幕 X（左上角） */
  x: number
  /** Pill 屏幕 Y（左上角） */
  y: number
  visible: boolean
  collapsed: boolean
  /** Welcome Slot 的延迟（ms），由入场排序计算 */
  typewriterDelay: number
}

interface FloatingLabelsOptions {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: SequenceStrategy
  staggerDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
}

export function useFloatingLabels(
  options: FloatingLabelsOptions,
  /** 当前帧的 screenCoords（由 FloatingLabels 组件通过 Zustand selector 订阅传入） */
  screenCoords: [ScreenCoord, ScreenCoord, ScreenCoord],
  /** 是否有行星被聚焦 */
  isAnyFocused: boolean,
) {
  const {
    configs,
    sequenceStrategy = 'proximity',
    staggerDelay = 800,
    exitTimeout = 15000,
    collapsedWidth = 160,
    expandedWidth = 260,
  } = options

  const [activeTrackIdx, setActiveTrackIdx] = useState(-1)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight })
  // 缓存入场排序结果（仅首次计算，不随 screenCoords 变化）
  const entryOrderRef = useRef<number[] | null>(null)

  // ---- 入场排序：计算每个标签的 typewriter 延迟（仅首次） ----
  const typewriterDelays = useMemo(() => {
    const delays = [800, 800, 800]

    if (sequenceStrategy === 'index') {
      delays[0] = 800
      delays[1] = 800 + staggerDelay
      delays[2] = 800 + staggerDelay * 2
      entryOrderRef.current = [0, 1, 2]
    } else if (sequenceStrategy === 'simultaneous') {
      entryOrderRef.current = [0, 1, 2]
    } else if (sequenceStrategy === 'proximity') {
      const cx = viewportRef.current.width / 2
      const cy = viewportRef.current.height / 2
      const indexed = configs.map((cfg, i) => {
        const c = screenCoords[i]
        const dist = c.visible
          ? Math.hypot(c.x - cx, c.y - cy)
          : Infinity
        return { i, dist }
      })
      indexed.sort((a, b) => a.dist - b.dist)
      entryOrderRef.current = indexed.map(x => x.i)
      indexed.forEach(({ i }, rank) => {
        delays[i] = 800 + rank * staggerDelay
      })
    }

    return delays
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceStrategy, staggerDelay]) // 仅策略变更时重算，不依赖 screenCoords

  // ---- 锚点计算（使用传入的 screenCoords，每次渲染重算） ----
  const anchorResults: [AnchorResult, AnchorResult, AnchorResult] = (() => {
    const inputs = configs.map((cfg, i) => ({
      screenX: screenCoords[i].x,
      screenY: screenCoords[i].y,
      visible: screenCoords[i].visible,
      trackIdx: i,
      expanded: activeTrackIdx === i,
    })) as [AnchorInput, AnchorInput, AnchorInput]

    return calcAnchorPositions(inputs, viewportRef.current, collapsedWidth, expandedWidth)
  })()

  // ---- 退出超时管理 ----
  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }, [])

  const resetExitTimer = useCallback(() => {
    clearExitTimer()
    exitTimerRef.current = setTimeout(() => {
      setActiveTrackIdx(-1)
    }, exitTimeout)
  }, [exitTimeout, clearExitTimer])

  const handlePillClick = useCallback((trackIdx: number) => {
    if (activeTrackIdx === trackIdx) {
      // 再次点击同一标签 → 退出
      setActiveTrackIdx(-1)
      clearExitTimer()
    } else {
      setActiveTrackIdx(trackIdx)
      resetExitTimer()
    }
  }, [activeTrackIdx, resetExitTimer, clearExitTimer])

  // 外部点击 / Esc 退出
  const handleExternalDismiss = useCallback(() => {
    setActiveTrackIdx(-1)
    clearExitTimer()
  }, [clearExitTimer])

  // 构建 labels 数组（计算值，由 FloatingLabels 在渲染中调用）
  const labels = (() => {
    return configs.map((cfg, i): LabelState => ({
      trackIdx: i,
      config: cfg,
      x: anchorResults[i].x,
      y: anchorResults[i].y,
      visible: screenCoords[i].visible && !isAnyFocused,
      collapsed: activeTrackIdx !== i,
      typewriterDelay: typewriterDelays[i],
    }))
  })()

  // ---- resize 处理 ----
  useEffect(() => {
    const onResize = () => {
      viewportRef.current = { width: window.innerWidth, height: window.innerHeight }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ---- 清理 ----
  useEffect(() => {
    return () => clearExitTimer()
  }, [clearExitTimer])

  return {
    labels,
    activeTrackIdx,
    handlePillClick,
    handleExternalDismiss,
    /** 输入任意键时重置退出计时器 */
    resetExitTimer,
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc --noEmit src/behaviors/useFloatingLabels.ts`
Expected: 无类型错误（需要 Task 1、2 已完成）

- [ ] **Step 3: Commit**

```bash
git add src/behaviors/useFloatingLabels.ts
git commit -m "feat(behavior): add useFloatingLabels — label orchestration with entry sequencing and exit timeout"
```

---

### Task 7: FloatingLabels — 渲染组件

**Files:**
- Create: `src/actors/FloatingLabels.tsx`
- Create: `src/actors/FloatingLabels.css`

**Interfaces:**
- Consumes: `useFloatingLabels`, `TerminalBar`, `createPlanetCommandHandler`
- Produces: React 组件（渲染 3 个 Pill + TerminalBar）

- [ ] **Step 1: 创建 FloatingLabels CSS**

创建 `src/actors/FloatingLabels.css`：

```css
/* ============================================================
   FloatingLabels — Planet Label Pill containers
   ============================================================ */

.floating-labels-container {
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}

.floating-label-pill {
  position: fixed;
  pointer-events: auto;
  cursor: default;
  opacity: 0.90;
  transition: opacity 0.3s ease,
              width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s ease;
}

.floating-label-pill:hover {
  opacity: 1;
  box-shadow: 0 0 0 1px var(--pill-accent), 0 4px 12px rgba(0, 0, 0, 0.3);
}

.floating-label-pill.expanded:hover {
  box-shadow: 0 0 0 1.5px var(--pill-accent), 0 6px 20px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 2: 实现 FloatingLabels 组件**

创建 `src/actors/FloatingLabels.tsx`：

```typescript
import { memo } from 'react'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useScrollStore } from '../stores/scrollStore'
import TerminalBar from '../terminal/TerminalBar'
import { createPlanetCommandHandler } from '../terminal/planetCommands'
import { useFloatingLabels, type SequenceStrategy, type LabelConfig } from '../behaviors/useFloatingLabels'
import type { PlanetLink } from '../types'
import './FloatingLabels.css'

/**
 * FloatingLabels — 行星标签 DOM 编排容器。
 *
 * 通过 useFloatingLabels 管理 3 个 Pill 的位置、状态、动画编排。
 * 每个 Pill 内部挂载 TerminalBar，通过 Slot 声明 Welcome + Section。
 * 订阅 realtimeStore.screenCoords（每帧更新）驱动 Pill 位置。
 *
 * 援引：R3F + HTML Overlay 混合渲染（Three.js 社区常见模式）
 */

interface FloatingLabelsProps {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: SequenceStrategy
  staggerDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
}

const FloatingLabels = memo(function FloatingLabels(props: FloatingLabelsProps) {
  const {
    configs,
    sequenceStrategy,
    staggerDelay,
    exitTimeout,
    collapsedWidth = 160,
    expandedWidth = 260,
  } = props

  // 订阅 screenCoords（每帧由 Planets.useFrame 写入）和聚焦状态
  const screenCoords = useRealtimeStore(s => s.screenCoords)
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const isAnyFocused = focusedPlanetIdx >= 0

  const {
    labels,
    activeTrackIdx,
    handlePillClick,
    handleExternalDismiss,
    resetExitTimer,
  } = useFloatingLabels(
    {
      configs,
      sequenceStrategy,
      staggerDelay,
      exitTimeout,
      collapsedWidth,
      expandedWidth,
    },
    screenCoords,
    isAnyFocused,
  )

  return (
    <div className="floating-labels-container">
      {labels.map((label) => {
        const isExpanded = activeTrackIdx === label.trackIdx
        const width = isExpanded ? expandedWidth : collapsedWidth

        return (
          <div
            key={label.trackIdx}
            className={`floating-label-pill${isExpanded ? ' expanded' : ''}`}
            style={{
              '--pill-accent': label.config.planetLink.accent,
              transform: `translate(${label.x}px, ${label.y}px)`,
              width: `${width}px`,
              opacity: label.visible ? undefined : 0,
              zIndex: isExpanded ? 11 : 10,
            } as React.CSSProperties}
            onClick={(e) => {
              e.stopPropagation()
              handlePillClick(label.trackIdx)
            }}
          >
            <TerminalBar
              layout={{
                maxEchoLines: label.config.maxEchoLines,
                maxWidth: '100%',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '0.62rem',
                fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
                zIndex: 10,
              }}
              variant={isExpanded ? 'glass' : 'transparent'}
              state={{
                mode: isExpanded ? undefined : 'idle',
                onModeChange: (mode) => {
                  if (mode === 'active' && !isExpanded) {
                    handlePillClick(label.trackIdx)
                  }
                },
              }}
              commands={{
                onCommand: createPlanetCommandHandler(
                  label.trackIdx,
                  label.config.planetLink,
                ),
                onPlayEcho: undefined, // 使用 Slot Section 输出
              }}
              behavior={{
                activationMode: 'click',
                blurTimeout: 100,
              }}
              onThemeUpdate={undefined}
            >
              <TerminalBar.Welcome
                delay={label.typewriterDelay}
                charInterval={40}
                exitGap={1200}
              >
                {label.config.planetLink.label}
              </TerminalBar.Welcome>

              <TerminalBar.Section
                rows="lineByLine"
                rowInterval={150}
                appearAfter="welcome"
              >
                {label.config.planetLink.url}
              </TerminalBar.Section>
            </TerminalBar>
          </div>
        )
      })}

      {/* 点击外部区域退出 */}
      {activeTrackIdx >= 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9,
            pointerEvents: 'auto',
          }}
          onClick={() => {
            handleExternalDismiss()
          }}
        />
      )}
    </div>
  )
})

export default FloatingLabels
export type { FloatingLabelsProps, LabelConfig, SequenceStrategy }
```

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误（需要所有前序任务已完成）

- [ ] **Step 4: Commit**

```bash
git add src/actors/FloatingLabels.tsx src/actors/FloatingLabels.css
git commit -m "feat(actors): add FloatingLabels — DOM overlay container for planet label TerminalBars"
```

---

### Task 8: Planets.tsx 集成 — 调用 useScreenProjection

**Files:**
- Modify: `src/actors/Planets.tsx`

- [ ] **Step 1: 在 Planets.tsx 中集成 useScreenProjection**

在 `Planets.tsx` 顶部 import：

```typescript
import { useScreenProjection } from '../behaviors/useScreenProjection'
```

在 `Planets` 函数体内，`useFrame` 调用之前添加：

```typescript
  const { project } = useScreenProjection(_planetWorldPositions)
```

在 `useFrame` 回调中，发布 planetCoords 到 store 之后（约 L327 `store.setPlanetData(...)` 之后）追加：

```typescript
      // 投影行星世界坐标到屏幕坐标（供 FloatingLabels 消费）
      project()
```

具体位置：在 `useFrame` 回调的 for 循环结束后、hover detection 之前。当前代码约 L367 处：

```typescript
    // ---- Hover detection ----
    const hoverResult = calcScreenSpaceHover(
```

在 `}` 之后、hover detection 之前插入 `project()`：

```typescript
    }

    // 投影到屏幕坐标
    project()

    // ---- Hover detection ----
    const hoverResult = calcScreenSpaceHover(
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/actors/Planets.tsx
git commit -m "feat(planets): integrate useScreenProjection in useFrame for FloatingLabels"
```

---

### Task 9: App.tsx + Act3ContentPhase 集成

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/acts/Act3ContentPhase.tsx`

- [ ] **Step 1: 修改 Act3ContentPhase — 移除 PlanetLabel，准备 FloatingLabels 数据**

在 `src/acts/Act3ContentPhase.tsx` 中：

移除 PlanetLabel 相关 import（约 L6-7）：

```typescript
// 删除这两行：
// import PlanetLabel from '../actors/PlanetLabel'
// import { _planetWorldPositions, _mainPlanetIndices } from '../actors/Planets'
```

移除 `getPositionByTrackIdx` callback（约 L35-37）：

```typescript
// 删除：
// const getPositionByTrackIdx = useCallback((trackIdx: number): Vector3 | null => {
//   return _planetWorldPositions[trackIdx] || null
// }, [])
```

移除渲染中的 3 个 `<PlanetLabel>`（约 L60-67）：

```typescript
// 删除：
// {PLANET_LINKS.map((link, i) => (
//   <PlanetLabel
//     key={`label-${i}`}
//     trackIdx={i}
//     planetData={link}
//     getWorldPosition={getPositionByTrackIdx}
//   />
// ))}
```

最终 Act3ContentPhase 返回保持不变（只有 OrbitRings + CentralStar，无标签元素）：

```tsx
  return (
    <group visible={visible}>
      <OrbitRings />
      <CentralStar />
    </group>
  )
```

清理不再需要的 import：`useCallback` 可移除（如果 `getPlanetPosition` 仍被 camera focus 使用则保留），`Vector3` 可移除（如果不再使用），`PLANET_LINKS` 移除。

- [ ] **Step 2: 修改 App.tsx — 添加 FloatingLabels**

在 `App.tsx` 顶部添加 import：

```typescript
import FloatingLabels from './actors/FloatingLabels'
import { PLANET_LINKS } from './types'
import type { LabelConfig, SequenceStrategy } from './actors/FloatingLabels'
```

在 `handleCommand` 之后添加 `labelConfigs` 常量：

```typescript
const labelConfigs: [LabelConfig, LabelConfig, LabelConfig] = PLANET_LINKS.map(
  (link, i) => ({
    trackIdx: i as 0 | 1 | 2,
    planetLink: link,
    maxEchoLines: 2,
  }),
) as [LabelConfig, LabelConfig, LabelConfig]
```

在 JSX 中，`{needsAct3(sp) && <InfoPanelTerminal />}` 之后添加 FloatingLabels：

```tsx
      {/* Planet Labels — 仅 Act 3 可见，组件不卸载 */}
      {needsAct3(sp) && (
        <FloatingLabels
          configs={labelConfigs}
          sequenceStrategy="proximity"
          staggerDelay={800}
          exitTimeout={15000}
          collapsedWidth={160}
          expandedWidth={260}
        />
      )}
```

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/acts/Act3ContentPhase.tsx
git commit -m "feat(app): integrate FloatingLabels in App.tsx, remove PlanetLabel from Act3ContentPhase"
```

---

### Task 10: 清理 PlanetLabel + 最终验证

**Files:**
- Delete: `src/actors/PlanetLabel.tsx`
- 检查: `src/acts/Act3ContentPhase.tsx`（确认无残留 import）
- 检查: 无其他文件引用 `PlanetLabel`

- [ ] **Step 1: 确认无残留引用**

Run: `grep -r "PlanetLabel" src/ --include="*.ts" --include="*.tsx"`
Expected: 无输出（或仅在注释中）

- [ ] **Step 2: 删除 PlanetLabel.tsx**

```bash
git rm src/actors/PlanetLabel.tsx
```

- [ ] **Step 3: 全量编译和类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 运行全部现有测试**

Run: `pnpm test run`
Expected: 全部测试 PASS（新增测试 + 现有测试）

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove deprecated PlanetLabel, replaced by FloatingLabels"
```

---

### Task 11: 端到端验证清单

- [ ] **视觉验证**：`pnpm dev` 启动，滚动到 Act 3，确认 3 个标签出现且跟随行星
- [ ] **打字机动画**：3 个标签依次逐字输出行星名，proximity 策略下就近先播
- [ ] **悬停效果**：悬停 Pill 显示 accent 色发光边框
- [ ] **点击展开**：点击标签进入终端模式，Pill 宽度 160→260px，variant transparent→glass
- [ ] **命令执行**：输入 `info` / `focus` / `open` 确认输出正确
- [ ] **退出机制**：Esc / 点击外部 / 15s 超时 → 退回紧凑模式
- [ ] **锚点避让**：3 个行星接近时标签不重叠
- [ ] **聚焦淡化**：通过 PlanetClickHandler 点击行星网格 → 3 个标签淡出
- [ ] **滚动回退**：向上滚回 Act 2，标签淡出；再滚到 Act 3，标签恢复（不重播打字机）
- [ ] **性能**：DevTools Performance 面板确认无 layout thrashing，帧率稳定
