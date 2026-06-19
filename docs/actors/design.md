# Actor 渲染层 — 设计文档

> 面向开发者与架构决策。操作手册见 [`operation-guide.md`](./operation-guide.md)，维护指南见 [`maintenance-guide.md`](./maintenance-guide.md)。

---

## 目录

1. [架构总览](#1-架构总览)
2. [CentralStar 图层](#2-centralstar-图层)
3. [Planets 图层](#3-planets-图层)
4. [共享模式](#4-共享模式)
5. [渲染管线](#5-渲染管线)

---

## 1. 架构总览

CentralStar 和 Planets 共享相同的多层渲染模式，每层一个独立 Three.js 对象，从核心向外围逐层衰减。

```
核心 ──→ 内层光晕 ──→ 外层 Sprite ──→ 远场 Sprite
 (实体)   (透明球壳)   (Canvas 纹理)   (Canvas 纹理, 仅 Star)
```

### 文件地图

```
src/actors/
  CentralStar.tsx     恒星（4 层）
  Planets.tsx          行星 ×3（4 层）
  DustField.tsx        碎片 InstancedMesh2 ×80

src/shaders/
  AtmosphereShader.ts  行星 Fresnel 薄壳 GLSL

src/behaviors/
  useAppearanceFade.ts 外观计算（scale, opacity）
  useOrbitPosition.ts  轨道位置计算
  useOcclusionFade.ts  遮挡淡出
  useScreenSpaceHover.ts 屏幕空间 hover 检测
```

---

## 2. CentralStar 图层

4 层结构，从中心向外围：

| # | 层 | 类型 | 半径/Scale | 颜色 | 混合模式 | depthWrite |
|---|------|------|:---:|------|:---:|:---:|
| 1 | 核心 | MeshBasicMaterial | 0.42r | `#fff8e7` | Opaque | true |
| 2 | 内层光晕 | MeshBasicMaterial | 0.70r | `#ffe8c0` | Transparent | false |
| 3 | 近场 Sprite | CanvasTexture | 5.5x | 金色渐变 | AdditiveBlending | false |
| 4 | 远场 Sprite | CanvasTexture | 16.0x | 灰白渐变 | AdditiveBlending | false |

### 动画

- **内层光晕**：`opacity = smooth3 × 0.30 × pulse`，`scale = pulse`
- **近场 Sprite**：`opacity = smooth3 × 0.55 × pulse`
- **远场 Sprite**：`opacity = smooth3 × 0.18 × pulse`
- **pulse**：`1 + sin(t×1.8)×0.06 + sin(t×3.3)×0.04`

所有 opacity 乘以 `smooth3`（Act 3 进度），即恒星在 Act 3 出现前不可见。

### 参数位置

所有可调参数在文件顶部的常量区块，带 `↑/↓` 调参方向注释。

---

## 3. Planets 图层

每颗行星 4 层结构：

| # | 层 | 类型 | 创建半径 | 视觉半径(Act3) | 颜色 | depthWrite |
|---|------|------|:---:|:---:|------|:---:|
| 1 | 核心 | MeshBasicMaterial | 0.015 | 0.065 | `#f0f8ff`→`#64748b` | true |
| 2 | 内层光晕 | MeshBasicMaterial | 0.015×1.3 | 0.085 | `#f6f7f9b3` | false |
| 3 | Fresnel 薄壳 | ShaderMaterial(BackSide) | 0.015×1.03 | 0.067 | `#d0d5de` | false |
| 4 | Sprite 光晕 | CanvasTexture | 动态 | ~0.17 | 灰白渐变 | false |

### 核心 scale 因子

行星核心视觉大小 ≠ 创建半径。每帧乘以 `appearance.scale`（由 `calcAppearance` 计算，受相机距离、scroll 位置影响）。Act 3 时约 4.3×。

**内层光晕和 Fresnel 壳跟随 `appearance.scale`**，保持与核心的固定比例关系。Sprite 不跟随（独立于相机距离）。

### 动画

- **内层光晕**：`scale = appearance.scale × gPulse`，`opacity = planetOpacity × 0.20 × gPulse`
- **Fresnel 壳**：`scale = appearance.scale`，`opacity = planetOpacity × 0.35`
- **Sprite**：`scale = d.scale × d.scaleMult × 1.0 × pulse`，`opacity = planetOpacity × 0.32 × pulse`

### Fresnel 着色器

`AtmosphereShader.ts` — BackSide 渲染的 GLSL 着色器：

- `dot(normal, viewDir)` 计算边缘因子
- `pow(fresnel, 2.0)` 控制辉光宽度（越低越宽）
- `uColor` uniform 控制色系（行星灰白 `#d0d5de`）
- `uOpacity` uniform 控制整体不透明度

### 遮挡淡出

当一颗行星被聚焦（点击），其余行星的 opacity 通过 `calcOcclusionFade` 降低，避免遮挡视线。内层光晕和 Fresnel 壳的 opacity 同乘 `planetOpacity`，自动跟随。

---

## 4. 共享模式

### 多层衰减

CentralStar 和 Planets 共享相同的"多层衰减"架构：

```
层 N（内）→ 层 N+1（外）：几何体更大、opacity 更低、边缘更柔和
```

每一层覆盖不同的视觉距离：实体→近场散射→中程辉光→远场柔光。

### CanvasTexture 纹理

两个组件都使用 Canvas 2D API 创建径向渐变纹理：

```ts
function makeHaloTexture(stops: [number, string][]): CanvasTexture
```

色阶数组独立定义，纹理在组件挂载时创建一次（`useMemo`）。Planets 的 3 颗行星共享同一纹理。

### 参数命名约定

- `*_SCALE` — 几何体半径/缩放倍率
- `*_OPACITY` / `*_OPACITY_COEFF` — 不透明度系数
- `*_FREQ_*` — 脉冲频率
- `*_AMP_*` — 脉冲振幅
- `*_COLOR` — 颜色值
- `*_COLOR_STOPS` — 径向渐变色阶

---

## 5. 渲染管线

Canvas 内渲染顺序（renderOrder 从小到大）：

| renderOrder | 对象 | depthWrite |
|:---:|------|:---:|
| 0 | Act 1 海浪线、灯塔、光束 | false |
| 1 | 恒星核心、行星核心、光晕、Sprite、Fresnel 壳 | 核心=true, 其余=false |
| 2 | 恒星核心球、轨道环、网格线、碎片 ×80 | 核心=true, 其余=false |
| 9999 | 行星标签 Sprite（depthTest=false） | false |

### frameloop 机制

`frameloop="demand"` — 仅在 `scrollProgress` 变化时渲染。`useFrame` 回调按 scene graph 顺序执行：ScrollInvalidator → Planets → DustField → Act 组件。
