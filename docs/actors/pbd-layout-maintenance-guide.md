# PBD 布局系统 — 维护指南

**关联文件**: `src/behaviors/usePBDLayout.ts`, `src/behaviors/useFloatingLabels.ts`, `src/actors/FloatingLabels.tsx`

核对日期：2026-09-09。完整数学定义与执行细节见 [形式化说明](pbd-layout-formal.md)，可重复的 SVG 实验见 [交互说明页](pbd-layout-explainer.html)。本文负责修改入口、调试和验证，不再维护另一套近似公式。

---

## 代码地图

```
usePBDLayout.ts      核心引擎（有状态函数 + 模块级状态）
  ├─ stepPBD()       每帧入口
  │   ├─ Stage 1     目标、速度预测、阻尼限速、位置积分
  │   ├─ Stage 2     混合约束（6 类 × 5 迭代）
  │   │   ├─ A       锚点向心加速度
  │   │   ├─ A2      近距离排斥加速度
  │   │   ├─ B       行星遮挡位置投影
  │   │   ├─ C       恒星遮挡位置投影
  │   │   ├─ D       视口硬截断
  │   │   └─ E       标签互斥加速度+动量
  │   └─ Stage 3     仅输出 PBDResult[]，没有第二次积分或速度重建
  ├─ resetPBD()      状态重置（测试）
  └─ 常量区           所有可调物理参数

useFloatingLabels.ts React hook（编排层）
  ├─ typewriterDelays     入场排序
  ├─ collapsedFitWidths   per-label 折叠态实际宽度（回传 PBD）
  ├─ rAF useEffect        独立逐帧循环，频率由显示与浏览器调度决定
  ├─ exit mgmt             超时/点击/Esc 退出
  └─ labels[]              构建 UI 数据

FloatingLabels.tsx   React 渲染组件
  ├─ Zustand 订阅          screenCoords / screenRadii / centralStar
  ├─ DOM getBoundingClientRect 实测 welcome-text 像素宽度
  ├─ collapsedFitWidths    收缩状态 → useFloatingLabels → stepPBD
  ├─ TerminalBar × 3       Slot 声明（Welcome + Section）
  ├─ PlanetLabelGuideLines 引导虚线（独立组件，anchor→planet）
  └─ Debug SVG             cyan/red/green/white 调试覆盖层

PlanetLabelGuideLines.tsx  独立组件
  ├─ 4 个计算点            anchorL + anchorR + topLeft + topRight
  ├─ 蒙版 3px              两端缩进，不穿透 label / planet
  ├─ guidesReady           收缩动画 0.5s 完成后才绘制
  └─ 展开态跳过             activeTrackIdx === trackIdx → return null
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
→ 分配不同延迟；实际仍由 showCount 按索引依次挂载
```

`entryOrderRef` 记录排序但没有用于 `showCount` 解锁，因此 `proximity` 和 `simultaneous` 并未完整决定实际登场顺序。`pbdReady` 只检查非零输出，没有稳定性判据。

### 折叠态自收缩宽度

typewriter 完成后，折叠态 pill 优先通过 DOM `getBoundingClientRect()` 测量 welcome-text，Canvas 2D `measureText()` 仅在 DOM 宽度不可用时后备。

```
fitW = clamp(textWidth + 18px, 24, collapsedWidth)

FS:     11.4px + 18 = 30px
Code:   23px   + 18 = 41px
GitHub: 34px   + 18 = 53px
```

收缩宽度通过 `collapsedFitWidths` 回传至 `useFloatingLabels` → `stableRefs` → rAF 循环 → `stepPBD(collapsedWidths)`。上述文本宽度是样例；动画期间仍可能存在尺寸不同步，不能理解为实时测得的完整 DOM 碰撞盒。

宽度更新分两阶段避免锚点抖动：

| 阶段 | 时机 | 更新内容 |
|------|------|---------|
| 视觉 | typewriter 完成立即 | `visualFitWidths` → pill `width` CSS transition 0.5s |
| PBD | 延迟 250ms | `collapsedFitWidths` → `stepPBD(collapsedWidths)` |

算法高度为 36/44px，组件没有把该高度设置到 DOM；实际内容盒可能不同。位置输出还经过 `transform 0.15s` CSS 过渡。调试图、引导线、求解位置和可见内容需要分别核对。

| 调整项 | 位置 | 效果 |
|--------|------|------|
| 最小宽度 | `FloatingLabels.tsx` `Math.max(24, ...)` | ↑增大最小宽度 |
| 收缩速度 | `FloatingLabels.css` `width 0.5s` | ↑更慢，↓更快 |
| padding 余量 | `FloatingLabels.tsx` `textW + 18` | ↑pill 更宽松 |

### 标签跟随过于松散（滞后大）

```
调节: K_CORRECT ↑ (2.5 → 4.0)  或  VEL_MATCH ↑ (0.65 → 0.8)
意图: 标签更紧密跟踪 shadow 方向；须用不同帧率验证
注意: 过大可能引起过冲
```

### 标签碰撞后"弹不开"

```
调节: SEPARATION_STIFFNESS ↑ (180 → 250)  或  ANCHOR_STIFFNESS ↓ (20 → 12)
意图: 改变推开力与回正力的比例，不保证消除重叠
```

### 锚点卡在 range 边缘抖动

```
调节: anchorRangeRadius ↑ (App.tsx)  或  ANCHOR_STIFFNESS ↓
先检查: 双锚点位于同一范围圆内的必要条件是 w <= 2R
当前展开宽 200px、R=70px 不满足；增大刚度无法解决几何上的不可满足
```

### 性能优化

```
- 先测量求解耗时、React 更新和 SVG/DOM 提交，不能凭标签数量推定瓶颈
- 降低 SOLVER_ITERS 会同时改变 A/A2/E 的累计速度增量，不只是改变精度
- 实时 store 订阅和布局 rAF 都能触发更新；0.5px 缓存阈值不消除其他更新
- 不引用未经本次测量的 Debug SVG 百分比收益；减少频率需验证运动差异
```

## 添加新约束

1. 在常量区声明参数（带中文注释，写明计算公式）
2. 在 Stage 2 约束投影循环中插入新约束
3. 明确约束修改速度还是位置、在本帧还是下一帧生效；不要仅因变量名 `accel` 就按加速度解释
4. 检查几何可行性、单位、求解顺序和不同帧率；位置投影也需重新核验后续约束是否破坏前约束
5. 同步更新 [完整公式](pbd-layout-formal.md)、[页面公式](../../src/docs/pbd/formulas.ts) 和本页；历史设计保持时间背景

## 调试技巧

### 可视化检查

```
青色圆     = planet 视觉边缘 (pr)
白色虚线圆 = 约束 B 行星遮挡避免区 (pr + 4px, PLANET_AVOID_MARGIN)
灰白虚线圆 = 近距排斥区 (pr + 10px, CLOSE_REPEL_MARGIN)
红色虚线圆 = 调试绘制 pr + gap + R，但求解器实际只用 R
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
| 牵引线不出现 | `guidesReady` 未置位 / 距离 ≤ 11px | 检查 `DISTANCE_THRESHOLD` 和 500ms 定时器 |
| 牵引线方向异常 | 计算点选择错误 | 检查 4 个点的最近者判定逻辑 |
| 标签持续拉扯 | 几何目标冲突或排斥残差 | 检查交互实验指标；当前没有替代方位搜索 |

目前没有搜索替代方位的 fallback；只有目标方向重合时的向上兜底、初始化和边界截断。遇到无解应记录约束冲突，不能把持续推拉解释为有效回退。B/C 的中心投影也不保证整个标签矩形安全。

## 测试

```
pnpm test --run src/behaviors/__tests__/usePBDLayout.test.ts src/docs/pbd/__tests__/model.test.ts
pnpm build:docs
```

原测试覆盖基本输出、目标方向、不可见行星和部分静态分离；并不覆盖所有拥挤或动态场景。文档实验测试补充几何诊断、目标语义、原求解器适配和复位/对比的一致性。

浏览器验证播放/暂停、单帧、复位、参数与图层、五个场景、公式切换、帧率比较、深浅主题及窄屏。算法变更还应覆盖边界、尺寸变化、30/60/120fps、重新入场与交互状态；不固定当前已知缺陷的数值作为长期正确答案。

交互代码维护入口：[src/docs/pbd/README.md](../../src/docs/pbd/README.md)。`pnpm build:docs` 生成独立 `dist-docs/`，不会修改主页构建入口。原引擎状态为模块级，演示必须独立加载，避免 reset 影响主页。

## 依赖关系

```
usePBDLayout.ts  ← useFloatingLabels.ts  ← FloatingLabels.tsx  ← App.tsx
                   ↑                        ↑
                   │ store.screenCoords      │ useRealtimeStore
                   │ store.planetScreenRadii │ useScrollStore
                   │ store.centralStarScreen │ TerminalBar
```

修改 `usePBDLayout.ts` 的常量或算法 → 运行 `pnpm test` 确认不退化 → 修改 App.tsx 的 `pbdParams` 可运行时调参。

## 主题色管理

场景级 day/night 色值集中在 `src/theme/colors.ts`，通过 `themeColor(key, dayNight)` 获取。新增场景元素主题色时：

1. 在 `colors.ts` 的 `SCENE_COLORS` 中添加键值对
2. 在 `theme.css` 的 `:root` 和 `[data-theme="day"]` 中添加对应 `--color-*` CSS 变量
3. 组件中 `import { themeColor } from '../theme/colors'` 替代硬编码色值
