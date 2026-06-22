# Actor 渲染层 — 维护指南

> 面向开发者的维护、调试与调参指南。设计文档见 [`design.md`](./design.md)，操作手册见 [`operation-guide.md`](./operation-guide.md)。

---

## 目录

1. [代码地图](#1-代码地图)
2. [调参指南](#2-调参指南)
3. [新增光晕层](#3-新增光晕层)
4. [修改颜色](#4-修改颜色)
5. [调试指南](#5-调试指南)

---

## 1. 代码地图

### 1.1 文件依赖

```
Canvas.tsx
  ├── Planets.tsx           行星 ×3 + 4 层光晕
  │     ├── AtmosphereShader.ts   Fresnel 薄壳 GLSL
  │     ├── useAppearanceFade.ts  外观 scale/opacity 计算
  │     ├── useOrbitPosition.ts   轨道位置
  │     └── useOcclusionFade.ts   遮挡淡出
  ├── CentralStar.tsx        恒星 + 4 层光晕
  ├── DustField.tsx          碎片 InstancedMesh2 ×80
  └── PlanetClickHandler.tsx 行星点击检测
```

### 1.2 修改影响范围

| 修改目标 | 影响 | 风险 |
|----------|------|:---:|
| `CentralStar.tsx` — 常量区 | 恒星视觉外观 | 🟢 |
| `Planets.tsx` — 常量区 | 行星视觉外观 | 🟢 |
| `AtmosphereShader.ts` — GLSL | 所有 Fresnel 薄壳用户 | 🟡 |
| `Planets.tsx` — useMemo 结构 | 行星几何体创建 | 🔴 |
| `Planets.tsx` — useFrame 循环 | 行星动画 + 光晕动画 | 🔴 |
| `CentralStar.tsx` — useFrame | 恒星动画 | 🟡 |
| `useAppearanceFade.ts` | 所有粒子 scale/opacity | 🔴 |

---

## 2. 调参指南

所有可调参数在文件顶部的常量区块，带 `↑/↓` 注释。

### 2.1 CentralStar 参数速查

| 参数组 | 文件位置 | 关键常量 |
|--------|---------|---------|
| 几何 | `CentralStar.tsx:12-20` | `CORE_RADIUS`, `INNER_GLOW_RADIUS`, `SPRITE_SCALE`, `FAR_SPRITE_SCALE` |
| 颜色 | `:24-26` | `CORE_COLOR`, `INNER_GLOW_COLOR` |
| 光晕动画 | `:29-38` | `GLOW_OPACITY_COEFF`, `PULSE_FREQ_1/2`, `PULSE_AMP_1/2` |
| 近场 Sprite | `:41-43` | `SPRITE_SCALE`, `SPRITE_OPACITY_COEFF` |
| 远场 Sprite | `:46-49` | `FAR_SPRITE_SCALE`, `FAR_SPRITE_OPACITY_COEFF` |
| 纹理 | `:52-67` | `HALO_COLOR_STOPS`, `FAR_HALO_COLOR_STOPS` |

### 2.2 Planets 参数速查

| 参数组 | 文件位置 | 关键常量 |
|--------|---------|---------|
| 几何 | `Planets.tsx:26-27` | `PLANET_BASE_RADIUS` |
| 大气层 | `:34-45` | `ATMOS_SHELL_SCALE`, `INNER_GLOW_SCALE` 等 6 个 |
| 颜色 | `:48-57` | `PLANET_CORE_COLOR`, `INNER_GLOW_COLOR`, `FRESNEL_SHELL_COLOR` |
| 脉冲 | `:60-77` | `GLOW_PULSE_*`, `SPRITE_PULSE_*` |
| 纹理 | `:80-88` | `HALO_COLOR_STOPS` |

### 2.3 调参原则

- **先改 opacity，后改 scale**：opacity 控制"多亮"，scale 控制"多大"
- **保持层级比例**：外层应比内层 scale 更大、opacity 更低
- **脉冲振幅不宜过大**：> 0.15 会产生明显的闪烁感
- **颜色改动需同步纹理和材质**：改 `*_COLOR` 常量时，对应的 Sprite `HALO_COLOR_STOPS` 色系也要匹配

---

## 3. 新增光晕层

### 为 CentralStar 新增层

参照现有 4 层模式：

```ts
// 1. 添加常量
const NEW_LAYER_SCALE = 24.0
const NEW_LAYER_OPACITY_COEFF = 0.08

// 2. 创建纹理
const newTex = useMemo(() => makeHaloTexture(NEW_COLOR_STOPS), [])

// 3. 添加 ref
const newMatRef = useRef<SpriteMaterial | null>(null)

// 4. useFrame 中动画
if (newMatRef.current) {
  newMatRef.current.opacity = smooth3 * NEW_LAYER_OPACITY_COEFF * pulse
}

// 5. JSX 中渲染
<sprite renderOrder={1} scale={[NEW_LAYER_SCALE, NEW_LAYER_SCALE, 1]}>
  <spriteMaterial ref={...} map={newTex} blending={AdditiveBlending} transparent opacity={0} depthWrite={false} depthTest />
</sprite>
```

### 为 Planets 新增层

在 `useMemo` 的 `isMain` 分支中创建新 Mesh/Sprite → 存入数组 → 在 `useFrame` 中动画 → 在 JSX 中渲染。参照内层光晕的完整流程。

---

## 4. 修改颜色

### 修改材质颜色

改对应 `*_COLOR` 常量，保存后 HMR 即时生效。

### 修改 Sprite 渐变颜色

改 `HALO_COLOR_STOPS` / `FAR_HALO_COLOR_STOPS` 数组中的 `rgba` 值：

```ts
[0,    'rgba(R,G,B,A)'],  // 中心 → 改 R,G,B 调色相，改 A 调中心亮度
[0.15, 'rgba(R,G,B,A)'],  // 过渡带
[0.4,  'rgba(R,G,B,A)'],  // 衰减带
[0.7,  'rgba(R,G,B,A)'],  // 末端
[1,    'rgba(0,0,0,0)'],  // 边缘 → 通常保持完全透明
```

- 位置值 (0, 0.15, 0.4, 0.7, 1)：控制衰减节奏
- 颜色值：控制各位置的色调和透明度

### 修改 Fresnel 着色器颜色

改 `Planets.tsx` 中的 `FRESNEL_SHELL_COLOR` 常量（影响 `uColor` uniform）。

---

## 5. 调试指南

### 5.1 快速开关某层

将该层的 `*_SCALE` 设为 0 即可隐藏，不删除代码。

### 5.2 隔离调试

在 `useFrame` 中临时注释其他层动画，只保留目标层，观察独立效果。

### 5.3 确认 scale 跟随

在 Act 3 中检查内层光晕是否跟随行星核心：

```js
// Console 中检查
// 核心 scale ≈ 4.3（appearance.scale）
// 光晕 scale ≈ 4.3 × gPulse（应接近核心）
```

### 5.4 常见问题

| 症状 | 可能原因 | 检查 |
|------|----------|------|
| 光晕不可见 | opacity 太低或 scale 太小 | 增大 `*_OPACITY`，检查 `*_SCALE` |
| 光晕被核心覆盖 | scale 未乘 `appearance.scale` | 确认 useFrame 中有 `appearance.scale * gPulse` |
| 光晕颜色不对 | 材质颜色常量未更新 | 检查 `*_COLOR` 和 `HALO_COLOR_STOPS` |
| Sprite 不显示 | `ATMOS_HALO_SCALE` 为 0 | 设为有效值 (> 0) |
| Fresnel 不明显 | `pow(fresnel, 2.0)` 指数太高 | 降低到 1.5 扩大辉光宽度 |
