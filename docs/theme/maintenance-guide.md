# Day/Night 主题 — 维护指南

> 面向开发者的维护、调试与扩展指南。设计文档见 [`design.md`](./design.md)，操作手册见 [`operation-guide.md`](./operation-guide.md)。

---

## 目录

1. [代码地图](#1-代码地图)
2. [修改颜色](#2-修改颜色)
3. [新增主题](#3-新增主题)
4. [修改过渡效果](#4-修改过渡效果)
5. [调试指南](#5-调试指南)
6. [已知问题与注意事项](#6-已知问题与注意事项)

---

## 1. 代码地图

### 1.1 文件依赖关系

```
src/theme/
  theme.css              CSS 主题配置（:root + [data-theme] 选择器）
  palettes.ts            色板常量 + lerp/scroll/blend 纯函数
  useDayNight.ts         Hook：store 订阅 → GSAP blend → handleThemeUpdate

src/r3f/
  ScrollRig.ts           setThemeBlend() + sceneApplyWhiteOut()
  ScrollInvalidator.tsx  每帧调用 sceneApplyWhiteOut(scene, sp)

src/stores/
  scrollStore.ts         dayNight 状态 + setDayNight / toggleDayNight

src/terminal/
  commands.ts            day / night 命令 → setDayNight()
  TerminalBar.tsx        消费 handleThemeUpdate 返回值，注入 --tw-*
  TerminalBar.css        消费 --tw-* 变量，含 fallback 值

src/App.tsx              一行调用：const { handleThemeUpdate } = useDayNight()
src/App.css              消费 --color-* 变量
src/MainTerminal.tsx     传递 onThemeUpdate={handleThemeUpdate}
```

### 1.2 修改影响范围

| 修改目标 | 可能影响 | 风险 |
|----------|----------|:---:|
| `theme.css` — 颜色值 | body、footer、scroll hint、terminal 首帧 | 🟡 |
| `palettes.ts` — 色板常量 | 运行时 terminal 颜色 + scene 背景目标色 | 🔴 |
| `palettes.ts` — 插值函数 | 全部终端颜色计算 | 🔴 |
| `useDayNight.ts` — blend 时长/缓动 | 切换动画节奏 | 🟡 |
| `ScrollRig.ts` — 背景色常量 | scene 背景过渡 | 🟡 |
| `scrollStore.ts` — dayNight 类型 | commands.ts + useDayNight | 🔴 |
| `commands.ts` — day/night handler | 用户命令行为 | 🟢 |
| `App.css` — var() 引用 | 仅引用变量名，不存色值 | 🟢 |
| `TerminalBar.css` — fallback 值 | JS 接管前的首帧 | 🟢 |

---

## 2. 修改颜色

### 2.1 修改终端颜色

需要同步更新 **两处**：

1. **`src/theme/palettes.ts`** — JS 色板常量（运行时）
2. **`src/theme/theme.css`** — CSS `--tw-*` 初始值（首帧 fallback）

**步骤：**

```bash
# 1. 编辑 palettes.ts — 找到对应色板（NIGHT_ACT1 / NIGHT_ACT3 / DAY_ACT1 / DAY_ACT3）
#    修改颜色值。Hex 颜色用 6 位格式（如 #7c8aa0），RGBA 用 rgba(r,g,b,a)

# 2. 编辑 theme.css — 找到对应 :root 或 [data-theme="day"] 区块
#    将相同的 --tw-* 变量值同步修改

# 3. 验证
pnpm build && pnpm test
#    在 pnpm dev 中检查终端颜色 + 首帧颜色
```

### 2.2 修改静态元素颜色

只需修改 **一处**：

`src/theme/theme.css` 中的 `--color-*` 变量。

```css
/* 改 footer 颜色：同时改 night 和 day */
:root { --color-footer: #888; }              /* night */
[data-theme="day"] { --color-footer: #64748b; }  /* day */
```

### 2.3 修改 Scene 背景色

`src/r3f/ScrollRig.ts` 中的模块级 Color 对象：

```ts
const _bgNightTarget = new Color('#050811')  // night: Act 3 保持暗
const _bgDayTarget = new Color('#f1f5f9')    // day: Act 3 白化目标
```

`_bgBaseColor`（`#050811`）是 Act 1 场景背景，通常不改。

---

## 3. 新增主题

当前系统设计为 night/day 二元切换。要新增主题（如 `sepia`），需要：

### 3.1 扩展数据类型

```ts
// scrollStore.ts
export type DayNight = 'night' | 'day' | 'sepia'  // 新增
```

### 3.2 新增色板

```ts
// palettes.ts
export const SEPIA_ACT1: ThemeVars = { ... }
export const SEPIA_ACT3: ThemeVars = { ... }
```

### 3.3 新增 CSS 主题

```css
/* theme.css */
[data-theme="sepia"] {
  --color-body-bg: #faf0e6;
  /* ...全部静态变量 */
  --tw-echo: #...;
  /* ...全部 terminal 初始变量 */
}
```

### 3.4 更新 blend 逻辑

当前 `blendThemeVars` 是二元 crossfade（night ↔ day）。多元主题需改为 N 路 blend。最简单方案是为每个主题对计算 blend、取加权平均。更复杂的方案是改为目标色板直接 tween（放弃 crossfade）。

### 3.5 更新命令

```ts
// commands.ts
{
  name: 'sepia',
  description: 'Switch to sepia mode',
  handler: () => {
    useScrollStore.getState().setDayNight('sepia')
    return 'switched to sepia mode'
  },
}
```

### 3.6 Scene 背景

```ts
// ScrollRig.ts
const _bgSepiaTarget = new Color('#faf0e6')

// sceneApplyWhiteOut 中需处理三元 lerp
```

---

## 4. 修改过渡效果

### 4.1 切换速度

`src/theme/useDayNight.ts` 中的 GSAP tween 配置：

```ts
gsap.to(blendRef, {
  current: target,
  duration: 0.6,           // 改为 1.0 = 更慢，0.3 = 更快
  ease: 'power2.inOut',    // 可选: 'power1.inOut', 'power3.inOut', 'linear'
  onUpdate: () => setThemeBlend(blendRef.current),
})
```

### 4.2 CSS 过渡速度

`src/App.css` 中 body 的 transition：

```css
body {
  transition: background-color 0.5s ease;  /* 改时长/缓动 */
}
```

⚠️ CSS 过渡时长应与 GSAP tween 接近（0.5s vs 0.6s），避免不同层出现明显的时间差。

### 4.3 Scroll 过渡曲线

`useDayNight.ts` 中 `handleThemeUpdate` 的 scrollT 计算：

```ts
const scrollT = sp * sp * (3 - 2 * sp) // smoothstep
```

可替换为其他缓动函数（如 `sp` = 线性），但 smoothstep 提供更自然的头尾缓入缓出。

---

## 5. 调试指南

### 5.1 检查当前主题状态

浏览器 Console：

```js
// 读取 Zustand store
document.documentElement.dataset.theme  // 'night' | 'day'

// 读取 blend 因子（模块级变量，无法直接访问）
// 观察 scene.background 颜色确认过渡是否执行
```

### 5.2 验证色板同步

```bash
# 检查 theme.css 和 palettes.ts 中同名变量值是否一致
grep -A1 "NIGHT_ACT1" src/theme/palettes.ts
grep -A1 ":root" src/theme/theme.css
```

手动对比 `--tw-echo`、`--tw-prompt` 等关键变量。

### 5.3 检查 data-theme 写入

```bash
# 确认 useDayNight 中有 data-theme 赋值
grep "dataset.theme" src/theme/useDayNight.ts
```

### 5.4 过渡卡顿排查

| 症状 | 可能原因 | 检查 |
|------|----------|------|
| 切换时闪烁 | CSS 初始值与 JS 色板不一致 | 对比 theme.css 和 palettes.ts |
| 终端颜色不改 | handleThemeUpdate 未执行 | TerminalBar 中 `onThemeUpdate` 是否连接 |
| Scene 背景不改 | setThemeBlend 未生效 | ScrollRig 中 `_themeBlend` 是否被更新 |
| body 背景不改 | data-theme 未写入或 CSS 选择器权重不足 | DevTools 检查 `<html>` 属性 + Computed Styles |

### 5.5 性能分析

- `sceneApplyWhiteOut` 在 `useFrame` 中每帧执行 — 确认无 `new` 分配（当前已全用预分配 Color 对象）
- `handleThemeUpdate` 在 `TerminalBar` useEffect 中执行 — 仅 scrollProgress 变化时触发，非每帧
- `blendThemeVars` 复用 `_blendCache` 对象 — 零分配

---

## 6. 已知问题与注意事项

### 6.1 页面刷新丢失主题

主题存储在 Zustand（内存），刷新后恢复默认 `'night'`。未来可扩展 `localStorage` 持久化。

### 6.2 品牌文字颜色固定时机

品牌文字的颜色由 CSS 变量 `--color-brand-line1/2` 控制，切换时间与 body 背景相同（CSS transition）。但品牌文字只在 Act 3 可见，如果用户在 Act 1 切换主题，品牌文字的颜色已被 CSS 变量覆盖，Act 3 出现时直接显示正确颜色。

### 6.3 Night Act 3 场景背景不白化

这是设计意图——Night 模式下 `_bgNightTarget = _bgBaseColor`，white-out lerp 不产生实际效果，Act 3 场景保持暗色调。

### 6.4 Act 1 Night-Only 约束

Act 1（sp < `WHITE_OUT_THRESHOLD`，0.40）中终端强制使用 night 色板。

实现位置：`src/theme/useDayNight.ts` → `handleThemeUpdate`：

```ts
const blend = sp < WHITE_OUT_THRESHOLD ? 0 : blendRef.current
```

`blendRef.current` 本身不受影响——`setDayNight` 的 effect 仍将其设为 target 值。抑制仅在渲染输出层，不影响状态。

如需移除该约束，将 `blend` 改回 `blendRef.current` 即可。

### 6.5 InfoPanelTerminal 跟随主主题

信息面板终端通过 `MainTerminal` 间接消费 `handleThemeUpdate` 的 CSS 变量继承链。如果将来需要独立主题，需为 `InfoPanelTerminal` 提供独立的 `onThemeUpdate`。
