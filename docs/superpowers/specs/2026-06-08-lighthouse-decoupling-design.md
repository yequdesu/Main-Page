# LighthouseScene 解耦设计

## 目标

将 2171 行的 `LighthouseScene.vue` 解耦为分层模块化结构，同时**绝对保持动画效果不变**——尤其是双向滚动的确定性。

## 当前问题

- 所有逻辑集中在一个 SFC 中：Three.js 对象创建、动画更新、canvas overlay 绘制、事件处理
- 三个 Act 虽然定义了 `build`/`exit` 接口，但 `animate()` 主循环直接硬编码调用了 `animateWavesAndLighting`、`animateVerticalGrid`、`animateDust`、`animateBeam`，完全绕过 Act Manager 的 `resolveActiveActs` 调度
- 存在跨幕的共享元素（`dustParticles` 从 Act 1 漂浮到 Act 3 轨道），不能被单一 Act 模块拥有
- `act1.exit()` 中存入 `StateContext` 的值（`beamFinalAngleY`、`waveBaseColors` 等）从未被后续 Act 读取，是无用代码

## 核心设计决策

### 共享层 + Act 模块分离

不按 Act 拆分所有代码，而是将跨幕共享的元素和动画提取到独立的 `layers/` 层级：

```
src/
├── three/
│   ├── shared/
│   │   ├── sceneSetup.js         # Scene, Camera, Renderer 创建
│   │   ├── stateContext.js       # 共享命名空间（ctx 单例）
│   │   ├── reusableObjects.js    # 全部预分配的 Vector3/Color 对象
│   │   └── animationPipeline.js  # 主 animate() — 显式顺序调用
│   ├── layers/
│   │   ├── oceanWaves.js         # oceanLines 创建 + animateWavesAndLighting
│   │   ├── lightBeam.js          # lighthouse + beamPivot 创建 + animateBeam
│   │   ├── dustSystem.js         # dustParticles 创建 + animateDust
│   │   ├── gridLines.js          # gridVerticalLines + _gridPoints + animateVerticalGrid
│   │   ├── whiteOutManager.js    # sceneApplyWhiteOut (fog/background/ambient)
│   │   └── overlayCanvas.js      # updateCameraFocus 中的 canvas 绘制逻辑
│   ├── acts/
│   │   ├── act1OceanVoyage.js
│   │   ├── act2GridTransition.js
│   │   └── act3ContentPhase.js
│   └── constants.js              # 阈值、ORBIT_RADII、颜色常量
├── components/
│   └── LighthouseScene.vue       # 编排层 — ~300 行
```

### 分层逻辑

| 元素 | 归属 | 理由 |
|------|------|------|
| `dustParticles` | layers/dustSystem.js | 贯穿 Act1→2→3，创建者不固定 |
| `oceanLines` | layers/oceanWaves.js | 创建于 Act1，但过渡到 Act2 展平、Act3 沉降 |
| `beamPivot` + lighthouse | layers/lightBeam.js | 创建于 Act1，Act2 白化阶段淡出 |
| `gridVerticalLines` | layers/gridLines.js | 创建于 Act2，但沉降位移依赖 Act3 进度 |
| Scene fog/background | layers/whiteOutManager.js | 跨三幕持续运作 |
| Overlay canvas 绘制 | layers/overlayCanvas.js | 依赖 camera + dustParticles + _starPos，跨 Act |
| `_starGroup` + `_orbitLines` + `_gyroGroups` + labels | acts/act3ContentPhase.js | 仅 Act3 需要 |
| Lighthouse 静态模型 | acts/act1OceanVoyage.js | 仅 Act1 需要 |

## 模块接口

### 共享层模块签名

```js
// 每个 layer 文件 export：
export function build(ctx)       // 创建 Three.js 对象，挂到 ctx 上
export function animate(time, sp, ctx, ...)  // 每帧调用，纯函数
export function dispose(ctx)     // 销毁 Three.js 资源
```

### Act 模块签名

```js
export function build(ctx)       // 创建 Act 独有的 Three.js 对象
export function exit(ctx)        // 离开范围时隐藏 + 清理
export function animate(time, tSp, sp, ctx)  // Act 独有动画
export function dispose(ctx)     // 销毁所有 geometry/material
```

### StateContext (ctx)

`ctx` 是单例共享命名空间，存储：

- **基础设施引用**：`scene`、`camera`、`renderer`
- **模块间共享的对象引用**：`dustParticles[]`、`oceanLines[]`、`gridVerticalLines[]`、`beamPivot`、`lighthouseGroup`
- **帧缓存**：`_hoveredIdx`、`_focusedPlanetIdx`、`_mouseNDC`、`_lastWavesTime` 等
- **事件回调**：`emit`（Vue emit 函数的引用）

每个模块向 `ctx` 写入自己管理的对象，其他模块可以读取引用但不写入。

## 动画管线 (animationPipeline.js)

主循环保持显式顺序调用，不引入抽象调度层：

```js
export function animate(time, sp, ctx) {
  const t = time * 0.001

  // 共享进度变量（在 pipeline 中计算一次，注入到各层）
  const gridFactor = clamp((sp - GRID_START) / (VERTICAL_START - GRID_START), 0, 1)
  const smoothProgress3 = smoothstep(clamp((sp - GRID_SHIFT_START) / (1 - GRID_SHIFT_START), 0, 1))

  sceneApplyWhiteOut(sp, ctx)                              // whiteOutManager
  animateWavesAndLighting(t, sp, gridFactor, smoothProgress3, ctx)  // oceanWaves
  animateVerticalGrid(sp, gridFactor, smoothProgress3, ctx)         // gridLines
  animateDust(t, sp, ctx)                                  // dustSystem
  animateBeam(t, sp, ctx)                                  // lightBeam

  // Act Manager 负责 build/exit 生命周期
  const activeActs = resolveActiveActs(sp, ctx)
  for (const act of activeActs) {
    const tSp = clamp((sp - act.start) / (act.end - act.start), 0, 1)
    if (act.animate) act.animate(t, tSp, sp, ctx)
  }

  updateOverlayCanvas(sp, t, ctx)                         // overlayCanvas
  ctx.renderer.render(ctx.scene, ctx.camera)
}
```

**保持显式顺序的理由：**
- 当前执行顺序有隐式依赖（如 `sceneApplyWhiteOut` 必须先于一切、camera focus 必须晚于 dust 更新）
- 共享层函数固定为 5-6 个，不会动态增减，不需要注册制
- 显式顺序本身就是一份文档——任何人读代码都能看到数据流向

## 确定性保障（双向滚动兼容）

**核心原则：所有动画状态都是 `scrollProgress` 的纯函数。**

不引入"状态快照"传递（如 Act1 结束时的 beamAngle 传给 Act2 作为起点）。每一帧，每个动画函数从 `sp` 独立算出自己的状态。`sp = 0.40` 时的计算结果永远是同一个值，无论用户是从 0.35 滑过来还是从 0.85 退回来。

**具体约束：**
1. 共享层函数只读取 `(time, sp, ctx)` 参数，不读取任何 Act 模块写入的中间状态
2. 如果两个模块需要共享中间计算结果（如 `gridFactor`、`smoothProgress3`），在 `animationPipeline.js` 中计算一次，注入给双方，而不是让模块互读
3. `ctx` 只存对象引用和帧缓存（如 `_lastWavesTime`），不存"上一幕的结束值"
4. 移除 `act1.exit()` 中无用的 `ctx.set('beamFinalAngleY', ...)` 等代码

## LighthouseScene.vue 残余职责

编排层只做：

1. 从 `props.scrollProgress` 读取进度
2. `onMounted` 中创建 Scene/Camera/Renderer，调用各共享层的 `build(ctx)`
3. `onUnmounted` 中调用所有 `dispose(ctx)`
4. 传递 `emit('focusChange')` 和 `emit('overlayData')` 到 Vue 父组件
5. 处理窗口 resize、鼠标移动、点击事件的绑定/解绑
6. 模板中的三个 canvas 元素（WebGL、invert、overlay）

## 迁移策略

分阶段执行，每个阶段完成后验证效果：

1. **提取常量** → `constants.js`，验证编译通过
2. **提取预分配对象** → `reusableObjects.js`，验证编译通过
3. **提取共享层**（逐个迁移，每迁移一个验收一次动画效果）：
   - `whiteOutManager.js`（最简单，无对象创建）
   - `dustSystem.js`（最复杂，但独立性强）
   - `oceanWaves.js`（需验证与 gridLines 的过渡）
   - `gridLines.js`
   - `lightBeam.js`
   - `overlayCanvas.js`
4. **提取 Act 模块**：
   - `act3ContentPhase.js`（最大，但独立）
   - `act1OceanVoyage.js`（只剩 buildLights 和 lighthouse 静态模型）
   - `act2GridTransition.js`（基本为空，grid 逻辑已移到共享层）
5. **重构 animationPipeline** — 替换原 `animate()` 为顺序调用
6. **清理 LighthouseScene.vue** — 移除已迁移代码，保留编排层
