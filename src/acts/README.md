# acts/ — 场景编排层

## 职责

按滚动进度组装场景对象，控制 Act 组可见性，并协调需要场景上下文的行为。几何体和材质由 Actor 管理；可复用计算放在 Behavior 中。

## 当前组成

| 文件 | 子组件与行为 |
|------|--------------|
| [Act1OceanVoyage.tsx](Act1OceanVoyage.tsx) | `OceanWaves`、`LightBeam`、`LighthouseCapture` |
| [Act2GridTransition.tsx](Act2GridTransition.tsx) | `GridLines`；保留基于进度的 `useFrame` 协调回调 |
| [Act3ContentPhase.tsx](Act3ContentPhase.tsx) | `OrbitRings`；独占 `createCameraFocusController()` 实例，在 `useFrame` 中更新相机 |
| [Act4SystemStructure.tsx](Act4SystemStructure.tsx) | 日面边缘、三种行星独立实例；固定排列并保留卫星公转 |
| [SystemStructureOverlay.tsx](SystemStructureOverlay.tsx) | 结构图标题、行星说明和返回按钮；样式在 [SystemStructure.css](SystemStructure.css) |

可见性条件由 [App.tsx](../App.tsx) 的 `needsAct1/2/3` 决定。当前 Act 1 的组保留到进度 0.86 之前，使海浪能在网格阶段继续使用；Act 2 从 0.39、Act 3 从 0.84 开始启用组可见性。边界含 0.01 的提前/延后余量，各对象还会根据自身进度计算透明度等属性。这与主页中概括的三个视觉阶段不是同一组边界。

四个 Act 在 App 中始终挂载，通过 `visible` 控制组可见性。`visible` 不等于卸载，也不能替代逐帧回调自己的条件检查。Act 3 的相机控制器在组隐藏后继续接收更新，消费聚焦和结构图过渡进度；事件处理与超时由 `Planets` 持有的聚焦时间轴负责。

Act 4 使用 `structureProgress`，在原三幕之后启用；Act 3 在结构过渡完成后隐藏。Act 4 的每个对象位于独立图层，唯一相机控制器按进度移动到结构视图；布局与渲染原因见[结构图说明](../../docs/system-structure.md)。

## 跨幕对象与 DOM

[Canvas.tsx](../r3f/Canvas.tsx) 直接挂载 `SceneLights`、`Planets`、`DustField`、`Lighthouse`、`WindChimeLines` 和 `CentralStar`，这些对象不在任何 Act 的可见性组内。

- 主行星由 `Planets` 管理，碎片由 `DustField` 管理。
- `Lighthouse` 根据滚动进度自行隐藏，`LighthouseCapture` 负责离屏截图。
- `BrandTitle`、终端和 `FloatingLabels`位于 App 的 DOM 层；信息面板和标签根据 Act 3 条件挂载。

## 扩展与验证

1. 参考现有 Act 组件，复用 Actor 和 Behavior；需要逐帧协调时可使用 `useFrame`。
2. 共享阈值放在 [SCROLL_RIG / PAGE_FLOW](../types/index.ts)，在 App 中接入新的可见性条件和组件。
3. 跨幕对象应放在 Canvas 根层级，避免被某一 Act 的组可见性隐藏。
4. 验证前进、回滚及边界过渡；涉及行为变化时运行 [组件测试](../behaviors/__tests__/r3f-components.test.tsx)，并检查浏览器表现。
5. 同步更新本文件和[项目总览](../../README.md)的相关说明。

依赖包括 `actors/`、`behaviors/`、`stores/` 和 `r3f/ScrollRig`。Canvas 通过 `children` 接收 Act，保持容器与具体幕编排的分工。

相关资料：[Actor 说明](../actors/README.md)、[R3F 基础设施](../r3f/README.md)、[共享约定](../../AGENTS.md)。
