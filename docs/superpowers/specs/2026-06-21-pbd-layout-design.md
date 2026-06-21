# PBD 行星标签布局系统 — 设计文档

**日期**: 2026-06-21  
**状态**: 稳定版 v1  
**关联**: `src/behaviors/usePBDLayout.ts`, `src/behaviors/useFloatingLabels.ts`, `src/actors/FloatingLabels.tsx`

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
│     + per-label 相位偏移 (-15°/0°/+15°)              │
│                                                     │
│  3. stepPBD(dt):                                    │
│     Stage 1 — 速度前馈 + 位置修正                   │
│     Stage 2 — 5 类约束投影（迭代 ×5）               │
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
| A2. 近距排斥 | 力 (v+=accel) | center 侵入 pr+10px 安全区 | CLOSE_REPEL_STIFFNESS=150 |
| B. 行星遮挡 | 位置 (pos+=push) | center 进入任意行星视觉圆 | PLANET_AVOID_MARGIN=2 |
| C. 恒星遮挡 | 位置 (pos+=push) | center 进入恒星光晕圆 | STAR_AVOID_MARGIN=4 |
| D. 视口截断 | 位置 (clamp) | rect 超出视口边距 | VP_MARGIN=12 |
| E. 标签互斥 | 力+动量 (v+=accel+impulse) | rect 重叠>2px | SEPARATION_STIFFNESS=120, RESTITUTION=0.4 |

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
phase_i    = (i − 1) × 15°                     // per-label 分散
target     = P_center + rotate(shadow_dir, phase_i) × (pr + gap)
```

相比固定"上方"偏好，shadow 方向天然避让恒星、行星轨道运动使三 label 自动沿不同角度散开。

## 5. 数据流

```
Planets.useFrame
  → screenCoords, planetScreenRadii, centralStarScreen → store
                                                           ↓
FloatingLabels.useFloatingLabels (rAF loop @ 60fps)
  → stepPBD(inputs, centralStar, params, dt, ...)
  → [PBDResult, PBDResult, PBDResult]
  → React state update (shallow compare)
  → DOM pills: transform: translate(x, y)
```

## 6. 可调参数

| 参数 | 默认值 | 位置 | 调节效果 |
|------|--------|------|---------|
| `anchorRangeRadius` | 85 | App.tsx pbdParams | ↑标签允许漂更远 |
| `gap` | 6 | App.tsx pbdParams | ↑标签与行星间距 |
| `shadowAngleSpread` | 15 | App.tsx pbdParams | ↑三标签更分散 |
| `K_CORRECT` | 3.0 | 源码常量 | ↑贴得更紧 |
| `VEL_MATCH` | 0.65 | 源码常量 | ↑跟随更积极 |
| `ANCHOR_STIFFNESS` | 25 | 源码常量 | ↑锚点回正更快 |
| `CLOSE_REPEL_STIFFNESS` | 150 | 源码常量 | ↑排斥更有力 |
| `SEPARATION_STIFFNESS` | 120 | 源码常量 | ↑碰撞分离更强 |
| `SEPARATION_RESTITUTION` | 0.4 | 源码常量 | ↑碰撞更弹性 |

## 7. 性能特征

- PBD 物理: 3 labels × 5 iterations × ~20 ops = ~300 ops/frame
- rAF 循环: 60fps 独立于 R3F frameloop
- React re-render: 仅位置变化 >0.5px 时触发（大多数帧跳过）
- 模块级对象预分配: 无需 GC
