# Planet Label — TerminalBar 迁移设计

**日期**: 2026-06-20  
**状态**: 设计中  
**关联**: `src/actors/PlanetLabel.tsx`, `src/terminal/TerminalBar.tsx`, `src/actors/Planets.tsx`, `src/acts/Act3ContentPhase.tsx`

---

## 1. 动机

当前 PlanetLabel 使用 `Canvas 2D → CanvasTexture → Sprite` 方案。希望用 TerminalBar（DOM 组件）替代 Sprite，获得：

- TerminalBar 的完整动画能力（打字机、GSAP Timeline、Slot 系统）
- 统一尺寸（不随相机距离缩放）
- 始终在 Canvas 3D 图层之上（方便交互）
- DOM 层面的富文本和可访问性

### 设计决策摘要（已确认）

| 维度 | 决策 |
|------|------|
| 状态机 | 展示 + 点击进入完整终端（可执行命令） |
| Slot 内容 | Welcome（行星名）+ Section（URL 等描述行） |
| 入场动画 | Act 3 出现 + 完整打字机动画依次播放 |
| 入场排序 | index / simultaneous / proximity 三策略，参数化配置 |
| 点击交互 | 标签点击进入终端模式；行星网格点击保留原逻辑（聚焦/跳转） |
| 锚点位置 | 智能避让 + 三体编排算法 |
| 标签尺寸 | 紧凑模式（默认 160px 宽），展开终端 260px，参数可调 |
| 展开行为 | 原地展开 + 其他标签自动避让 |
| 退出机制 | 超时 15s + Esc + 点击外部 |
| 命令 | 独立命令集：info、focus、open（不与 MainTerminal 合并） |
| 背景 | transparent（无 blur），展开可切换 glass；variant prop 控制 |
| 滚动可见性 | 仅 Act 3（sp > 0.85）可见，通过 opacity 淡入，组件不卸载 |

---

## 2. 架构总览

```
┌─ R3F Canvas (frameloop="demand") ───────────────────────┐
│                                                          │
│  Planets.tsx                                             │
│    useFrame:                                             │
│    ├─ 轨道计算、颜色、大气层（不变）                         │
│    └─ project() _planetWorldPositions[i] → screenCoords ─┼──→ realtimeStore.screenCoords
│                                                          │
│  PlanetClickHandler（不变）                                 │
│    └─ NDC 投射行星球网格 → 首次聚焦 / 二次跳转            │
│                                                          │
└──────────────────────────────────────────────────────────┘
                          │
                          │ Zustand
                          ▼
┌─ React DOM Tree ─────────────────────────────────────────┐
│                                                          │
│  FloatingLabels                                           │
│    ├─ useFloatingLabels(configs, screenCoords, strategy)│
│    │   ├─ 入场排序（index / simultaneous / proximity）    │
│    │   ├─ 锚点避让（三体规避算法）                         │
│    │   └─ 展开退让（collapsed/expanded 状态协调）          │
│    │                                                     │
│    └─ 渲染 3 个 Pill（浮动外壳容器）                       │
│        ├─ position: fixed + transform: translate(x, y)   │
│        ├─ CSS transition（尺寸切换 + 位置切换）            │
│        └─ 内部挂载 TerminalBar                            │
│            ├─ variant="transparent"（紧凑模式）            │
│            ├─ variant="glass"（展开模式）                  │
│            └─ 通过 Slot 声明 Welcome + Section            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `src/actors/FloatingLabels.tsx` | **新增** | 编排容器，管理 3 个 Pill 的生命周期、位置、状态 |
| `src/behaviors/useFloatingLabels.ts` | **新增** | 纯逻辑 hook：入场排序、状态协调、退出管理 |
| `src/behaviors/useAnchorAvoidance.ts` | **新增** | 锚点避让算法（纯函数，可独立测试） |
| `src/behaviors/useScreenProjection.ts` | **新增** | 将 `_planetWorldPositions` 投影到屏幕坐标，写入 store |
| `src/terminal/planetCommands.ts` | **新增** | 行星专属命令：info、focus、open |
| `src/stores/realtimeStore.ts` | **修改** | 新增 `screenCoords: {x, y, visible}[]` slice |
| `src/actors/Planets.tsx` | **修改** | useFrame 中调用 `useScreenProjection` 写入投影坐标 |
| `src/terminal/TerminalBar.tsx` | **修改** | 新增 `variant` prop |
| `src/terminal/TerminalBar.css` | **修改** | 新增 `--tw-variant-*` CSS 变量 |
| `src/acts/Act3ContentPhase.tsx` | **修改** | 移除 3 个 `<PlanetLabel>`，数据准备移交 FloatingLabels |
| `App.tsx` | **修改** | 新增 `#label-overlay` div，挂载 FloatingLabels |
| `src/actors/PlanetLabel.tsx` | **删除** | 被 FloatingLabels 替代 |

---

## 3. Store 变更 + 屏幕投影管线

### 3.1 realtimeStore 新增 slice

```typescript
interface ScreenCoord {
  x: number       // 屏幕像素 X
  y: number       // 屏幕像素 Y
  visible: boolean // NDC.z < 1 且在视口内（±1.2 阈值）
}

// 新增字段
screenCoords: [ScreenCoord, ScreenCoord, ScreenCoord]

// 新增 action
setScreenCoords: (coords: [ScreenCoord, ScreenCoord, ScreenCoord]) => void
```

固定索引对应 `trackIdx: 0→FS, 1→Code, 2→GitHub`。

### 3.2 useScreenProjection hook

```typescript
// src/behaviors/useScreenProjection.ts

import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useRealtimeStore } from '../stores/realtimeStore'

const _ndc = new Vector3()  // 模块级预分配

export function useScreenProjection(worldPositions: (Vector3 | null)[]) {
  const { camera, gl } = useThree()
  const store = useRealtimeStore.getState()

  const project = () => {
    const w = gl.domElement.clientWidth
    const h = gl.domElement.clientHeight
    const coords = [
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
    ] as [ScreenCoord, ScreenCoord, ScreenCoord]

    for (let i = 0; i < 3; i++) {
      const pos = worldPositions[i]
      if (!pos) continue

      _ndc.copy(pos).project(camera)
      const visible =
        _ndc.z < 1 &&
        _ndc.x > -1.2 && _ndc.x < 1.2 &&
        _ndc.y > -1.2 && _ndc.y < 1.2

      if (visible) {
        coords[i] = {
          x: ((_ndc.x + 1) / 2) * w,
          y: ((-_ndc.y + 1) / 2) * h,
          visible: true,
        }
      }
    }

    store.setScreenCoords(coords)
  }

  return { project }
}
```

- NDC → 屏幕：`(ndc + 1) / 2 * viewportSize`，Y 轴翻转（NDC Y 向上，屏幕 Y 向下）
- 可见性阈值 `±1.2` 留 20% 余量，避免边缘闪烁

### 3.3 Planets.tsx 集成

在现有 useFrame 末尾调用 `project()`：

```typescript
// Planets.tsx useFrame 中，发布 planetCoords 之后：
const { project } = useScreenProjection()
project()  // 将 _planetWorldPositions 投影写入 store.screenCoords
```

---

## 4. TerminalBar 变更

### 4.1 variant prop

```typescript
interface TerminalBarProps {
  // ... 现有 props
  variant?: 'glass' | 'transparent' | 'minimal'
}
```

CSS 变量驱动：

```css
/* 默认 = glass */
.terminal-bar {
  --tw-bg-alpha: 0.78;
  --tw-blur: blur(20px) saturate(180%);
  --tw-border-opacity: 0.12;
  background: rgba(15, 23, 42, var(--tw-bg-alpha));
  backdrop-filter: var(--tw-blur);
  border: 1px solid rgba(148, 163, 184, var(--tw-border-opacity));
}

/* variant="transparent" — 无 blur */
.terminal-bar[data-variant="transparent"] {
  --tw-bg-alpha: 0.55;
  --tw-blur: none;
  --tw-border-opacity: 0.10;
}

/* variant="minimal" — 无背景无描边 */
.terminal-bar[data-variant="minimal"] {
  --tw-bg-alpha: 0;
  --tw-blur: none;
  --tw-border-opacity: 0;
}
```

### 4.2 紧凑/展开状态

TerminalBar 不新增 `collapsed` prop。Pill 外壳控制宽度，TerminalBar 自适应：

- **紧凑**（`mode !== 'active'`）：输入行隐藏（现有逻辑），回显区最大 2 行，variant = `transparent`
- **展开**（`mode === 'active'`）：输入行显示，回显区扩展，variant = `glass`

TerminalBar 现有状态机（typing → idle ⇄ active）已经支持此行为。

---

## 5. Pill 外壳

Pill 是 FloatingLabels 内部创建的 DOM 包装器：

```css
.floating-label-pill {
  position: fixed;
  transform: translate(var(--pill-x), var(--pill-y));
  transition: opacity 0.3s, width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  width: 160px;               /* 紧凑模式，参数可调 */
  pointer-events: auto;
  cursor: default;
  opacity: 0.90;
}

.floating-label-pill.expanded {
  width: 260px;               /* 展开模式，参数可调 */
}

.floating-label-pill:hover {
  opacity: 1;
  box-shadow: 0 0 0 1px var(--pill-accent), 0 4px 12px rgba(0, 0, 0, 0.3);
}

.floating-label-pill.expanded:hover {
  box-shadow: 0 0 0 1.5px var(--pill-accent), 0 6px 20px rgba(0, 0, 0, 0.4);
}
```

`--pill-accent` 由 `planetData.accent` 注入：
- FS → `#94a3b8`
- Code → `#0ea5e9`
- GitHub → `#818cf8`

---

## 6. FloatingLabels 编排层

### 6.1 组件接口

```typescript
interface LabelConfig {
  trackIdx: number
  planetLink: PlanetLink
  maxEchoLines: number  // 默认 2
}

interface FloatingLabelsProps {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: 'index' | 'simultaneous' | 'proximity'  // 默认 'proximity'
  staggerDelay?: number           // 默认 800ms
  exitTimeout?: number            // 默认 15000ms
  collapsedWidth?: number         // 默认 160
  expandedWidth?: number          // 默认 260
}
```

### 6.2 模块划分

```
src/behaviors/useFloatingLabels.ts    — 入场排序、退出管理、状态协调
src/behaviors/useAnchorAvoidance.ts   — 锚点避让算法（纯函数）
src/actors/FloatingLabels.tsx         — 渲染容器
```

### 6.3 锚点避让算法

**输入**：3 组 `{ screenCoord, pillSize, preferredAnchor }`  
**输出**：3 组 `{ anchorX, anchorY, offsetDirection }`

**策略**：

```
1. 初始化 — 所有 pill 默认锚点 = 行星屏幕坐标 + 正上方偏移（-35px）

2. 碰撞检测 — 两两检测 pill 矩形是否重叠（10px 容差）

3. 解析碰撞 — 自内向外（trackIdx: 0→1→2）
   对每个碰撞对，将外圈 pill 沿候选方向滑动：
   候选方向优先级：[上, 下, 右, 左]
   每次滑动 step = pill 高度 + 8px
   最多尝试 3 步，若仍无法解决则外圈 pill 跳到视口角落

4. 视口约束 — 检测越界，翻转锚点方向
   若 pill.top < 12：锚点翻到下方
   若 pill.bottom > vh - 12：锚点翻到上方
   若 pill.left < 12：锚点翻到右侧
   若 pill.right > vw - 12：锚点翻到左侧

5. 极端情况 fallback — 3 颗全部重叠时
   依次排列到视口底部，间距 8px
```

**复杂度**：O(3²) = 常数。仅在 screenCoords 或 pill 尺寸变化时重算。

### 6.4 入场排序

| strategy | 行为 |
|----------|------|
| `index` | 按 trackIdx 0→1→2 依次启动打字机，间隔 `staggerDelay` |
| `simultaneous` | 3 个标签同时启动打字机动画 |
| `proximity` | 按行星距屏幕中心的像素距离排序，最近者先播，间隔 `staggerDelay` |

通过 Slot 的 `appearAfter` 机制串联。

### 6.5 展开退让

```
1. 被点击标签：collapsed: false，width 160→260px，variant: 'transparent'→'glass'
2. 其余标签：锚点避让算法重新计算，为展开 Pill 腾出空间
3. CSS transition：位置/尺寸平滑过渡（250ms cubic-bezier）
4. 同时只有一个标签可展开；点击第二个标签时第一个自动退出
```

### 6.6 退出超时

- 展开后开始 15s 倒计时
- 任何输入（按键、命令执行）重置计时器
- 超时后自动退回紧凑模式
- 点击外部区域（Canvas / 其他标签）/ Esc 也触发退出
- 退出后不清屏，保留 echoLines 供下次展开可见

---

## 7. 行星专属命令

```typescript
// src/terminal/planetCommands.ts

function planetCommands(trackIdx: number, link: PlanetLink): CommandEntry[] {
  return [
    {
      name: 'info',
      handler: () => [
        `轨道索引: ${trackIdx}`,
        `标签: ${link.label}`,
        `URL: ${link.url}`,
        `聚焦状态: ${isFocused ? '已聚焦' : '未聚焦'}`,
      ],
    },
    {
      name: 'focus',
      handler: () => {
        store.setFocusedPlanetIdx(planetIdx)
        return [`已聚焦: ${link.label}`]
      },
    },
    {
      name: 'open',
      handler: () => {
        window.open(link.url, '_blank')
        return [`已打开: ${link.url}`]
      },
    },
  ]
}
```

- 命令集独立，不合并 MainTerminal 全局命令
- `exit` 通过 Esc / blur / 超时 / 点击外部触发，不注册为命令

---

## 8. 滚动可见性 + 行星星聚焦

### 8.1 挂载时机

```
scrollProgress < 0.85  → FloatingLabels 未挂载
scrollProgress >= 0.85 → 挂载，容器 opacity 0→1（0.6s ease）

挂载后组件不卸载，再次回退仅靠 opacity 隐藏
防止阈值附近反复滚动导致打字机动画重播
```

### 8.2 聚焦行为

```typescript
// useFloatingLabels 内部
const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
// focusedPlanetIdx >= 0 时，所有 Pill opacity → 0.15 + pointer-events: none
// 聚焦取消后恢复
```

与当前 PlanetLabel 行为一致。

### 8.3 滚动回退

若用户在终端展开模式下向上滚动回 Act 2，所有 Pill 自动退回紧凑模式。

---

## 9. 边界情况

| 场景 | 处理 |
|------|------|
| 行星在屏幕外 | `screenCoord.visible = false`，Pill `opacity: 0` + `pointer-events: none` |
| 行星在相机后方（`ndc.z >= 1`） | 同上 |
| 窗口 resize | debounce 100ms 重算投影坐标 |
| 3 颗行星全部重叠 | 避让 fallback：依次排到视口底部 |
| 快速连续点击不同标签 | 新展开，前一个自动退出（300ms CSS transition 覆盖） |
| 打字机进行中点击 | 跳过打字机，直接显示完整文本，进入终端模式 |
| TerminalBar 内容溢出 | `overflow: hidden` + Scrollable `pinnedToBottom` |
| Portal overlay 遮挡 Canvas | Pill 之外 `pointer-events: none`，Pill 自身 `pointer-events: auto` |

---

## 10. 测试策略

| 层级 | 测试内容 | 工具 |
|------|---------|------|
| 单元 | `useAnchorAvoidance` — 给定坐标，验证输出无碰撞且不越界 | Vitest |
| 单元 | `useScreenProjection` — 给定 NDC，验证屏幕坐标转换 | Vitest |
| 单元 | `planetCommands` — 验证 info / focus / open 输出 | Vitest |
| 集成 | `useFloatingLabels` 入场排序 — 验证 3 种策略排序结果 | Vitest |
| 集成 | Pill 展开/退出往返 — 模拟 click → active → timeout → idle | @testing-library/react |
| 场景 | scrollProgress 阈值 — 模拟穿越 0.85 边界 | @testing-library/react |
| R3F | `useScreenProjection` 在 useFrame 中 store 写入正确 | 已有测试扩展 |

---

## 11. 迁移步骤

```
1. 新增文件（不影响现有功能）
   src/behaviors/useScreenProjection.ts
   src/behaviors/useFloatingLabels.ts
   src/behaviors/useAnchorAvoidance.ts
   src/actors/FloatingLabels.tsx
   src/terminal/planetCommands.ts

2. 修改现有文件
   realtimeStore.ts — 新增 screenCoords slice
   Planets.tsx — useFrame 中调用 useScreenProjection
   TerminalBar.tsx + .css — 新增 variant prop
   App.tsx — 新增 label-overlay div

3. 集成（并行验证）
   Act3ContentPhase.tsx — 替换 PlanetLabel 为 FloatingLabels
   保留 PlanetLabel.tsx 文件但不再使用

4. 验证
   - 视觉对比 PlanetLabel vs FloatingLabels
   - 交互测试：点击 → 终端 → 命令 → 退出
   - 性能对比：启用/禁用 backdrop-filter 的帧率

5. 清理
   PlanetLabel.tsx 删除
   Act3ContentPhase 中删除旧 import
```
