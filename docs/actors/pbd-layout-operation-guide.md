# PBD 布局系统 — 操作手册

**核对日期**：2026-09-09；适用于当前 PBD 融合布局。

**适用**：开发者 / 调试者

原理与公式集中在 [形式化说明](pbd-layout-formal.md)，可操作的 SVG 动画见 [交互说明页](pbd-layout-explainer.html)。本页维护主页操作和显示链路；历史设计不代表当前约束已完全满足。

## 交互学习入口

运行 `pnpm dev`，打开 `/docs/actors/pbd-layout-explainer.html`。可切换五种场景、播放/暂停、单帧推进、调整参数、展开标签、显示图层，并比较同一输入在 30/60/120fps 下运行 10 秒的结果。`pnpm build:docs` 和 `pnpm preview:docs` 用于独立构建与预览；操作细节见 [运行说明](pbd-layout-formal.md#2-如何运行交互说明)。

---

## 渲染排轴

Act 3 进入后，元素按以下顺序渲染：

```
1. InfoPanelTerminal  welcome "solar system:" typewriter 播放
                     ↓
2. PBD 后台步进        label 位置在后台计算，不可见
                     ↓
3. InfoPanel 进入 idle → labelsGateOpen
                     ↓
4. label 0 TerminalBar 挂载 → typewriter → exitGap → label 1 → label 2
```

标签显示前，求解器已经在后台运行。`pbdReady` 只检查非零输出，不检测收敛。离开 Act 3 会卸载 DOM 标签，重新进入后重做入场门控；求解器模块状态不随组件卸载自动重置。

## 快速开始

标签布局在 Act 3（scrollProgress > 0.85）自动激活。无需手动配置。

```bash
pnpm dev
# 滚动到页面底部 → 行星标签出现
```

## 折叠态自收缩

typewriter 动画完成后，折叠态 pill 自动收缩至适配 welcome-text（星球名）的宽度。优先通过 DOM `getBoundingClientRect()` 测量，Canvas 2D `measureText()` 仅作后备。

- 最小宽度 24px，最大不超过 `collapsedWidth`（默认 60px）
- CSS transition `width 0.5s` 控制收缩速度
- PBD 碰撞盒在动画播放 250ms 后切换宽度；这与 500ms 的连续视觉过渡并不完全同步
- 算法高度由 `collapsedHeight/expandedHeight` 指定，实际 DOM 高度由内容决定，两者不保证相同

| Label | 文本 | 收缩后宽度 |
|-------|------|-----------|
| FS | "FS" | 30px |
| Code | "Code" | 41px |
| GitHub | "GitHub" | 53px |

以上宽度是样例测量值；字体和浏览器变化后以实际 DOM 为准。

## 配置

所有布局参数通过 `App.tsx` 的 `<FloatingLabels>` 组件传入：

```tsx
<FloatingLabels
  configs={labelConfigs}
  sequenceStrategy="proximity" // 延迟排序；当前显示仍按索引依次解锁
  staggerDelay={200}           // label 间 typewriter 错开延迟 (ms)
  baseTypewriterDelay={600}    // typewriter 起始基础延迟 (ms)，不传则默认 600
  exitTimeout={15000}          // 展开后无操作自动退出超时 (ms)
  collapsedWidth={60}          // 紧凑模式宽度 (px, ≈5ch at 0.58rem)
  expandedWidth={200}          // 展开模式宽度 (px)
  collapsedHeight={36}         // 紧凑模式高度 (px)
  expandedHeight={44}          // 展开模式高度 (px)
  pbdParams={{
    anchorRangeRadius: 70,     // 锚点允许范围半径 (px)
    gap: 16,                   // 目标中心的额外偏移，不保证矩形边缘间隙 (px)
    shadowAngleSpread: 8,      // per-label shadow 偏移角度 (°)，默认 8
  }}
/>
```

### 调参速查

| 效果 | 改动 |
|------|------|
| 标签更靠近行星 | ↓ `gap` |
| 标签允许漂更远 | ↑ `anchorRangeRadius` |
| 三标签更分散 | ↑ `shadowAngleSpread` |
| 碰撞弹开更明显 | 增大 `SEPARATION_STIFFNESS`（源码常量） |
| 跟随更紧密 | 增大 `K_CORRECT`（源码常量） |
| label 更快出现 | ↓ `baseTypewriterDelay` |
| label 间错开更紧凑 | ↓ `staggerDelay` |
| label 逐个登场节奏更舒缓 | ↑ `staggerDelay` |

`proximity` 目前只计算不同延迟，`showCount` 仍按 0→1→2 解锁标签；`simultaneous` 也受该门控限制。调参前先确认几何约束是否可满足，例如展开宽 200px 时，两个锚点不可能同时进入 R=70px 的范围圆。

## 交互

| 操作 | 效果 |
|------|------|
| 点击标签 | 展开为终端模式（可输入命令） |
| 在终端中输入 `info` | 显示行星信息 |
| `focus` | 聚焦该行星 |
| `open` | 在新标签页打开行星链接 |
| Esc | 退出终端模式 |
| 点击标签外部 | 退出终端模式 |
| 15 秒无操作 | 自动退出终端模式 |

## 调试覆盖层

在 MainTerminal 中输入 `debug` 命令开启/关闭：

```
$ debug
debug mode: ON
```

开启后自动显示实时调试覆盖层：

| 颜色/形状 | 含义 |
|-----------|------|
| **青色圆** | planet 屏幕视觉边缘（pr） |
| **白色虚线圆** | 约束 B 行星遮挡避免区（pr + 4px，PLANET_AVOID_MARGIN） |
| **灰白虚线圆** | 近距离排斥区（pr + 10px，CLOSE_REPEL_MARGIN） |
| **红色虚线圆** | 调试图画为 pr + gap + anchorRangeRadius；实际求解半径仅为 anchorRangeRadius |
| **绿色矩形** | 算法计算出的 label 矩形 |
| **红色圆点** | 左右侧边中点锚点 |
| **白色虚线圆** | 中央恒星内层光晕 |
| **灰白虚线（引导线）** | label 锚点 → planet 质心，gap > 11px 时出现，蒙版 3px |

### 牵引线

独立组件 `PlanetLabelGuideLines.tsx`，不嵌入布局系统。折叠态 label 收缩动画完成后自动出现：

- 4 个计算点取距 planet 最近者作为连线起点
- 蒙版 3px：两端缩进，不穿透 label / planet
- 展开态自动隐藏
- 距离阈值：11px

`debug` 再次输入关闭。覆盖层独立组件 `PlanetLabelDebug.tsx`，通过 `window.__DEBUG__` 标志位控制。

### 解读调试信息

```
绿色矩形是算法尺寸，不保证等于真实 pill 内容盒
红色范围圆的绘制与求解 R 有差异，不可直接据此判断 A 是否满足
B 使用 max(半宽,半高)+pr+4 的中心距离近似，并非精确矩形避让
C 仅把标签中心推出恒星圆+8，矩形仍可能侵入
E 对重叠施加速度增量，不保证本帧或最终完全消除重叠
```

## 故障排除

| 症状 | 检查 |
|------|------|
| 标签抖动严重 | 先核对尺寸同步、锚点目标可行性和显示层二次平滑，再调刚度 |
| 标签黏在一起 | 用交互说明检查重叠指标与不同帧率；增加排斥力不保证有解 |
| 标签不跟随行星 | 确认 Planets.useFrame 正在运行；检查 store 数据 |
| 标签瞬移到新位置 | 正常行为（行星首次可见时初始化） |
| TypeScript 错误 | `pnpm exec tsc --noEmit` 检查类型 |

## 架构速览

```
3D 场景 (R3F frameloop=demand)
  │  Planets.useFrame → 投影到屏幕
  ↓
store (Zustand)
  │  screenCoords, planetScreenRadii, centralStarScreen
  ↓
rAF loop（频率随浏览器调度，独立于 3D）
  │  stepPBD(inputs, ..., collapsedWidths) → 每 label 使用实际折叠宽度
  ↓
React state (shallow compare)
  │  transform: translate(x, y) + collapsedFitWidths
  ↓
DOM pills (3 × TerminalBar)  →  typewriter 完成 → DOM 测量 → 延迟更新算法宽度
```
