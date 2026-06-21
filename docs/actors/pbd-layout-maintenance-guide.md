# PBD 布局系统 — 维护指南

**关联文件**: `src/behaviors/usePBDLayout.ts`, `src/behaviors/useFloatingLabels.ts`, `src/actors/FloatingLabels.tsx`

---

## 代码地图

```
usePBDLayout.ts      核心引擎（纯函数 + 模块级状态）
  ├─ stepPBD()       每帧入口
  │   ├─ Stage 1     预测（速度前馈 + 位置修正）
  │   ├─ Stage 2     约束投影（5 类 × 5 迭代）
  │   │   ├─ A       锚点向心加速度
  │   │   ├─ A2      近距离排斥加速度
  │   │   ├─ B       行星遮挡位置投影
  │   │   ├─ C       恒星遮挡位置投影
  │   │   ├─ D       视口硬截断
  │   │   └─ E       标签互斥加速度+动量
  │   └─ Stage 3     输出 PBDResult[]
  ├─ resetPBD()      状态重置（测试）
  └─ 常量区           所有可调物理参数

useFloatingLabels.ts React hook（编排层）
  ├─ typewriterDelays     入场排序
  ├─ collapsedFitWidths   per-label 折叠态实际宽度（回传 PBD）
  ├─ rAF useEffect        独立 60fps 物理循环
  ├─ exit mgmt             超时/点击/Esc 退出
  └─ labels[]              构建 UI 数据

FloatingLabels.tsx   React 渲染组件
  ├─ Zustand 订阅          screenCoords / screenRadii / centralStar
  ├─ Canvas 2D measureText 计算 welcome-text 像素宽度
  ├─ collapsedFitWidths    收缩状态 → useFloatingLabels → stepPBD
  ├─ TerminalBar × 3       Slot 声明（Welcome + Section）
  └─ Debug SVG             cyan/red/green/white 调试覆盖层
```

## 参数调优指南

### typewriter 入场动画节奏

| 参数 | 默认 | 位置 | 效果 |
|------|------|------|------|
| `baseTypewriterDelay` | 600ms | `FloatingLabelsOptions` | 所有 label 的 typewriter 基础等待时间 |
| `staggerDelay` | 600ms | `FloatingLabelsOptions` | label 间 typewriter 错开延迟 |

```
delay[i] = baseTypewriterDelay + rank × staggerDelay

App.tsx 当前: staggerDelay=200（紧凑），baseTypewriterDelay 未传（默认 600）
→ label 间隔仅 200ms，首个 600ms 后快速依次登场
```

### 折叠态自收缩宽度

typewriter 完成后，折叠态 pill 通过 Canvas 2D `measureText()` 计算 welcome-text 像素宽度并收缩。

```
fitW = clamp(textWidth + 18px, 24, collapsedWidth)

FS:     11.4px + 18 = 30px
Code:   23px   + 18 = 41px
GitHub: 34px   + 18 = 53px
```

收缩宽度通过 `collapsedFitWidths` 回传至 `useFloatingLabels` → `stableRefs` → rAF 循环 → `stepPBD(collapsedWidths)`，确保 PBD 碰撞检测和 anchor 位置使用各 label 的实际宽度。

| 调整项 | 位置 | 效果 |
|--------|------|------|
| 最小宽度 | `FloatingLabels.tsx` `Math.max(24, ...)` | ↑增大最小宽度 |
| 收缩速度 | `FloatingLabels.css` `width 0.5s` | ↑更慢，↓更快 |
| padding 余量 | `FloatingLabels.tsx` `textW + 18` | ↑pill 更宽松 |

### 标签跟随过于松散（滞后大）

```
调节: K_CORRECT ↑ (3.0 → 5.0)  或  VEL_MATCH ↑ (0.65 → 0.8)
效果: 标签更紧密跟踪 shadow 方向
注意: 过大可能引起过冲
```

### 标签碰撞后"弹不开"

```
调节: SEPARATION_STIFFNESS ↑ (180 → 250)  或  ANCHOR_STIFFNESS ↓ (25 → 15)
效果: 碰撞推开力更强，回正更慢，动量传递更明显
```

### 锚点卡在 range 边缘抖动

```
调节: anchorRangeRadius ↑ (App.tsx)  或  ANCHOR_STIFFNESS ↓
注意: anchorRangeRadius 应 > shadow 自然距离 ≈ sqrt((w/2)² + (h/2+pr+gap)²)
```

### 性能优化

```
- 减少 SOLVER_ITERS (5→3): 性能↑，约束满足精度↓
- 移除 Debug SVG: ~30% render 时间节省
- 降低 rAF 频率: 可用 setTimeout 替代（不推荐，会丢帧）
```

## 添加新约束

1. 在常量区声明参数（带中文注释，写明计算公式）
2. 在 Stage 2 约束投影循环中插入新约束
3. 优先使用力驱动（`b.vx += nx * accel`），仅在必须保证无穿透时用位置投影
4. 确保新约束的刚度与现有约束协调（参考现有刚度比值）
5. 更新本文档和设计文档

## 调试技巧

### 可视化检查

```
青色圆     = planet 视觉边缘 (pr)
白色虚线圆 = 约束 B 行星遮挡避免区 (pr + 4px, PLANET_AVOID_MARGIN)
灰白虚线圆 = 近距排斥区 (pr + 10px, CLOSE_REPEL_MARGIN)
红色虚线圆 = anchor-range (pr + gap + anchorRangeRadius)
绿色矩形   = label 算法矩形 (collapsedWidth × collapsedHeight)
红色圆点   = 左右锚点 (label 左右侧边中点)
白色虚线圆 = 中央恒星光晕（中央）
```

### 常见问题诊断

| 现象 | 可能原因 | 检查方向 |
|------|---------|---------|
| label 不出现 | rAF 未启动 / FloatingLabels 未挂载 | `needsAct3(sp)`、store 数据 |
| label 瞬移 | 首次激活从 (0,0) 跳 | 正常，已处理为直接跳转 |
| label 静止不动 | `screenCoords` 未更新 | Planets.useFrame 是否运行 |
| green rect 与 DOM pill 大小不一 | `collapsedFitWidths` 未同步到 PBD | 检查 `stableRefs` 和 `stepPBD(collapsedWidths)` 传递链路 |
| 收缩后 PBD 碰撞不准确 | `collapsedWidths` 未传入 `stepPBD` | 确认 rAF 循环中 `fitW` 数组正确构建 |
| 收缩速度不理想 | CSS transition 时长 | 调整 `FloatingLabels.css` 中 `width 0.5s` |
| label 频繁进入 fallback | 约束过严，无合法位置 | 尝试增大 anchorRangeRadius |

## 测试

```
pnpm vitest run src/behaviors/__tests__/usePBDLayout.test.ts
```

测试覆盖: 基本输出 / shadow 方向 / 不可见行星 / 标签分离 / 恒星避让。需在添加新约束后同步更新。

## 依赖关系

```
usePBDLayout.ts  ← useFloatingLabels.ts  ← FloatingLabels.tsx  ← App.tsx
                   ↑                        ↑
                   │ store.screenCoords      │ useRealtimeStore
                   │ store.planetScreenRadii │ useScrollStore
                   │ store.centralStarScreen │ TerminalBar
```

修改 `usePBDLayout.ts` 的常量或算法 → 运行 `pnpm test` 确认不退化 → 修改 App.tsx 的 `pbdParams` 可运行时调参。
