# PBD 行星标签布局系统 — 设计文档

**日期**: 2026-06-21  
**状态**: 稳定版 v1  
**关联**: `src/behaviors/usePBDLayout.ts`, `src/behaviors/useFloatingLabels.ts`, `src/actors/FloatingLabels.tsx`, `src/actors/PlanetLabelDebug.tsx`

---

## 1. 问题定义

行星标签（TerminalBar pill）需要在屏幕空间中跟随对应的 3D 行星，同时满足几何约束：不遮挡行星、不遮挡中央恒星、不超出视口、彼此不重叠。行星持续移动，标签布局必须帧间平滑连续。

传统 CMLP（Cartographic Map Label Placement）对此类**连续时间约束满足问题**不适应——其离散角度搜索导致帧间跳变和边界条件抖动。

## 2. 架构决策

采用**连续时间约束动力学**替代离散搜索。核心思想：将标签视为有惯性、速度、加速度的物理对象，约束不作为硬性位置修正，而作为作用于加速度的力。

```
┌─────────── rAF 循环 (60fps) ───────────────────────┐
│                                                     │
│  1. 从 Zustand getState() 读取最新行星屏幕坐标      │
│     screenCoords, planetScreenRadii, centralStar    │
│                                                     │
│  2. 计算 shadow target（背向恒星方向）               │
│     target = planetPos + normalize(P − S) × (pr + gap) │
│     + per-label 相位偏移 (-spread° / 0° / +spread°)  │
│                                                     │
│  3. stepPBD(dt):                                    │
│     Stage 1 — 速度前馈 + 位置修正                   │
│     Stage 2 — 6 类约束投影（迭代 ×5）               │
│     Stage 3 — 位置积分                              │
│                                                     │
│  4. 浅比较 → 仅位置变化 >0.5px 时触发 React re-render│
└─────────────────────────────────────────────────────┘
```

### 为什么不用 PBD 原始位置投影

Müller et al. (2007) 的 PBD 对每个约束直接修改位置 `x += Δx`，对布料/绳索等严格约束必要。但标签间轻微重叠在视觉上不可感知，硬位置修正反而在边界条件上产生高频振荡。我们将 A/A2/E 三个约束升级为力驱动（修改速度而非位置），仅保留 B/C/D 的位置投影（低频触发）。

## 3. 约束体系

| 约束 | 驱动方式 | 触发条件 | 参数 |
|------|---------|---------|------|
| A. 锚点向心 | 力 (v+=accel) | anchors 越出 anchorRangeRadius | ANCHOR_STIFFNESS=25 |
| A2. 近距排斥 | 力 (v+=accel) | center 侵入 planet 视觉圆外 10px | CLOSE_REPEL_STIFFNESS=400, MARGIN=10 |
| B. 行星遮挡 | 位置 (pos+=push) | center 进入任意行星视觉圆 | PLANET_AVOID_MARGIN=4 |
| C. 恒星遮挡 | 位置 (pos+=push) | center 进入恒星光晕圆+8px | STAR_AVOID_MARGIN=8 |
| D. 视口截断 | 位置 (clamp) | rect 超出视口边距 | VP_MARGIN=12 |
| E. 标签互斥 | 力+动量 (v+=accel+impulse) | rect 重叠>2px | STIFFNESS=180, RESTITUTION=0.4 |

### 约束优先级

迭代顺序 A→A2→B→C→D→E，后约束可部分修正前约束。力驱动约束(A/A2/E)与位置投影(B/C/D)混用，力约束提供渐变过渡，位置投影提供硬安全网。

## 4. 运动模型

### 速度合成

```
v_desired = target_velocity + K_CORRECT × (target − current)
v        += (v_desired − v) × VEL_MATCH
v        *= DAMPING
pos      += v × dt
```

- **target_velocity** = (shadow_target_t − shadow_target_t−1)/dt（前馈，匹配行星运动）
- **K_CORRECT** = 3.0（反馈，修正位置偏差）
- **VEL_MATCH** = 0.65（平滑速率）
- **DAMPING** = 0.92（过阻尼，收敛快且无振荡）

### Shadow 目标方向

```
shadow_dir = normalize(P_center − S_center)   // 行星背向恒星
phase_i    = (i − 1) × spread°                 // per-label 分散（默认 8°）
target     = P_center + rotate(shadow_dir, phase_i) × (pr + gap)
```

相比固定"上方"偏好，shadow 方向天然避让恒星、行星轨道运动使三 label 自动沿不同角度散开。

## 5. 数据流

```
Planets.useFrame
  → screenCoords, planetScreenRadii, centralStarScreen → store
                                                           ↓
FloatingLabels.useFloatingLabels (rAF loop @ 60fps)
  → stepPBD(inputs, centralStar, params, dt, ..., collapsedWidths)
  → collapsedWidths[i] = collapsedFitWidths[i] ?? collapsedWidth
  → [PBDResult, PBDResult, PBDResult]
  → React state update (shallow compare)
  → DOM pills: transform: translate(x, y)

FloatingLabels.tsx (typewriter 完成后)
  → Canvas 2D measureText(welcomeText)
  → collapsedFitWidths[trackIdx] = fitW
  → 回传至 useFloatingLabels → stableRefs → rAF 循环
```

### 顺序播放与首次渲染

- TerminalBar 在 PBD 首次计算出非零位置后才挂载（`pbdReady` 门控）
- 标签按顺序逐个渲染：label 0 先出现 → typing+exitGap 完成 → label 1 出现 → ...
- 确保进入 Act 3 后打字机动画可见，而非在屏幕外已完成

### 折叠态自收缩

typewriter 在折叠态完成后，通过 Canvas 2D 测量 welcome-text 像素宽度，收缩 pill 至适配尺寸。收缩后的宽度通过 `collapsedFitWidths` 回传 PBD 系统，确保碰撞检测和锚点计算使用各 label 的实际几何尺寸。

```
fitW = clamp(textWidth + 18px, 24, collapsedWidth)
```

## 6. 可调参数

### 运行时参数（App.tsx pbdParams）

| 参数 | 默认值 | 效果 |
|------|--------|------|
| `anchorRangeRadius` | 70 | ↑标签允许漂更远 |
| `gap` | 16 | ↑标签与行星表面间距 |
| `shadowAngleSpread` | 8 | ↑三标签更分散 |

### 时间参数（App.tsx FloatingLabels props）

| 参数 | 默认值 | 效果 |
|------|--------|------|
| `baseTypewriterDelay` | 600ms | typewriter 动画起始基础延迟，↑则标签更晚出现 |
| `staggerDelay` | 600ms | label 间 typewriter 错开延迟，↑则逐个登场节奏更舒缓 |
| `exitTimeout` | 15000ms | 展开后无操作自动退出超时 |

App.tsx 当前覆盖: `staggerDelay=200`（紧凑间隔），`baseTypewriterDelay` 使用默认 600。

### 标签尺寸参数（App.tsx FloatingLabels props）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `collapsedWidth` | 60 | 折叠态最大宽度，typewriter 完成后可收缩至 ≥24px |
| `expandedWidth` | 200 | 展开模式宽度 |
| `collapsedHeight` | 36 | 紧凑模式高度（2行 × 1.6lh + padding） |
| `expandedHeight` | 44 | 展开模式高度 |

### 折叠自收缩参数（FloatingLabels.tsx 内部）

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 最小宽度 | 24px | `Math.max(24, ...)` 防止 pill 过窄 |
| padding 余量 | 18px | `textW + 18`，含左右 padding（6px×2）和圆角余量 |
| CSS transition | 0.5s | `FloatingLabels.css` 中 `width 0.5s cubic-bezier(...)` |

### 源码常量（需要修改源码）

| 参数 | 默认值 | 效果 |
|------|--------|------|
| `K_CORRECT` | 3.0 | ↑贴得更紧 |
| `VEL_MATCH` | 0.65 | ↑跟随更积极 |
| `ANCHOR_STIFFNESS` | 25 | ↑锚点回正更快 |
| `CLOSE_REPEL_STIFFNESS` | 400 | ↑近距离排斥更强 |
| `CLOSE_REPEL_MARGIN` | 10 | ↑安全区更宽 |
| `SEPARATION_STIFFNESS` | 180 | ↑碰撞分离更强 |
| `SEPARATION_RESTITUTION` | 0.4 | ↑碰撞更弹性 |
| `SEPARATION_THRESHOLD` | 2 | ↑需更大重叠才触发分离 |
| `STAR_AVOID_MARGIN` | 8 | 中央恒星安全边距 |
| `PLANET_AVOID_MARGIN` | 4 | 行星遮挡安全边距 |
| `SOLVER_ITERS` | 5 | 约束迭代次数 |
| `MAX_SPEED` | 800 | 单帧最大位移 (px) |
| `VP_MARGIN` | 12 | 视口边距 |

## 7. 视觉样式

星球标签使用独立 CSS variant：`variant="label"`（`TerminalBar.css`）。
- 背景：`rgba(200,210,225,0.22)`（灰白半透明）
- 无边框
- 文字：`rgba(235,242,255,0.95)`，`font-weight:500`
- 字体：`'SF Mono','Fira Code','Cascadia Code','Consolas',monospace`
- 字号：`0.58rem`
- 用法：`<TerminalBar variant="label" ...>`

Debug 覆盖层独立组件 `PlanetLabelDebug.tsx`，通过 MainTerminal `debug` 命令控制显隐。

调试元素：
| 颜色/形状 | 含义 |
|-----------|------|
| 青色圆 | planet 视觉边缘（pr） |
| 白色虚线圆 | 约束 B 行星遮挡避免区（pr + 4px） |
| 灰白虚线圆 | 近距离排斥区（pr + 10px） |
| 红色虚线圆 | anchor-range 边界（pr + gap + anchorRangeRadius） |
| 绿色矩形 | label 算法矩形 |
| 红色圆点 | 左右锚点 |
| 白色虚线圆 | 中央恒星内层光晕 |

## 8. 性能特征

- PBD 物理: 3 labels × 5 iterations × ~20 ops = ~300 ops/frame
- rAF 循环: 60fps 独立于 R3F frameloop
- React re-render: 仅位置变化 >0.5px 时触发（大多数帧跳过）
- 模块级对象预分配: 无需 GC
