# PBD 布局系统 — 操作手册

**版本**: v1 稳定版  
**适用**: 开发者 / 调试者

---

## 快速开始

标签布局在 Act 3（scrollProgress > 0.85）自动激活。无需手动配置。

```bash
pnpm dev
# 滚动到页面底部 → 行星标签出现
```

## 配置

所有布局参数通过 `App.tsx` 的 `<FloatingLabels>` 组件传入：

```tsx
<FloatingLabels
  configs={labelConfigs}
  sequenceStrategy="proximity" // 入场排序策略: 'index' | 'simultaneous' | 'proximity'
  staggerDelay={200}           // label 间 typewriter 错开延迟 (ms)
  baseTypewriterDelay={600}    // typewriter 起始基础延迟 (ms)，不传则默认 600
  exitTimeout={15000}          // 展开后无操作自动退出超时 (ms)
  collapsedWidth={60}          // 紧凑模式宽度 (px, ≈5ch at 0.58rem)
  expandedWidth={200}          // 展开模式宽度 (px)
  collapsedHeight={36}         // 紧凑模式高度 (px)
  expandedHeight={44}          // 展开模式高度 (px)
  pbdParams={{
    anchorRangeRadius: 70,     // 锚点允许范围半径 (px)
    gap: 16,                   // label 距行星视觉边缘的间隙 (px)
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
| **红色虚线圆** | anchor-range 边界（pr + gap + anchorRangeRadius） |
| **绿色矩形** | 算法计算出的 label 矩形 |
| **红色圆点** | 左右侧边中点锚点 |
| **白色虚线圆** | 中央恒星内层光晕 |

`debug` 再次输入关闭。覆盖层独立组件 `PlanetLabelDebug.tsx`，通过 `window.__DEBUG__` 标志位控制。

### 解读调试信息

```
label 绿色矩形应与 pill DOM 位置一致 → 高度不一致请调 collapsedHeight
红色锚点应在红色虚线圆内                     → 超出则有向心力拉回
绿色矩形不应侵入青色圆                       → 侵入则约束 B 位置投影推出
绿色矩形不应侵入白色虚线圆（行星旁）          → 侵入则约束 B 位置投影推出（该圆 = pr+4px）
绿色矩形不应侵入白色虚线圆（中央恒星）        → 侵入则约束 C 位置投影推出
绿色矩形两两不重叠                          → 重叠则有加速度+动量推开
```

## 故障排除

| 症状 | 检查 |
|------|------|
| 标签抖动严重 | 检查 `anchorRangeRadius` 是否过小（当前 70，可加大） |
| 标签黏在一起 | 增大 `SEPARATION_STIFFNESS` |
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
rAF loop (60fps, 独立于 3D)
  │  stepPBD() → 速度前馈 → 约束投影 → 积分
  ↓
React state (shallow compare)
  │  transform: translate(x, y)
  ↓
DOM pills (3 × TerminalBar)
```
