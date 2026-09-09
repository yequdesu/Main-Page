# actors/ — 场景对象与叠加层

## 职责

3D Actor 封装对象创建、材质和逐帧更新。本目录也包含品牌文字、行星标签及 SVG 辅助层等 DOM 组件，它们由 App 侧挂载。

## 当前组件地图

以下挂载位置描述主应用；Debug Studio 可通过模型注册表单独加载灯塔；`standalone` 模式不订阅主页滚动可见性，也不写入主页截图对象引用。灯塔烘焙的临时克隆共享源几何体，因此仅释放烘焙函数自己创建的材质与渲染器。

恒星和行星通过 [共用恒星工厂](assets/centralStar.ts)、[共用行星工厂](assets/planet.ts) 创建视觉资产，[光晕纹理工厂](assets/haloTexture.ts) 绘制径向渐变。主页 Actor 保留滚动、轨道、聚焦与实时数据逻辑；Studio 的 [独立预览](../models/CelestialPreviews.tsx) 只复用视觉资产。每个实例拥有并释放自己的几何体、材质和贴图；行星贴图在同一系统内共享，Three.js 内部共享的 Sprite 几何体不由实例释放。

所有行星核心共用受光的粗糙标准材质，以同色自发光托住暗面；主页方向光与 Studio 行星预览灯光采用恒星远场柔光的中心色。色源位于 [celestialLighting.ts](assets/celestialLighting.ts)，设计与边界见 [行星表面光照](../models/README.md#行星表面光照)。

[带环行星工厂](assets/ringedPlanet.ts) 在共用行星主体上组合倾斜、压扁的 `TorusGeometry`，用于主页最外侧轨道（索引 2 / GitHub）与 Studio 预览；参数、渲染与资源所有权见 [模型说明](../models/README.md#带环行星实验)。

[带卫星行星工厂](assets/satellitePlanet.ts) 添加单颗球形卫星，用于主页中间轨道（索引 1 / Code），按调用方的绝对动画时间计算水平 XZ 平面的圆轨道位置；Studio 的取景覆盖完整公转包络，播放与暂停沿用共享预览时钟。参数与扩展方式见 [模型说明](../models/README.md#带卫星行星实验)。

| 文件 | 主应用挂载位置 | 职责 |
|------|----------------|------|
| [SceneLights.tsx](SceneLights.tsx) | Canvas 根层级 | 全局灯光；环境光引用供 `ScrollInvalidator` 更新 |
| [Lighthouse.tsx](Lighthouse.tsx) | Canvas 根层级 | 程序化灯塔，根据进度自行隐藏，提供截图所需对象引用 |
| [Planets.tsx](Planets.tsx) | Canvas 根层级 | 三颗主行星、光晕/大气层、轨道与交互数据 |
| [DustField.tsx](DustField.tsx) | Canvas 根层级 | InstancedMesh2 碎片的位置、颜色和透明度 |
| [CentralStar.tsx](CentralStar.tsx) | Canvas 根层级 | 恒星核心、内层光晕、近场和远场 Sprite，以及风铃过渡 |
| [WindChimeLines.tsx](WindChimeLines.tsx) | Canvas 根层级 | 跟随主行星和恒星过渡的悬线 |
| [OceanWaves.tsx](OceanWaves.tsx) | Act 1 | 海浪、展平过渡与光束照明 |
| [LightBeam.tsx](LightBeam.tsx) | Act 1 | 灯塔光束，发布光束世界变换供海浪读取 |
| [LighthouseCapture.tsx](LighthouseCapture.tsx) | Act 1 | 离屏渲染灯塔截图，导出 `getLighthouseCapture()` |
| [LighthouseCaptureTypes.ts](LighthouseCaptureTypes.ts) | 截图模块 | 截图类型、默认参数和离屏渲染函数 |
| [GridLines.tsx](GridLines.tsx) | Act 2 | 网格线与节点的延伸、位移和透明度 |
| [OrbitRings.tsx](OrbitRings.tsx) | Act 3 | 轨道参考线与陀螺仪环编排 |
| [OrbitalRing.tsx](OrbitalRing.tsx) | `OrbitRings` 内 | 外层进动轨道线：有序圆周顶点、首尾闭合、进动和显隐 |
| [BrandTitle.tsx](BrandTitle.tsx) | App DOM 层 | 品牌标题与灯塔截图图标 |
| [FloatingLabels.tsx](FloatingLabels.tsx) | App DOM 层，Act 3 条件挂载 | 行星标签终端、PBD 布局、入场顺序与交互 |
| [PlanetLabelGuideLines.tsx](PlanetLabelGuideLines.tsx) | `FloatingLabels` 内 | 标签与行星之间的 SVG 连线 |
| [PlanetLabelDebug.tsx](PlanetLabelDebug.tsx) | `FloatingLabels` 内 | PBD 约束可视化，由主终端 `debug` 命令控制 |

场景组装以 [Canvas.tsx](../r3f/Canvas.tsx) 和 [App.tsx](../App.tsx) 为准。常驻 Canvas 不代表对象始终可见，需继续核对 Actor 内部的进度与透明度逻辑。

## 主页轨道与资产对应

[Planets.tsx](Planets.tsx) 的 `PLANET_FACTORIES` 按 `ORBIT_RADII` 由内到外选择普通、带卫星、带环工厂。随机粒子按粒子索引遍历，但资产必须写入 `assets[trackIdx]`，以保持更新、导航链接和聚焦目标一致。

整个资产根节点随主页滚动显隐；核心位置和缩放更新后，统一调用资产的 `updateAppearance()`，使卫星和四层环同步跟随风铃下落、轨道运动、距离缩放与遮挡淡出。卫星使用主页 R3F 时钟，Studio 继续使用独立的可暂停预览时钟。行星可见时由 `Planets` 请求下一帧，保证停止滚动后卫星仍公转；不可见时不为行星继续请求帧，保留 Canvas 的 `frameloop="demand"`。依据：[R3F 按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance#on-demand-rendering)。

工厂返回的 `visualRadiusScale` 是相对核心半径的可见实体包络：普通行星取近场光晕边缘，带环行星取最外环外缘，带卫星行星取卫星完整公转范围。主页据此计算标签避让半径，避免标签遮住附件，同时避免半径随卫星相位摆动。相机聚焦后方距离和侧向距离使用 [Planets.tsx](Planets.tsx) 中的 `_planetFocusDistanceScales`：普通行星为 1.00 倍，带卫星和带环行星统一为 1.25 倍，以兼顾近景观察和附件边距。点击和导航仍以主行星中心为目标，卫星不是独立导航入口。

## 渲染和共享数据

- 具体 Mesh、Line、Sprite 的渲染顺序与深度设置在各组件中维护；不能根据父 Group 的 `renderOrder` 推定所有子对象的数值。这里不再复制整套易失真的逐对象参数表。
- 热路径复用临时对象，并按实际依赖使用帧缓存。Three.js 资源的创建与释放需要明确所有权。
- `DustField` 的实例颜色初始化依赖 `materialsNeedsUpdate()` 更新步骤。
- `OceanWaves` 从 `LightBeam` 导出的变量读取光束世界变换；`WindChimeLines` 从 `Planets` 读取行星位置。这些共享引用用于场景更新，修改时检查消费者和更新时序。
- 行星世界位置、屏幕坐标与终端数据需要保持对应关系；不要把主行星逻辑重新放回 `DustField`。

新增 Actor 时，先确定它应由某个 Act、Canvas 根层级还是 App DOM 层管理。可复用计算抽取到 `behaviors/`，并按改动范围验证场景和交互。

## 相关资料

- [Act 编排](../acts/README.md)、[Behavior 说明](../behaviors/README.md)、[共享约定](../../AGENTS.md)。
- [轨道系统](../../docs/orbital-system.md)。
- [PBD 交互说明](../../docs/actors/pbd-layout-explainer.html)、[形式化公式](../../docs/actors/pbd-layout-formal.md)、[操作手册](../../docs/actors/pbd-layout-operation-guide.md)、[维护指南](../../docs/actors/pbd-layout-maintenance-guide.md)。
- [渲染效果设计](../../docs/actors/design.md)、[维护指南](../../docs/actors/maintenance-guide.md)。
- [调试记录](../../docs/dev-blog/)，用于了解历史问题与修复背景。
