# 源码结构分析（历史参考）

> **⚠️ 本文档分析的是迁移前的 Vue + Vanilla Three.js 原版架构。** 当前项目已迁移至 React 19 + R3F v9 + TypeScript。本文档保留作为重构决策的历史背景（理解"为什么这样拆分"），当前实际架构见 [`README.md`](../README.md) 和 [`docs/HANDOFF.md`](./HANDOFF.md)。

> 本文档为接下来的重构工作提供参考。逐文件拆解设计意图、内部职责、耦合关系，以及发现的问题。

---

## 总览

项目共 8 个源文件（不含配置），分为三个层次：

```
入口层       main.js              — Vue 应用初始化，GSAP 全局注册
页面层       App.vue              — 滚动逻辑、DOM 叠加层、桥接 Three.js ↔ Vue
3D引擎层     LighthouseScene.vue  — 全部 Three.js 对象、动画循环、Act 调度
辅助         AppFooter.vue        — 静态页脚
             main.css             — 全局样式
外部         stats_server.py      — 独立 Python 后端（不属于前端构建体系）
```

**核心数据流：**

```
用户滚动/点击 → App.vue（scrollProgress 0→1）→ LighthouseScene.vue（动画循环）
                                               → CSS 变量（品牌文字位移）
                    ← LighthouseScene.vue emit（focus-change, overlay-data）←
```

---

## 一、入口：`main.js`

**职责：** 应用启动、GSAP 插件注册、挂载 Vue 实例。

**设计意图：**
- 文件极简（11 行），刻意不承载业务逻辑
- `gsap.registerPlugin(ScrollTrigger)` 在入口处一次性注册，确保任何组件使用时插件已就绪
- `gsap.defaults({ duration: 0.6, ease: 'power2.out' })` 为项目中所有 GSAP 动画设定统一的默认参数——这影响 `App.vue` 中品牌文字淡出等所有未显式指定 duration/ease 的 tween

**耦合点：**
- 与 `App.vue` 通过 Vue 组件树单向依赖
- 不直接依赖 `LighthouseScene.vue`

---

## 二、页面层：`App.vue`

### 2.1 整体结构

```
<script setup> ~200 行
  ├── 常量 & 状态变量
  ├── 物理滚动系统（ticker + wheel + scrollbar）
  ├── 点击快进系统
  ├── 灯塔截图触发
  ├── 聚焦响应（品牌文字动画）
  └── 生命周期（onMounted / onUnmounted）

<template> ~60 行
  ├── LighthouseScene（canvas）
  ├── 聚焦 SVG 叠加层
  ├── 滚动提示
  ├── 品牌文字
  └── AppFooter

<style> ~120 行
  ├── 滚动提示动画
  ├── 品牌文字样式
  ├── 聚焦 SVG 动画
  └── 灯塔图标样式
```

**设计意图：** `App.vue` 是"页面调度器"——它不拥有任何 Three.js 对象，但拥有所有 DOM 层和滚动控制权。它与 `LighthouseScene.vue` 通过 **props 向下、events 向上** 的模式通信。

### 2.2 物理滚动系统

**设计意图：** 替换浏览器原生滚动的线性映射，实现带惯性的"手感"。GSAP ScrollTrigger 负责响应原生滚动条拖拽；自定义 ticker 负责滚轮动量。

**状态机：**

```
[空闲] ←→ [滚轮动量] ←→ [滚动条拖拽] ←→ [点击快进]
              ↕                    ↕
         聚焦时阻止              抢占滚轮动量
```

**关键细节：**
- `_physTarget` 是唯一真相源（single source of truth），`scrollProgress`、`syncScrollbar()`、物理 ticker 均围绕它运转
- `FRICTION = 0.955` 和 `MAX_VELOCITY = 0.025` 是手感参数，按 60fps 基准设计，通过 `Math.pow(FRICTION, dtFrames)` 实现帧率无关
- `_lastScrollbarTime < 80ms` 守卫防止物理 ticker 与滚动条拖拽冲突
- 聚焦时 `isAct3Focused` 通过 `onWheel` 的早期返回来阻止滚动

### 2.3 点击快进

**设计意图：** 用户无需完整滚动，点击即可 2 秒过渡到末尾。用 GSAP tween 驱动 `_physTarget`，同步更新 `scrollProgress` 和 `clickProgress`。`effectiveProgress` 在快进期间使用 `clickProgress`，否则使用 `scrollProgress`——这确保了 Three.js 场景和品牌文字在快进时也同步动画。

**注意：** 快进期间会设置 `no-transition` class 来禁用品牌文字的 CSS transition，避免 CSS 和 GSAP 同时操作 opacity 发生冲突。

### 2.4 灯塔截图

**设计意图：** 在 `scrollProgress >= 0.54` 时触发，仅执行一次（`_lighthouseCaptured` 守卫）。这个时机在白化接近完成时（0.55），灯塔还未完全被白雾遮挡。截图通过 `defineExpose` 暴露的 `captureLighthouse()` 生成 PNG data URL，用于品牌文字旁的 `<img>`。

**耦合：** App.vue 不关心截图如何实现，只通过 ref 调用。这是目前项目中唯一的父子组件方法调用。

### 2.5 品牌文字动画

**设计意图：** 两行文字错开淡入（line1 0.70–0.82，line2 0.82–0.92），用 `smoothstep` 实现缓入缓出。聚焦时通过 GSAP tween 淡出并上移 24px；取消聚焦时恢复。

**CSS 变量驱动：** `--text-offset-y` 由 `LighthouseScene.vue` 中的 `updateTextOffsetCSS` 根据 Act 3 进度计算（-90px * smoothProgress），用于 Act 3 场景下移时品牌文字同步上移。

### 2.6 聚焦 SVG 叠加层

**设计意图：** 纯展示层，数据完全由 `LighthouseScene.vue` 通过 `overlay-data` 事件提供。渲染两个虚线圆 + 两条外公切线，带入场动画（`ring-in` / `line-in` CSS keyframes）。

**为什么放在 App.vue？** 因为这是 DOM/SVG 层而非 Three.js 层。叠加层的 z-index（5）位于 canvas（z-index: 0）之上、品牌文字（z-index: 10）之下。放在 LighthouseScene 中会导致职责混杂。

---

## 三、3D 引擎层：`LighthouseScene.vue` — 详细分析

这是项目中最复杂的文件（~1580 行），承载全部 Three.js 逻辑。以下逐段拆解其内部结构和每一处设计决策。

### 3.1 文件结构总览

```
│ 行号    │ 区域                          │ 行数  │
│ 1–11    │ Vue 脚手架 (import, props, emit)│ 11    │
│ 13–16   │ 全局变量声明                    │ 4     │
│ 18–37   │ 共享常量                        │ 20    │
│ 39–88   │ 预分配对象池 (42 个复用对象)     │ 50    │
│ 90–100  │ 帧缓存守卫变量                   │ 10    │
│ 102–113 │ 工具函数 (shortestDelta, smoothstep) │ 12 │
│ 115–125 │ StateContext 类                 │ 11    │
│ 127–160 │ VolumetricBeamShader 着色器      │ 34    │
│ 163–196 │ Scene Manager (白化过渡)         │ 34    │
│ 198–924 │ ▸ Act 1 OceanVoyage            │ 727   │
│ 926–1052│ ▸ Act 2 GridTransition          │ 127   │
│ 1054–1356│ ▸ Act 3 ContentPhase           │ 303   │
│ 1358–1377│ Act Manager (resolveActiveActs) │ 20    │
│ 1379–1405│ 动画循环 animate()              │ 27    │
│ 1407–1412│ onResize                       │ 6     │
│ 1413–1461│ 鼠标/点击事件处理               │ 49    │
│ 1462–1471│ CSS 变量更新                    │ 10    │
│ 1473–1521│ captureLighthouse              │ 49    │
│ 1523–1576│ onMounted / onUnmounted        │ 54    │
│ 1577–1583│ <template>                     │ 6     │
```

### 3.2 模块级变量全景

在深入各函数之前，必须理解文件中所有模块级变量的归属关系——因为 Three.js 没有依赖注入，所有状态通过闭包共享。

```
全局 Three.js 核心 (4):
  renderer, scene, camera, animationId
  → 由 onMounted 初始化，animate() 使用，onUnmounted 销毁

Act 1 对象 (8 个数组/引用):
  lighthouseGroup, beamPivot        — 灯塔、光束枢轴
  beamCones[], beamRays[], beamGlow — 光束组件
  oceanLines[], waveData[],         — 波浪线 + 动画参数
  waveBaseColors[], dustParticles[] — 波浪颜色 + 粒子

Act 2 对象 (2):
  gridVerticalLines[], _gridPoints  — 垂直网格线 + 节点

Act 3 对象 (10+):
  _orbitLines[], _gyroGroups[], _planetLabels[] — 轨道/陀螺仪/标签
  _starGroup, _starGlow            — 中央恒星
  _mainPlanetIndices[]             — 主行星在 dustParticles 中的索引
  _hoveredIdx, _focusedPlanetIdx   — 交互状态
  _mouseNDC, _lastTimeSec          — 鼠标坐标, 时间追踪
  _labelOpacityCurrent             — 标签透明度缓动值
  act3Initialized                  — 构建守卫

场景全局 (5):
  _ambientLightRef, _ptLightRef    — 光照引用
  _bgBaseColor, _bgTargetColor, _bgLerpColor — 背景色过渡

Act 管理器 (2):
  builtActs, _activeActsCache      — 已构建集合, 活跃 Act 缓存
```

**关键观察：** Act 1 的对象声明分布在 act1 定义之前（第 203–207 行），但 Act 2/3 的对象声明在各自 act 定义块内部——声明风格不一致，是多次增量开发的结果。

### 3.3 预分配对象池（第 39–88 行）

42 个预分配的 `Vector3`/`Color`/`Quaternion` 对象，全部以 `_` 前缀命名。设计意图：

- **零 GC 压力**：热点路径（每帧调用）中禁止 `new`，所有中间计算复用预分配对象
- **语义命名**：`_dustBwo` = Beam World Origin, `_occCamToPlanet` = Occlusion Camera To Planet
- **分区域归属**：波浪光束计算 → 尘埃计算 → 相机聚焦 → 屏幕投影 → 杂项

潜在问题：
- `_clickNDC`（第 55 行）声明后从未使用——冗余
- 对象池散落在文件中，没有像 Rust 那样集中管理的 `struct` 或命名空间，新增功能时容易忘记复用已有对象

### 3.4 帧缓存守卫（第 90–100 行）

```
_lastWavesTime / _lastWavesSp  → animateWavesAndLighting()
_lastGridSp                    → animateVerticalGrid()
_lastDustTime / _lastDustSp    → animateDust()
_lastBeamTime / _lastBeamSp    → animateBeam()
```

**机制：** 每个动画函数在入口处检查 `(time, sp)` 是否与上次调用完全相同——若相同则直接 return，跳过整个逐顶点/逐粒子更新。这在以下场景生效：
- 渲染器 re-render（窗口 resize、另一处调用 `renderer.render()`）
- 同一帧内多次调用 `animate()`（理论上不应发生，但作为安全网）

**不足：** 守卫变量散落各处，新增动画函数时容易遗忘。`animateWavesAndLighting` 同时检查 time 和 sp，而 `animateVerticalGrid` 只检查 sp——不一致，因为网格动画不依赖 time。

### 3.5 `StateContext`（第 115–125 行）

```js
class StateContext {
  constructor() { this._store = new Map() }
  set(key, val)  { this._store.set(key, val) }
  get(key)       { return this._store.get(key) }
  has(key)       { return this._store.has(key) }
}
const ctx = new StateContext()
```

一个通用键值存储，用于 act 之间传递状态。**当前使用情况：**
- `act1.exit()` → 写入 `oceanLines`, `waveData`, `waveBaseColors`, `beamFinalAngleY`, `beamFinalAngleX`
- `act2.exit()` → 写入 `gridVerticalLines`
- **没有任何 `ctx.get()` 调用！** —— 写入但从未读取

**结论：** `StateContext` 是预留的跨 act 通信机制，但当前实际未使用。可能是早期设计时计划在 act 间传递状态，后来改为直接通过闭包变量共享。**重构时可安全移除或搁置评估。**

### 3.6 `VolumetricBeamShader`（第 127–160 行）

自定义 ShaderMaterial，用于光束锥体的体感效果：

**vertexShader：** 将法线和视图位置传入片元着色器
**fragmentShader：** 两项核心计算
1. **菲涅尔边缘发光**：`pow(abs(dot(normal, viewDir)), uEdgePower)` — 边缘越倾斜越亮，模拟体积散射
2. **长度衰减**：`pow(clamp(1 - abs(vPosition.y) / uLength), 1.5)` — 锥体底部最亮，尖端渐暗

uniform 参数：
- `uColor` — 光束颜色（`#f0f7ff`，冷白）
- `uOpacity` — 由 `animateBeam` 动态调整（3 个锥体不同基础值）
- `uLength` — 锥体长度
- `uEdgePower` — 菲涅尔指数（3 个锥体从小到大：4.0 / 2.5 / 1.5，外锥更柔和）

### 3.7 Scene Manager — `sceneApplyWhiteOut()`（第 163–196 行）

**职责：** 管理场景的背景色、雾浓度、环境光强度、光束可见性——这些是跨 Act 的全局效果。

**算法：**

```
woF = clamp((sp - 0.40) / (0.55 - 0.40), 0, 1)   // 白化因子 0→1

背景色:  lerp(#050811, #f1f5f9, woF)

雾:      sp ∈ [0.40, 0.55): density 0.02 → 0.10  (增强雾)
         sp ∈ [0.55, 0.85]: density 0.10 → 0      (雾消散)
         sp < 0.40:        density 0.02           (恒定薄雾)
         density < 0.001:  移除 fog 对象          (性能)

环境光:  1.4 + woF * 3.5  (从暗场景到亮场景)

光束:    当 woF >= 1.0（白化完成）时隐藏 beamPivot
```

**设计意图：** 集中管理"场景全局氛围"的过渡——而不是在每个 Act 的 animate 中重复处理。白化过渡与 Act 1→2 的切换重叠（Act 1 结束于 0.45，白化开始于 0.40），5% 的重叠区产生交叉淡入淡出效果。

### 3.8 Act 1 — OceanVoyage（第 198–924 行，727 行）

#### 3.8.1 模块级变量（第 201–211 行）

```
lighthouseGroup, beamPivot        — 灯塔 Group + 光束旋转枢轴
beamCones[3], beamRays[2]        — 光束子对象数组
beamGlow                          — 光束发光球
oceanLines[50]                    — 波浪线对象
waveData[50], waveBaseColors[50]  — 每线的动画参数和基础颜色
dustParticles[135]                — 粒子对象

baseBeamAngle, returnToIdleTime, idlePhase
scrollStartAngle, scrollStartAngleX
wasScrolling                      — 光束状态机变量
```

#### 3.8.2 `act1.build()` — 构建管线（第 213–220 行）

调用顺序有严格要求：
1. `buildSky()` — 必须先执行（设置 scene.background / fog）
2. `buildOcean()` — 在雾气环境中创建波浪
3. `buildLighthouse()` — 创建灯塔（含 `lighthouseGroup`）
4. `buildLightBeam()` — 依赖 `lighthouseGroup.position`（第 370 行）
5. `buildDust()` — 依赖 `lighthouseGroup.getWorldPosition()`（第 449 行）和 `_mainPlanetIndices`
6. `buildLights()` — 依赖 `lighthouseGroup.position`（第 501 行）

**警告：** 构建顺序隐式依赖——`buildLightBeam` 读取 `lighthouseGroup.position`，`buildDust` 调用 `lighthouseGroup.getWorldPosition()`，`buildLights` 复制 `lighthouseGroup.position`。如果将来调整构建顺序，会导致光束、粒子、光源的初始位置错误。

#### 3.8.3 `buildOcean()` — 第 227–265 行

**算法：**

```
参数: TOTAL=50, POWER=2.2
对每条线 i (0..49):
  t      = i / 49                              // 线性索引
  curveT = t ^ 2.2                              // 非线性映射 → 远景线更密集
  z      = lerp(-52, 5, curveT)                 // 近大远小
  baseY  = lerp(-3.5, -1.5, curveT)             // 远景线稍高
  amplitude = lerp(0.05, 0.50, curveT)          // 远景线振幅更大
  frequency = lerp(0.12, 0.34, curveT)          
  speed     = lerp(0.05, 0.40, curveT)          
  opacity   = lerp(0.15, 0.70, curveT)          
  span      = lerp(45, 80, curveT)              // 远景线跨度更大
  color     = lerp(#060c1a, #0c1a2a, curveT)    // 远景线更亮
```

每条线 150 个顶点（`segCount = 150`，总顶点数 = 50 × 151 = 7550 个）。顶点颜色预填充到 `Float32Array`，避免每帧重新计算。

**设计意图：** `POWER=2.2` 的非线性映射创造深度感——近处 20 条线（实际约 40%）对应前 60% 的 Z 空间，而远处 30 条线拥挤在剩余 40% 的 Z 空间。视觉效果更自然，因为人类视觉对近处物体的间距变化更敏感。

#### 3.8.4 `buildLighthouse()` — 第 267–366 行

**结构：** 约 30 个 THREE.Mesh 组装成一个层次化的 `lighthouseGroup`：

```
lighthouseGroup (scale=0.7, position=(0,-2.5,SCENE_CENTER_Z))
├── 地基 Cylinder          (y=-0.9)
├── 遮罩 Cylinder (半透明)  (y=-0.95)  — 黑色半透明，融入背景
├── 岩石底座 Cylinder      (y=-0.1)
├── 过渡环 Torus           (y=0.12)
├── 塔身 Cylinder (锥形)   (y=1.3)     — 上窄下宽
├── 装饰带 ×2              (y=0.6, 1.8)
├── 窗户 ×2                (y=1.0, 1.9) — 含发光玻璃
├── 阳台 Cylinder          (y=2.6)
├── 平台板 Cylinder        (y=2.67)
├── 栏杆组 Group           (y=2.68)
│   ├── 护栏环 Torus
│   └── 栏杆柱 ×8
├── 灯座框 Cylinder        (y=2.74)
├── 玻璃罩 Cylinder (open) (y=2.96)     — 自发光，半透明
├── 灯泡 Sphere            (y=2.96)     — BasicMaterial 发光
├── 玻璃框架柱 ×6          (y=2.96)
├── 屋顶板 Cylinder        (y=3.18)
├── 穹顶 Hemisphere        (y=3.20)
├── 尖顶底座 Cylinder      (y=3.42)
├── 黄铜球 Sphere          (y=3.47)
└── 尖顶锥体 Cylinder      (y=3.65)
```

**材质策略：**
- 主体 → `MeshStandardMaterial`（需要光照，有粗糙度/金属度）
- 窗户发光玻璃 → `MeshStandardMaterial` + emissive（自发光）
- 灯泡 → `MeshBasicMaterial`（不受场景光照影响，始终亮）
- 遮罩/光束 → `MeshBasicMaterial`（纯色，不需要光照计算）

**灯塔中心：** 理解 `lighthouseGroup.position.set(0, -2.5, SCENE_CENTER_Z)` 的设计意图——这是灯塔模型的"世界锚点"。模型自身的几何体中心在本地坐标系中约 y≈1.5（从地基 y=-0.9 到尖顶 y≈3.68），减去 2.5 后世界 Y 约 -1.0，正好与后续 Act 3 的轨道中心 `(0, -1.0, SCENE_CENTER_Z)` 对齐。Z 轴统一使用 `SCENE_CENTER_Z = -16.0`。

#### 3.8.5 `buildLightBeam()` — 第 368–407 行

**层次结构：**

```
beamPivot (position = lighthouseGroup位置 + 灯泡Y偏移*缩放)
├── cone0 (radius=0.5, length=28, opacity=0.85, edgePower=4.0)  ← 内核
├── cone1 (radius=1.8, length=32, opacity=0.45, edgePower=2.5)  ← 中层
├── cone2 (radius=4.8, length=36, opacity=0.15, edgePower=1.5)  ← 外层
├── ray_left  (Line, 顶点渐变色, opacity=0.45)                   ← 左侧射线
├── ray_right (Line, 顶点渐变色, opacity=0.45)                   ← 右侧射线
└── glow      (Sphere, radius=0.22, opacity=0.95)                ← 光源辉光
```

**关键设计：** `beamPivot` 是独立的 `Group`，不挂在 `lighthouseGroup` 下——这样光束的旋转不影响灯塔模型本身。但 `beamPivot.position` 拷贝自 `lighthouseGroup.position` 并加上灯泡的 Y 偏移（`2.96 * 0.7 = 2.072`）。

锥体使用 `ConeGeometry(radiusTop, height, 32, 1, true)` ——注意 `true` 参数表示 open-ended（无底面），避免不必要的三角形。锥体初始顶点朝上（+Y），通过 `rotation.x = -Math.PI/2` 转为水平（朝 +Z），再通过 `beamPivot` 的旋转控制方向。

**着色器：** 每个锥体使用独立的 `ShaderMaterial` 实例（共享 vertexShader/fragmentShader 源码），拥有独立的 uniform 副本——这意味着可以通过 `c.material.uniforms.uOpacity.value = ...` 分别控制每个锥体的透明度。

#### 3.8.6 `buildDust()` — 第 409–493 行

粒子创建算法（共 135 个）：

```
第一步：生成配置
  对每个 i: scale ∈ [0.4, 1.2], sizeBoost ∈ {大(60%) 或 小(40%)}, totalSize = scale * sizeBoost

第二步：排序 → 选出 TOP 3 = _mainPlanetIndices
  sorted = dustConfigs 按 totalSize 降序
  _mainPlanetIndices = sorted[0..2].idx

第三步：对每个粒子 i:
  isMain = _mainPlanetIndices.includes(i)
  geometry = isMain ? 32×32 球 : 10×8 球
  material = BasicMaterial, opacity=0, depthWrite=isMain

  初始位置：从 lighthouseGroup 世界位置 + 灯泡偏移出发
    方向: 随机角度 + 随机距离(√分布, 近处更密)
    Z 分量: 1 + t*41 (1~42 单位深度)

  userData 赋值:
    Act 1 位置: wx,wy,wz + 随机漂移速度 dx,dy,dz + 相位 ph
    灰度色: grayHex (用于 Act 2 过渡)
    轨道参数:
      主行星 — orbitR=ORBIT_RADII[trackIdx], speed=-0.04-trackIdx*0.015, scaleMult=2.4+trackIdx*0.2
      碎片   — orbitR=2.5+random*4.5, speed=-0.03-random*0.08, scaleMult=0.4+random*0.9, wobble
    orbitTilt=0, flattenY=1.0 (预留，当前未使用)
```

**`√` 分布：** `Math.sqrt(Math.random()) * maxR` 产生更密集的近处分布——均匀随机会产生更多粒子在远处（因为圆面积 ∝ r²），√ 矫正后粒子在圆盘上均匀分布。

**为什么 `depthWrite: isMain`？** 主行星需要正确的遮挡关系（在轨道环前面遮挡环），小碎片不需深度写入以避免大量半透明粒子的深度排序问题。

#### 3.8.7 `buildLights()` — 第 495–504 行

```
AmbientLight('#222d3d', 1.4)      — 基础环境光，冷色调
DirectionalLight('#aed2ff', 1.8)  — 主光 (15,10,-10)，模拟月光
DirectionalLight('#ffffff', 0.5)  — 补光 (-15,12,-35)，从远处补充
PointLight('#ffffff', 3.0, 15)    — 点光源在灯泡位置，距离15
```

`_ptLightRef` 和 `_ambientLightRef` 保存引用——`animateBeam()` 和 `sceneApplyWhiteOut()` 需要动态修改它们的强度。

#### 3.8.8 `act1.animate()` — 第 506–509 行

极简——只恢复可能被 Act 2/3 exit 隐藏的对象。所有实质动画由独立函数处理。

#### 3.8.9 `animateWavesAndLighting()` — 第 511–589 行

**入口守卫：** `_lastWavesTime` / `_lastWavesSp` 帧缓存

**第一阶段：计算全局因子**

```
act3Progress     = clamp((sp - 0.85) / 0.15, 0, 1)    // Act 3 进度
smoothProgress3  = smoothstep(act3Progress)            // 缓动版本
gridOpacityMult  = 1 - smoothProgress3                 // Act 3 越高，波浪越透明
shiftY           = -32 * smoothProgress3               // Act 3 下移量
```

**第二阶段：批量可见性**

当 `gridOpacityMult < 0.001`（即 Act 3 几乎完全展开）时，隐藏所有波浪线并直接返回——这是性能优化，因为后续的逐顶点循环（50×151 = 7550 次迭代）完全没必要。

**第三阶段：光束高亮计算**

```
hlWeight = clamp((0.40 - sp) / 0.10, 0, 1)  // sp 越接近 0.40，高亮越弱
                                            // sp ≤ 0.30 时 hlWeight = 1（最大高亮）
```

获取 `beamPivot` 的世界位置和方向向量——用于后续逐顶点计算中判断每个波浪顶点是否在光束照射范围内。

**第四阶段：逐线循环（50 条线）**

对每条线：
1. 计算 `baseDepthFade`：远处线（z 接近 -52）更透明，近处线不透明
2. 对每个顶点（151 个/线）：
   - **Y 坐标动画**：双频正弦波 `mainWave + secondHarmonic`，按 `gridFactor` lerp 到平坦的 `baseY`，再加上 `shiftY`（Act 3 下移）
   - **光束照明**：将顶点投影到光束方向，计算到光束轴线的 2D 距离，用高斯衰减 `exp(-distSq * 0.9)` 得出照明强度。三段衰减：近距离衰减、锥体外衰减、角度衰减。最终 `li = di * 1.5 * hlWeight`
   - **颜色过渡**：从光束高亮色（冷白 `#ebf7ff`）lerp 到目标网格色（`#94a3b8`），比例由 `gridFactor` 控制

3. 更新 opacity：`lerp(data.opacity, 0.45, gridFactor) * baseDepthFade * gridOpacityMult`

**为什么是双频正弦波？** `sin(x*f1 + t*speed) + sin(x*f1*1.8 + t*speed*1.2) * 0.4` ——主频 + 二次谐波产生更自然的波形，而非单一正弦的"太规律"感。

#### 3.8.10 `animateBeam()` — 第 591–631 行

**光束状态机（三种模式）：**

**模式 1 — 空闲漫游（`sp <= 0.005`）：**
```
if wasScrolling → 记录过渡起点：
  baseBeamAngle = 当前Y旋转
  idlePhase = 基准角度 - wandY(wanderY(time))
  
wanderY = time*0.20 + sin(time*0.12)*2.2 + cos(time*0.41)*0.5  ← 三频复合波
wanderX = 0.06 + sin(time*0.3)*0.03 + cos(time*0.67)*0.015

如果 idle 启动后 < 1.5s:
  平滑过渡到漫游位置（smoothstep 缓动）
否则:
  直接跟随漫游函数
```

**模式 2 — 滚动归位（`0.005 < sp < WHITE_OUT_THRESHOLD`）：**
```
记录滚动起始角度
targetY = scrollStartAngle + shortestDelta(→0) * smoothstep(sp/0.40)
targetX = lerp(scrollStartAngleX, -0.02, smoothstep(sp/0.40))
→ 光束从任意方向平滑回到正前方（rotation.y → 0）
```

**模式 3 — 白化增强（`sp >= WHITE_OUT_THRESHOLD` → 由 `sceneApplyWhiteOut` 接管）：**
```
锁定角度 (targetY=0, targetX=-0.02)
逐渐增加光束不透明度（通过 beamFade）
→ 白化完成时 beamPivot 整体隐藏
```

**透明度控制：**
```
beamBoost = sp^1.5 * 0.4                    // 随滚动增强
wof = clamp((sp - 0.40) / 0.15, 0, 1)      // 白化因子
beamFade = 1 - wof                           // 白化越深，光束越淡

cone[i].opacity = (base[i] + beamBoost * multiplier + wof * 1.5) * beamMult * beamFade
rays.opacity    = (0.45 + sp*0.35 + wof*0.5) * beamMult * beamFade
glow.opacity    = 0.95 * beamFade
ptLight.intensity = (3.0 + sp^1.5*12 + wof*50) * beamMult * beamFade
```

**为什么在 `sp >= WHITE_OUT_THRESHOLD` 时 beamBoost/w of 继续增强？** 因为在白化过渡区间（0.40–0.55）用户还能看到光束，增强光束能产生壮观的"最后闪耀"效果，然后在白化完成时瞬间隐藏。

#### 3.8.11 `animateDust()` — 第 633–771 行（139 行，最复杂函数）

**入口守卫：** `_lastDustTime` / `_lastDustSp` 帧缓存

**第 1 段（640–643）：全局因子**
```
wof             = clamp((sp - 0.40) / 0.15, 0, 1)
act3Progress    = clamp((sp - 0.85) / 0.15, 0, 1)
smoothProgress3 = smoothstep(act3Progress)
isFullyFormed3  = act3Progress >= 0.95  → 此时轨道完全形成，启用悬停检测
```

**第 2 段（645–648）：光束世界坐标**
```
当 sp < 0.55 时，更新 _dustBwo（光束世界原点）和 _dustBeamDir（光束方向）
→ 用于后续的粒子光束亮度计算
```

**第 3 段（650–673）：悬停检测（仅 Act 3 完全形成时）**
```
对每个主行星（isMainPlanet）：
  投影位置到 NDC → 计算与鼠标 _mouseNDC 的屏幕空间距离（X 轴按宽高比矫正）
  
迟滞阈值：
  进入：distance < 0.16
  退出：distance > 0.22（当已有 hover 目标时）
  
→ 更新 _hoveredIdx 和 canvas cursor 样式
```

**第 4 段（679–681）：时间增量**
```
dt = min(0.1, time - _lastTimeSec)  // 上限 0.1s 防止切标签页后的大跳跃
_lastTimeSec = time
```

**第 5 段（684–710）：位置计算（135 粒子循环）**

对每个粒子：

*Act 1 基线位置（类柏林噪声）：*
```
bx = wx + sin(time*0.4 + ph)*0.25
by = wy + sin(time*0.3 + ph+1)*0.18
bz = wz + sin(time*0.25 + ph+2)*0.15
```
三个不同频率的独立正弦波产生伪随机飘浮感。

*Act 3 轨道位置：*
```
effectiveSpeed = _baseSpeed * (1 - hoverFactor * 0.80)  // 悬停时减速 80%
orbitAngle += dt * effectiveSpeed
wobbleR = isMain ? orbitR : orbitR + sin(time*wobbleFreq+ph)*wobbleAmp  // 碎片有额外摆动
ox = cx + cos(orbitAngle) * wobbleR
oy = cy
oz = cz + sin(orbitAngle) * wobbleR
```

*过渡：* `p.position.set(lerp(bx,ox,smooth3), lerp(by,oy,smooth3), lerp(bz,oz,smooth3))`

**第 6 段（712–715）：缩放基准**

```
refPos = isMain ? camera.position : _defaultCamPos  // 非主行星不受相机聚焦影响
cd = distance(p.position, refPos)
ds = 22 / max(5, cd)  // 距离越远，缩放越大（透视补偿）
```

**第 7 段（717–727）：光束亮度因子**

```
if sp < 0.55 && beamPivot:
  将粒子投影到光束轴线上
  计算到轴线的垂直距离
  如果距离 < 光束半径: bf = (1 - dist/radius)^1.8
```

**第 8 段（729–736）：缩放计算**

```
scaleAct1 = d.scale * (0.4 + bf*2) * ds    // 基础大小 + 光束亮度增强
scaleAct2 = d.scale * 0.7 * d.sizeBoost * ds // 过渡到自定义 boost
scaleAct3 = scaleAct2 * d.scaleMult           // 轨道缩放倍数

currentScale = lerp(scaleAct1, scaleAct2, wof)  // Act 1→2 过渡
currentScale = lerp(currentScale, scaleAct3, smoothProgress3)  // Act 2→3 过渡
finalScale = currentScale * (1 + hoverFactor * 0.35)  // 悬停放大约 35%
```

**第 9 段（738–748）：不透明度计算**

```
opacityAct1 = (0.14 + bf*0.76) * (0.35 + sp*0.65)  // 光束亮度 + 滚动进度
  + 近距衰减: if cd<7 → *= (cd-2.5)/4.5
  + 远距衰减: if cd>42 → *= 1 - (cd-42)/10

opacityAct2 = 0.4  // 固定过渡值
opacityAct3 = isMain ? 1.0 : 0.55  // 主行星完全不透明，碎片半透明

currentOpacity = lerp(opacityAct1, opacityAct2, wof)
finalOpacity   = lerp(currentOpacity, opacityAct3, smoothProgress3)
```

**第 10 段（750–765）：遮挡淡化**

仅当有聚焦行星（`_focusedPlanetIdx >= 0`）时：
```
camToPlanet = normalize(fp.position - camera.position)   // 视线方向
toParticle  = p.position - camera.position               // 粒子方向
projDist    = dot(toParticle, camToPlanet)               // 粒子在视线上的投影距离
fpDist      = distance(fp.position, camera.position)     // 聚焦行星的相机距离

if 0.5 < projDist < fpDist - 0.3:                       // 粒子在相机与行星之间
  projPoint = camera + camToPlanet * projDist             // 视线上的投影点
  perpDist  = distance(p.position, projPoint)             // 粒子偏离视线距离
  occRadius = currentScale * 0.6 + 0.06                  // 粒子遮挡半径
  if perpDist < occRadius:
    finalOpacity *= 0.12                                  // 几乎完全透明
```

**第 11 段（767–770）：颜色过渡**

```
colorAct2 = grayHex
currentColor = colorAct1(#f0f8ff) → lerp → colorAct2(gray) [wof]
             → lerp → colorAct3(#64748b) [smoothProgress3]
```

#### 3.8.12 `act1.exit()` — 第 915–922 行

保存当前 Act 1 状态到 `ctx`（波浪数组 + 光束角度），重置点光源。注意 `dispose()` 是空函数——Act 1 的对象从不销毁，只在退出时部分调整。

---

### 3.9 Act 2 — GridTransition（第 926–1052 行，127 行）

#### 3.9.1 `buildGridJunctionNodes()` — 第 939–961 行

14×15=210 个点节点，均匀分布在 x∈[-26,26], z∈[-48,4] 的平面上。初始 opacity=0，在 Act 2 动画中随 `gridFactor` 淡入。`renderOrder=2`（与垂直网格线相同），确保在粒子（order=1）之上渲染。

#### 3.9.2 `buildVerticalGridLines()` — 第 963–988 行

28 条线，x 从 -28 到 +28 等距分布。初始状态下两个端点位置相同（都在 zStart = -52），动画中一个端点向 zEnd = 12 延伸。每条线有 `staggerOffset ∈ [0, 0.45)` 的随机交错延迟——越靠后的线越晚延伸，产生波浪式升起的效果。

**顶点颜色：** 使用 `vertexColors: true`，远端为 `#94a3b8`（冷灰），近端为 `#f1f5f9`（亮白）——产生深度感。

#### 3.9.3 `animateVerticalGrid()` — 第 994–1046 行

**入口守卫：** `_lastGridSp`（仅检查 sp，因为网格动画不依赖 time）

**核心计算：**

```
vertFactor     = clamp((sp - 0.58) / (0.70 - 0.58), 0, 1)  // 网格延伸因子
act3Progress   = clamp((sp - 0.85) / 0.15, 0, 1)
gridOpacityMult = 1 - smoothstep(act3Progress)              // Act 3 展开时淡出
shiftY         = -32 * smoothstep(act3Progress)             // 同步下移

if gridOpacityMult < 0.001 → 批量隐藏 → return ← 性能优化

对每条线：
  lp = clamp((vertFactor - staggerOffset) / 0.55, 0, 1)    // 交错延伸进度
  curZ = lerp(zStart, zEnd, lp)                             // 当前延伸位置
  pArr[1] = baseY + shiftY  (近端Y)
  pArr[4] = baseY + shiftY  (远端Y)
  pArr[5] = curZ            (远端Z)
  opacity = min(0.75, lp * 0.75) * gridOpacityMult         // 最大 0.75

网格节点：position.y = shiftY, opacity = gridFactor * 0.55 * gridOpacityMult
```

---

### 3.10 Act 3 — ContentPhase（第 1054–1356 行，303 行）

#### 3.10.1 模块级变量（第 1057–1078 行）

```
act3Initialized        — 构建守卫（与 builtActs 不同，独立标记）
_mouseNDC              — 鼠标屏幕坐标（-1..1）
_hoveredIdx            — 当前悬停粒子索引
_focusedPlanetIdx      — 当前聚焦粒子索引（-1 = 无）
_orbitLines[3]         — 轨道环
_gyroGroups[3]         — 陀螺仪装饰环
_planetLabels[3]       — 行星标签 Sprite
_starGroup, _starGlow  — 中央恒星
_planetLinks[3]        — 链接配置 [{label, accent, url}]
_labelOpacityCurrent   — 标签透明度缓动状态
_raycaster             — (创建但未使用)
_lastTimeSec           — 时间追踪（与 animateDust 共享）
```

**注意 `_raycaster`：** 第 1071 行创建了 `THREE.Raycaster`，并配置了参数，但在整个代码中从未使用。因为项目改用屏幕空间 NDC 投影进行点击检测。这是**已废弃但未清理的代码**。

#### 3.10.2 `createPlanetLabel()` — 第 1080–1139 行

Canvas → Texture → Sprite 的完整管线：

```
Canvas 512×128:
  1. 测量文字宽度 → 计算胶囊背景大小
  2. 绘制圆角矩形（arcTo 路径），填充 rgba(15,23,42,0.78)
  3. 描边 rgba(255,255,255,0.12)，线宽 1.5px
  4. 白色文字 (Georgia 38px), fillText 居中

CanvasTexture → SpriteMaterial (depthTest:false, depthWrite:false)
Sprite → scale(1.8, 0.45, 1), renderOrder=9999
```

**为什么 `depthTest: false`？** 标签应始终可见，不受场景深度影响。`depthWrite: false` 确保标签不影响其它对象的深度缓冲。`renderOrder=9999` 确保在所有场景对象之后渲染。

#### 3.10.3 `act3.build()` — 第 1141–1259 行

构建顺序不影响功能，因为所有对象相互独立：

**轨道环（3 条）：**
```
每条128个顶点 → THREE.Line → position(0, -1.0, SCENE_CENTER_Z) → renderOrder=2
初始 opacity=0（通过 animate 淡入）
```

**陀螺仪装饰环（3 个）：**
```
RingGeometry(r-0.04, r, 96) → LineLoop
倾角: [72°+0.25rad, 72°-0.30rad, 72°+0.55rad] (绕X), [0.35, -0.40, 0.15]rad (绕Z)
→ Group position(0, -1.0, SCENE_CENTER_Z)
→ userData.rotSpeed = [0.08, 0.13, 0.18]
```

倾角的设计意图：三个环以不同角度倾斜，绕 Y 轴以不同速度旋转，产生类似"天球仪"的视觉效果。

**中央恒星（`_starGroup`）：**
```
_position: (0, -1.0, SCENE_CENTER_Z), renderOrder=1_
├── core:    Sphere(0.42, 32×32) — MeshBasicMaterial #fff8e7 (暖白)
├── glow:    Sphere(0.70, 32×32) — MeshBasicMaterial #ffe8c0 (暖金)
│            opacity 0.30, depthWrite=false
└── halo:    Canvas Sprite — 径向渐变 0.6→0.01→0 opacity
             128×128 canvas → Sprite(5.5, 5.5, 1) — AdditiveBlending
```

三层结构的目的：核心提供亮白实体，光晕球提供近场散射感，精灵光环提供远场柔光——不需要 ShaderMaterial 就能实现多层次恒星效果。

**行星标签（3 个）：**
```
createPlanetLabel() × 3 → position(0, -1.0, SCENE_CENTER_Z) → scene.add
初始 opacity=0
```

#### 3.10.4 `act3.animate()` — 第 1261–1301 行

```
smoothProgress = smoothstep(clamp((sp - 0.85) / 0.15, 0, 1))

轨道环:   opacity = smoothProgress * 0.35
陀螺仪:   rotation.y = time * rotSpeed * 0.96
          子环 opacity = smoothProgress * 0.28

恒星:     pulse = 1 + sin(time*1.8)*0.06 + sin(time*3.3)*0.04
          光晕球 opacity = smoothProgress * 0.30 * pulse
          光晕球 scale *= pulse
          精灵光环 opacity = smoothProgress * 0.55 * pulse

行星标签: 
  targetOpacity = (聚焦?) 0 : smoothProgress * 0.82
  _labelOpacityCurrent += (target - current) * 0.12  ← 指数平滑
  排序对齐 → 跟随行星位置(含 +0.45 Y偏移) → opacity = _labelOpacityCurrent
```

**`_labelOpacityCurrent` 的指数平滑**（`+= (target - current) * 0.12`）避免了聚焦/取消聚焦时标签 opacity 的突变——提供了约 0.3 秒的平滑过渡。

**为什么排序 `_mainPlanetsPreFiltered`？** 预筛选数组可能因外部因素（如粒子重排）改变顺序，而标签索引必须与行星一一对应。通过 `sort` 与 `_mainPlanetIndices` 对齐来确保。这是一个防御性措施——如果数据流干净，理论上不需要每次 animate 都排序。

#### 3.10.5 `act3.exit()` — 第 1303–1319 行

退出时：隐藏所有 Act 3 元素（6 组对象）+ 重置聚焦状态 + emit `focusChange(false)`。这与 Act 1 和 Act 2 的 exit 一致——隐藏而非销毁。

#### 3.10.6 `act3.dispose()` — 第 1321–1356 行

彻底销毁 Act 3 的所有几何体和材质（逐对象 dispose / traverse dispose），重置所有数组和引用为初始状态。与 Act 1/2 的 `dispose()`（空函数）不同——Act 3 的 dispose 被实现是因为它是在后期添加的，开发者意识到了 WebGL 资源泄漏问题。

---

### 3.11 Act Manager（第 1358–1377 行）

```
acts = [act1, act2, act3]
builtActs = Set()            — 已构建过（调用过 build()）的 Act 名称

_activeActsCache = []        — 预分配的缓存数组，每帧复用

resolveActiveActs(sp):
  清空 _activeActsCache (保留数组引用)
  对每个 act:
    if sp ∈ [act.start - 0.01, act.end + 0.01]:
      if act.name 未构建 → act.build() → 加入 builtActs
      push 到 _activeActsCache
  返回 _activeActsCache
```

**0.01 的模糊区间：** start 前 0.01 就开始构建，确保动画准备好时用户正好进入区间。end 后多保留 0.01，防止在边界处快速抖动导致闪烁。

---

### 3.12 动画循环 `animate()`（第 1379–1405 行）

**实际 animate 函数（在 onMounted 中被包装，见 3.16 节）：**

```
每帧执行顺序（有设计意图的顺序）:

1. updateTextOffsetCSS(sp)         — CSS 变量（对 DOM 的影响最先）
2. sceneApplyWhiteOut(sp)           — 全局氛围（背景/雾），影响所有后续对象
3. 灯塔可见性                       — 基于白化状态
4. animateWavesAndLighting(t, sp)   — 波浪线（在网格线之前，因为波浪在 Act 2 被网格覆盖）
5. animateVerticalGrid(sp)          — 网格线（在波浪之上渲染）
6. animateDust(t, sp)               — 粒子系统（在所有几何体之上，含悬停检测）
7. animateBeam(t, sp)              — 光束（独立动画，不影响其他对象）
8. updateCameraFocus(sp, t)        — 相机位置（必须在 render 之前）
9. resolveActiveActs(sp)           — Act 切换检测
10. 各 act.animate()               — Act 专有动画（轨道/标签等）
11. renderer.render(scene, camera) — 最终渲染
```

**为什么第 9 步的 Act 构建在所有动画之后？** 因为 `resolveActiveActs` 可能触发 `build()`（首次进入某 Act 时），构建会创建新对象并加入场景——这些对象会在下一帧的动画更新中被处理。如果构建在动画之前，新建的对象在该帧中不会被任何动画函数更新，可能出现一帧的"未初始化"状态。

---

### 3.13 `onResize()`（第 1407–1412 行）

```
renderer.setSize(w, h) + camera.aspect 更新 + updateProjectionMatrix
```

标准 Three.js 窗口缩放处理。没有防抖——每次 resize 事件都立即更新。

---

### 3.14 `onMouseMoveGlobal()`（第 1414–1417 行）

```
_mouseNDC.x = (e.clientX / w) * 2 - 1
_mouseNDC.y = -(e.clientY / h) * 2 + 1
```

将屏幕像素坐标映射到 NDC（-1..1）。注意 Y 轴取反（Three.js NDC 约定 Y 轴朝上，浏览器 Y 轴朝下）。该值在 `animateDust()` 的悬停检测中被读取——但不是每帧读取，而是异步更新。

---

### 3.15 `onClickCanvas()`（第 1419–1460 行）

**交互逻辑（完整状态机）：**

```
if sp < 0.85 → return (Act 3 之前不处理)

if 已有聚焦 → 重置 _focusStartTime（延续聚焦计时器）

计算点击 NDC（基于 canvas.getBoundingClientRect()）
屏幕空间距离检测（与 hover 完全相同的算法）
阈值: 0.16

if 命中某主行星:
  if 已聚焦该行星 → 打开链接 (window.open)
  else → 聚焦该行星 (emit focusChange(true))
else:
  取消聚焦 (emit focusChange(false))
```

**为什么用 `getBoundingClientRect()` 而非 `clientX/clientY` 直接计算？** 因为 canvas 可能因 CSS transform/ margins 等而偏移，`getBoundingClientRect()` 提供了相对于视口的实际位置。

---

### 3.16 `updateTextOffsetCSS()`（第 1462–1471 行）

```
key = round(sp * 1000)
if key === _lastCssSpKey → return ← 节流: 仅当 round(sp*1000) 变化时更新
_lastCssSpKey = key

progress = clamp((sp - 0.85) / 0.15, 0, 1)
smoothProgress = smoothstep(progress)
translateUp = -90 * smoothProgress px
document.documentElement.style.setProperty('--text-offset-y', translateUp)
```

**节流精度：** `round(sp * 1000)` → 每 0.001 的 sp 变化触发一次更新。在 15vh 的滚动范围内（约 15×1080=16200px），0.001 sp ≈ 16px 滚动距离。足够精细且不会过度调用。

**-90px 的含义：** 在 Act 3 场景下移 32 个 Three.js 单位的同时，品牌文字上移 90 CSS 像素——保持文字在视口中心附近。

---

### 3.17 `captureLighthouse()`（第 1473–1519 行）

详见总体分析 2.4 节。代码内部细节：
- 独立相机 FOV=25（比场景相机 40 更窄 → 更平的视角，适合半身截图）
- `capCam.position.z = 9`，lookAt(0,0,0)，灯塔中心在 `y = -0.965`（本地坐标）——因此相机从正面平视灯塔
- 三点光源模拟工作室灯光：主光（右前上）、补光（左前上）、环境光
- 使用 `alpha: true` + 透明背景 → PNG 透明通道，方便叠加到品牌文字

---

### 3.18 `onMounted()`（第 1523–1560 行）

**初始化顺序：**
1. 创建 `THREE.Scene` + `PerspectiveCamera`(FOV=40, near=0.1, far=150)
2. 创建 `WebGLRenderer`（`alpha: false`——不需要透明，因为有 scene.background）
3. 立即构建 Act 1（`act1.build()` → `builtActs.add('OceanVoyage')`）
4. **猴子补丁 animate 函数**（见下文）
5. 启动 `requestAnimationFrame(animate)`
6. 注册 window resize / mousemove / canvas click 事件

**猴子补丁 animate（第 1537–1554 行）：** 在原始 `animate()` 外层包裹 Act 切换检测逻辑：

```
origAnimate = animate
animate = function(time):
  获取当前活跃 act 名称列表 activeNames
  对每个 act:
    if 之前活跃 && 现在不活跃 → act.exit()
  prevActiveNames = activeNames.slice()
  origAnimate(time)
```

**为什么用猴子补丁而非修改 `animate()` 函数本身？** 因为 Act 切换检测需要 `prevActiveNames` 在帧间保持——如果在 `animate()` 内部声明，需要使用模块级变量。猴子补丁将检测逻辑放在了 `animate()` 之前，在函数定义时注入——这是模块级状态管理模式的一种变通方案。但它增加了理解难度，重构时可以考虑更清晰的方式。

---

### 3.19 `onUnmounted()`（第 1562–1576 行）

按创建顺序反向清理：
1. `cancelAnimationFrame`
2. 移除事件监听
3. `renderer.dispose()`
4. 遍历场景销毁所有几何体和材质

注意：这里不调用各 Act 的 `dispose()` 方法——仅在 `scene.traverse` 中统一销毁。Act 3 的 `dispose()` 方法可能是为将来单独销毁 Act 3 而预留的。

---

## 四、跨文件耦合图谱

```
main.js
  └─→ App.vue
        ├─→ LighthouseScene.vue (props: scrollProgress)
        │     └─→ emit: focus-change → App.vue.onFocusChange
        │     └─→ emit: overlay-data  → App.vue.onOverlayData
        │     └─→ CSS var --text-offset-y → 品牌文字 transform
        │     └─→ defineExpose: captureLighthouse → App.vue.ensureCapture
        ├─→ AppFooter.vue (静态引入)
        └─→ main.css

vite.config.js → main.js → App.vue → LighthouseScene.vue

stats_server.py (独立，仅通过 Vite 代理关联)
```

**关键耦合点：**
1. `App.vue` ↔ `LighthouseScene.vue` 双向耦合：props 向下、events 向上、ref 方法调用、CSS 变量隐含通道
2. `TEXT_START = 0.70` 在 `LighthouseScene.vue` 中定义，但 `brandTextVisible >= 0.70` 在 `App.vue` 中硬编码——同一语义分散两处
3. `GRID_SHIFT_START = 0.85` 在两处使用：Scene 的动画计算 + App 的 CSS 变量更新

---

## 五、发现的问题与重构切入点

下表按严重程度排列：

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| **A** | **单文件 1580 行** | LighthouseScene.vue | Act 1（727 行）+ Act 2（127 行）+ Act 3（303 行）+ Act Manager（90 行）+ 全局工具（130 行）混在一个文件。每次修改任一部分都需要导航巨大文件 |
| **B** | **`animateDust()` 139 行** | L283–L396 | 一个函数承担：悬停检测、位置计算、缩放、不透明度、遮挡、颜色——6 个职责。任何修改都可能影响其他 |
| **C** | **`StateContext` 未被使用** | L115–L125 | `ctx.set()` 在 act1/act2.exit() 中写入，但全代码无 `ctx.get()`。可安全移除 |
| **D** | **`_raycaster` 未被使用** | L1071, L1254–1256 | 创建并配置了 Raycaster，但点击检测改用 NDC 投影。应移除 |
| **E** | **`_clickNDC` 未被使用** | L55 | 预分配了但从未引用 |
| **F** | **硬编码阈值重复** | App.vue + Scene | `TEXT_START=0.70`、`GRID_SHIFT_START=0.85` 在两处独立定义。应抽取共享常量 |
| **G** | **构建顺序隐式依赖** | act1.build() | buildLightBeam/buildDust/buildLights 依赖 lighthouseGroup 先存在。如果将来调整构建顺序，会静默失败 |
| **H** | **猴子补丁 animate** | onMounted L1540–1554 | Act 切换检测通过运行时替换 animate 函数实现——增加理解成本。重构时应直接整合进 animate |
| **I** | **`.light-overlay` 未使用** | main.css L28–36 | CSS 类未被任何组件引用，旧方案残留 |
| **J** | **帧缓存守卫不一致** | L93–96 | `animateWavesAndLighting` 同时检查 time 和 sp，`animateVerticalGrid` 只检查 sp。对于不依赖 time 的函数，多余的 time 检查产生不必要的缓存未命中 |

---

## 六、建议的重构方案

### 阶段一：安全清理（无行为变更）

1. 移除 `StateContext`（C）
2. 移除 `_raycaster`（D）
3. 移除 `_clickNDC`（E）
4. 移除 `.light-overlay`（I）
5. 抽取 `shared/constants.js`，集中定义所有阈值，App.vue 和 Scene 统一引用（F）

### 阶段二：结构拆分

6. 将 LighthouseScene.vue 拆分为：
   ```
   src/three/
   ├── LighthouseScene.vue        ← 骨架：场景管理、动画循环、Act 调度
   ├── acts/
   │   ├── Act1OceanVoyage.js     ← buildOcean/buildLighthouse/buildLightBeam/buildDust/buildLights + 动画函数
   │   ├── Act2GridTransition.js  ← buildVerticalGrid + animateVerticalGrid + buildGridJunctionNodes
   │   └── Act3ContentPhase.js    ← build（轨道/陀螺仪/恒星/标签）+ animate + exit + dispose
   ├── shaders/
   │   └── VolumetricBeamShader.js
   ├── utils/
   │   ├── smoothstep.js
   │   ├── shortestDelta.js
   │   └── constants.js
   └── objects/
       └── PlanetLabel.js         ← createPlanetLabel 工厂
   ```

7. 将 `animateDust()` 拆分为：
   - `updateDustHoverDetection()` — 悬停检测
   - `updateDustPositions()` — 位置 + 轨道
   - `updateDustAppearance()` — 缩放 + 不透明度 + 颜色
   - `updateDustOcclusion()` — 遮挡淡化

### 阶段三：架构改进

8. 消除猴子补丁：将 Act 切换检测直接整合进 `animate()` 函数
9. 统一帧缓存守卫模式：所有动画函数使用 `(lastTime, lastSp)` 双参数守卫
10. 将物理滚动系统提取为 `usePhysicsScroll` composable（可选）

---

## 相关文档

| 文档 | 用途 |
|------|------|
| [`../README.md`](../README.md) | 当前 R3F + React 架构 |
| [`HANDOFF.md`](./HANDOFF.md) | 迁移完成后的项目状态 |
| [`TECH_STACK_EVALUATION.md`](./TECH_STACK_EVALUATION.md) | 技术选型决策（R3F 为何胜出） |
| [`../src/actors/README.md`](../src/actors/README.md) | 拆分后的 Actor 组件一览 |
