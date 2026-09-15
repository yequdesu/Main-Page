# acts/ — 场景编排层

## 职责

按滚动进度组装场景对象，控制 Act 组可见性，并协调需要场景上下文的行为。几何体和材质由 Actor 管理；可复用计算放在 Behavior 中。

## 当前组成

| 文件 | 子组件与行为 |
|------|--------------|
| [Act1OceanVoyage.tsx](Act1OceanVoyage.tsx) | `OceanWaves`、`LightBeam`、`LighthouseCapture` |
| [Act2GridTransition.tsx](Act2GridTransition.tsx) | `GridLines`；保留基于进度的 `useFrame` 协调回调 |
| [Act3ContentPhase.tsx](Act3ContentPhase.tsx) | `OrbitRings`；独占 `createCameraFocusController()` 实例，在 `useFrame` 中更新相机 |
| [Act4StellarTransition.tsx](Act4StellarTransition.tsx) | 注册恒星 GSAP Timeline；以 -30 帧优先级通过运镜协调器定位拉近、构图、显隐及行星入场阶段 |
| [Act5SystemStructure.tsx](Act5SystemStructure.tsx) | 随机日珥与日冕抛射、三种行星独立实例；错峰入场后固定排列并保留卫星公转，Menu 悬停缩放与点击导航；日面由根层共享恒星呈现 |
| [SystemStructureOverlay.tsx](SystemStructureOverlay.tsx) | 结构图标题、行星说明和返回按钮；样式在 [SystemStructure.css](SystemStructure.css) |

前三幕可见性条件由 [App.tsx](../App.tsx) 的 `needsAct1/2/3` 决定。当前 Act 1 的组保留到进度 0.86 之前，使海浪能在网格阶段继续使用；Act 2 从 0.39、Act 3 从 0.84 开始启用组可见性。边界含 0.01 的提前/延后余量，各对象还会根据自身进度计算透明度等属性；这些是组可见性余量，不是宏观阶段边界。

五个 Act 组件在 App 中始终挂载；四个视觉组通过 `visible` 控制，Act 4 播放层没有自己的模型组，始终定位 Timeline。`visible` 不等于卸载，也不能替代逐帧回调自己的条件检查。Act 3 的相机控制器在组隐藏后继续接收更新，消费聚焦和结构图过渡进度；两条 Timeline 通过 Canvas 的运镜协调器管理。`Planets` 注册聚焦动作与超时，Act 4 注册恒星转场，各自卸载时释放注册。

Act 4 使用 `structureProgress` 在原三幕之后进行恒星拉近、左移构图和行星入场；进度为 1 后进入 Act 5。日面活动从拉近阶段开始演化，结合恒星屏幕半径渐显，并在转场 25%–45% 提升线束清晰度；同一组轮廓环带活动贯穿 Act 4 / Act 5，反向构图不倒放物理时钟。背景微光仍在最终构图时渐显。Act 3 在转场完成后隐藏，其轨道对象提前淡出。Act 5 的对象位于 layer 1，共享恒星同时属于 layer 0/1；唯一相机控制器消费同一转场姿态；布局与渲染原因见[结构图说明](../../docs/system-structure.md)。

## 跨幕对象与 DOM

Act 5 的显示名称为 Menu。继续向下按钮、主终端 `menu` 命令及聚焦 Voyager 后的第二次核心点击，统一发出导航请求，由 App 的已有页面补间进入 Menu。实现组件和时间轴键保留 SystemStructure 命名，以描述其构图。Menu 完成后通过 [menuPlanetInteraction.ts](../behaviors/menuPlanetInteraction.ts) 启用实体命中，悬停将整颗资产平滑放大到 120%，点击复用 `PLANET_LINKS`；转场中关闭交互并恢复尺寸。

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
