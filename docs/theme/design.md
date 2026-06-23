# Day/Night 主题系统 — 设计文档

> 面向开发者与架构决策。操作手册见 [`operation-guide.md`](./operation-guide.md)，维护指南见 [`maintenance-guide.md`](./maintenance-guide.md)。

---

## 目录

1. [设计目标](#1-设计目标)
2. [架构总览](#2-架构总览)
3. [三层过渡模型](#3-三层过渡模型)
4. [色板系统](#4-色板系统)
5. [数据流](#5-数据流)
6. [设计决策](#6-设计决策)

---

## 1. 设计目标

- **可切换**：终端命令 `day` / `night` 切换全局主题
- **平滑过渡**：切换时有 crossfade 动画，非瞬切
- **Scroll 兼容**：主题切换不影响 scroll-driven 的颜色过渡（Plan B — 偏移）
- **一致性**：Terminal 颜色、3D Scene 背景、页面 CSS 背景三者在同一主题下保持色调一致
- **性能**：useFrame 中零额外 GC（预分配对象），GSAP tween 驱动 blend 因子

---

## 2. 架构总览

```
src/theme/
  theme.css          CSS 主题配置：:root / [data-theme] 变量定义
  palettes.ts        色板数据 + 纯函数（无框架依赖）
  colors.ts          场景级主题色（JS 可访问，orbit/guideLine）
  useDayNight.ts     Hook：store 订阅 → GSAP blend → handleThemeUpdate

src/r3f/
  ScrollRig.ts       sceneApplyWhiteOut + setThemeBlend
  ScrollInvalidator.tsx  每帧调用 sceneApplyWhiteOut

src/stores/
  scrollStore.ts     dayNight 状态 + setDayNight / toggleDayNight

src/terminal/
  commands.ts        day / night 命令 → setDayNight()
  TerminalBar.tsx    消费 handleThemeUpdate → --tw-* CSS 变量
```

### 场景级主题色（`colors.ts`）

非终端（--tw-*）的 JS 可访问颜色集中管理，避免散落各组件：

| 键 | Night | Day | 消费者 |
|----|-------|-----|--------|
| `orbit` | `#cbd5e1` | `#64748b` | OrbitRings / OrbitalRing |
| `guideLine` | `rgba(200,210,225,0.45)` | `rgba(60,72,90,0.35)` | PlanetLabelGuideLines |

CSS 侧对应变量 `--color-orbit` / `--color-guide-line` 定义在 theme.css。

### 依赖方向

```
commands.ts → scrollStore
                 ↓
           useDayNight (hook)
          /       |        \
    theme.css   palettes   ScrollRig (setThemeBlend)
    (CSS vars)  (色板)     (scene bg + fog)

colors.ts ← 组件（OrbitRings, PlanetLabelGuideLines）
  └─ themeColor(key, dayNight) → 色值
```
         \       |        /
        TerminalBar + Scene + Body
```

---

## 3. 三层过渡模型

day/night 切换时，三个视觉层同步过渡，时长统一 0.5–0.6s：

### Layer 1: CSS 静态元素（`theme.css`）

```
dayNight 变化
  → useDayNight useEffect
  → document.documentElement.dataset.theme = 'night' | 'day'
  → CSS [data-theme] 选择器覆盖 :root 变量
  → body / footer / scroll hint / brand text 平滑过渡
  → transition: background-color 0.5s ease（body）
```

影响范围：`--color-body-bg`、`--color-scroll-hint`、`--color-footer` 等静态颜色。

### Layer 2: 3D Scene 背景（`ScrollRig.ts`）

```
dayNight 变化
  → useDayNight useEffect
  → GSAP gsap.to(blendRef, { current: target, duration: 0.6 })
  → onUpdate: setThemeBlend(blendRef.current)
  → ScrollRig._themeBlend 模块级变量
  → sceneApplyWhiteOut 每帧:
      _bgTargetColor = _bgNightTarget.lerp(_bgDayTarget, _themeBlend)
      scene.background = _bgBaseColor.lerp(_bgTargetColor, wof)
```

影响范围：Three.js scene.background + FogExp2。

### Layer 3: Terminal 颜色（`useDayNight.ts` + `palettes.ts`）

```
handleThemeUpdate(sp) 每帧调用
  → blendRef.current (0=night, 1=day, GSAP 驱动)
  → scrollT = smoothstep(sp)
  → nightCss = scrollThemeVars(NIGHT_ACT1, NIGHT_ACT3, scrollT)
  → dayCss   = scrollThemeVars(DAY_ACT1, DAY_ACT3, scrollT)
  → return blendThemeVars(nightCss, dayCss, blend)
  → TerminalBar 注入 --tw-* CSS 变量到 barInnerRef
```

影响范围：终端全部文字 / 光标 / ring / glass 背景。

### 时序对齐

| 层 | 驱动方式 | 时长 | easing |
|---|---------|:---:|------|
| CSS 静态 | `data-theme` 属性 → CSS transition | 0.5s | ease (CSS) |
| Scene 背景 | GSAP tween → setThemeBlend → Three.js Color.lerp | 0.6s | power2.inOut |
| Terminal | GSAP tween → blendRef → palette crossfade | 0.6s | power2.inOut |

Scene 和 Terminal 共享同一个 GSAP tween（`blendRef.current`），保证同步。

---

## 4. 色板系统

### 4.1 色板结构

每个主题定义 **Act 1** (sp=0) 和 **Act 3** (sp=1) 两个端点。运行时在两个端点间 smoothstep 插值。

```
Night 色板:  NIGHT_ACT1 ──(scrollT)──→ NIGHT_ACT3
Day 色板:    DAY_ACT1   ──(scrollT)──→ DAY_ACT3

切换时:      night 结果 ──(blend)──→ day 结果
```

### 4.2 色值定义位置

| 位置 | 文件 | 用途 |
|------|------|------|
| JS 色板 | `src/theme/palettes.ts` | 运行时动态计算（scroll + blend 插值） |
| CSS 初始值 | `src/theme/theme.css` | 首帧 JS 未接管时的 fallback |

⚠️ **两处必须保持同步。** 修改颜色时需同时更新两个文件。

### 4.3 颜色规格

| 变量 | Night Act 1 | Night Act 3 | Day Act 1 | Day Act 3 |
|------|------------|------------|----------|----------|
| echo | `#7c8aa0` | `#94a3b8` | `#475569` | `#334155` |
| prefix | `#64748b` | `#78889a` | `#64748b` | `#475569` |
| prompt | `#0ea5e9` | `#38bdf8` | `#0369a1` | `#0284c7` |
| glassBg | `rgba(15,20,35,0.05)` | — | `rgba(255,255,255,0.35)` | — |

完整色表见 `palettes.ts` 和 `theme.css` 注释。

### 4.4 夜间 Act 3 暗色设计

Night 模式下 `_bgNightTarget = #050811`（与 `_bgBaseColor` 相同），white-out 过渡不产生实际效果。这使 Act 3 场景背景保持与 Act 1 一致的暗色调。

---

## 5. 数据流

### 5.1 完整数据流

```
user 输入 day 命令
  │
  ▼
commands.ts: useScrollStore.getState().setDayNight('day')
  │
  ▼
scrollStore.dayNight: 'night' → 'day'
  │
  ▼
useDayNight Hook 重渲染 ─────────────────────────────┐
  │                                                    │
  ├─ useEffect: data-theme 写入                        │
  │    └─ theme.css [data-theme="day"] 覆盖 :root      │
  │       ├─ body bg: #0b101d → #f1f5f9 (0.5s CSS)    │
  │       ├─ scroll hint: #aab → #64748b               │
  │       └─ footer, brand text 等                     │
  │                                                    │
  └─ useEffect: GSAP tween blendRef 0→1 (0.6s)        │
       ├─ onUpdate → setThemeBlend()                   │
       │    └─ sceneApplyWhiteOut 每帧                  │
       │       bgTarget: #050811 → #f1f5f9             │
       │                                                │
       └─ handleThemeUpdate 每帧读 blendRef             │
            └─ TerminalBar --tw-* crossfade             │
               (night 色板 → day 色板)                  │
```

### 5.2 状态存储

| 状态 | 位置 | 类型 |
|------|------|------|
| dayNight 选择 | `scrollStore.dayNight` | `'night' \| 'day'` |
| blend 因子 | `useDayNight.blendRef` (ref, 非 state) | `number` (0–1) |
| scene 目标色 | `ScrollRig._themeBlend` (module var) | `number` (0–1) |

`blendRef` 和 `_themeBlend` 都是非 React 状态——GSAP tween 直接 mutate ref/module-var，不触发 re-render。

---

## 6. Act 1 Night-Only 约束

Act 1（sp < 0.40，OceanVoyage 暗色海洋场景）中，MainTerminal 强制使用 night 色板，忽略 `dayNight` 状态选择。

### 行为矩阵

| 场景 | 终端行为 |
|------|---------|
| Act 1 中切换 day/night | 终端不响应，保持 night 色板 |
| Act 1 滚入 Act 2 (sp ≥ 0.40) | scrollT 从 0 开始过渡，blend 恢复实际选择 → 终端平滑过渡至目标色板 |
| Act 2/3 滚回 Act 1 (sp < 0.40) | 下一帧 `handleThemeUpdate` 触发 → blend 强制为 0 → 终端立即切回 night |
| Act 2/3 中切换 day/night | `themeKey` 递增 → TerminalBar 立即重绘 → 终端即时响应 |

### 实现

`handleThemeUpdate` 中一行约束：

```ts
const blend = sp < WHITE_OUT_THRESHOLD ? 0 : blendRef.current
```

`blendRef.current` 本身不受影响——`setDayNight` 的 effect 仍将其设为 target 值，抑制仅在渲染输出层。

---

## 7. 设计决策

### 7.1 Plan B（偏移）vs Plan A（覆盖）

| | Plan A | **Plan B（采用）** |
|---|---|---|
| 行为 | day/night 后颜色完全脱离 scroll | day/night 切换色板基准，scroll 过渡仍在基准上运作 |
| 优点 | 简单 | scroll 驱动的 Act 过渡视觉仍有效 |
| 缺点 | 丢失 Act 过渡感 | 需要双色板 crossfade |

### 7.2 双色板 vs 动态色生成

选择预定义 **4 个端点色板** 而非运行时 HSL 偏移：
- **可预测**：精确控制每个主题的视觉效果
- **可测试**：色值是常量，可直接对比
- **性能**：无运行时颜色空间转换

### 7.3 CSS 变量 vs JS inline style

静态元素（body、footer 等）选 **CSS 变量 + data-theme 属性** 而非 JS inline：
- CSS transition 天然支持平滑过渡
- 无需 JS effect 逐元素设置
- 主题色集中管理，修改只需改 theme.css

### 7.4 Terminal 颜色保留 JS 驱动

Terminal 的颜色需要 scroll × blend 双重插值，复杂度超出 CSS `transition` 能力范围，保留 JS `handleThemeUpdate` 动态计算。

### 7.5 setThemeBlend 模块级变量 vs Zustand store

选择 **模块级变量** (`ScrollRig._themeBlend`)：
- `useFrame` 中每帧读取，Zustand subscription 开销过高
- 只有一个 writer（GSAP tween onUpdate），不需要响应式
- 符合项目性能约束："getState() 读 Zustand — useFrame 中使用，不触发 React re-render"

### 7.6 useEchoSequence 废弃

`useEchoSequence` 的两阶段（grow→fill） + char-by-char 能力已被 Slot 管线 + GSAP + `useTypewriter` 覆盖，文件已删除。详见 `docs/HANDOFF.md`。
