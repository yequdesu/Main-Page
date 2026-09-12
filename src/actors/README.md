# actors/ — 场景对象与叠加层

## 职责

3D Actor 封装对象创建、材质和逐帧更新。本目录也包含品牌文字、行星标签及 SVG 辅助层等 DOM 组件，它们由 App 侧挂载。

## Composition runtime 接入

沿用 [composition](../composition/README.md) 的 Actor 注册、图层策略、坐标锚点、事件序列及副作用管理。视觉工厂负责模型与资源，主页 Actor 负责将其接入运行时；灯塔、海浪、光束、网格和碎片保留现有 runtime 接入。

- `Planets` 发布 `anchor.planet.*.world`、`orbitWorld`、`particleIndex`、`screenRadius` 和球体真实世界半径 `coreRadius`。点击、聚焦、轨道局部渐隐及标签读取这些锚点，不再导入 `Planets` 的可变模块变量；终端轨道数据仍写入 `realtimeStore`。
- `CentralStar` 发布恒星世界锚点；海浪消费光束锚点，风铃使用确定性的布局函数。风铃阶段固定布局及初始公转相位来自 `useWindChime` / `Planets`，内容阶段由聚焦轨道控制器推进。
- 行星主体、光晕、恒星光晕和导航线沿用 `layerRegistry`。新增附件的材质及深度细节仍由资产工厂管理。
- `act3.entry` / `labelReveal` 控制信息终端和标签入场；进入 Act 4 时重置，返回 Act 3 后重播。聚焦保留独占的 GSAP 时间轴与 `FocusAnimationProvider`，不重建旧相机控制器或聚焦 SVG。
- 新增 Actor 时声明身份、层级、共享数据及清理责任，再添加可视实现；可通过主页 `debug` 命令查看运行状态。Voyager 的网格命中列表仍由专用 [voyagerState](voyagerState.ts) 管理，Act 4 恒星活动使用独立事件通道，尚未全部声明为单独的 composition Actor。

## 当前组件地图

日面背景微光与 CME 逸散颗粒共用 [stellarParticleAppearance.ts](assets/stellarParticleAppearance.ts) 的屏幕直径范围。背景点精灵按 DPR 换算，CME 广告牌按 CSS 视口换算，保持相近的可见大小；CME 仅有轻微的沿运动方向拉伸。相机缩放改变颗粒间距，基础粒径保持稳定。逸散颗粒与磁拱环共用色源及发光密度函数，主体仅降低颜色强度；可见颗粒与薄雾从共享运动样本分别抽取，底部按出生高度平滑减少可见颗粒，未选实例不提交绘制；释放后大部分颗粒在约 0.7 秒内平滑退场，零透明度实例不提交绘制，稀释预算为原背景面积预算的两倍，每批保留 4–16 个分散尾迹，存活 300 秒并逐渐向页面扩散；完整运动样本仍供薄雾使用。

[Act4SystemStructure](../acts/Act4SystemStructure.tsx) 复用三种行星工厂创建独立实例，并使用 [assets/centralStar.ts](assets/centralStar.ts) 的完整恒星资产呈现日面边缘。`SceneLights` 在 Canvas 根层级提供 layer 1 的主光与补光；原行星、碎片和恒星保持原位置。日面特写由 [assets/stellarCloseup.ts](assets/stellarCloseup.ts) 提供边缘渐暗、轮廓外柔光和 15% 频率呼吸。[assets/stellarRadiation.ts](assets/stellarRadiation.ts) 提供日面后方的稀疏逸散微光。[assets/stellarActivity.ts](assets/stellarActivity.ts) 另行提供六类空间构型的磁拱环、沿场团块、亮金色抛射前缘及连续重联的上下支，运动由 [stellarPlasma.ts](../behaviors/stellarPlasma.ts) 的降阶物理模型驱动；事件分布与时间轴由 [stellarActivity.ts](../behaviors/stellarActivity.ts) 管理。普通日珥按环系独立演化；条件重组复用路径纹理的四个分支，旧主环、左右短环和中央过渡环各有一个共享几何体的弧丝 Mesh；每个普通通道拥有一张同坐标的重绘纹理，沿弧长计算的局部可见度同时作用于弧丝与团块，团块总数不增加。`setRedrawDiagnostic()` 仅改变普通日珥的内外层次着色。该资产的 `layoutLocal(width, height, worldHeight)` 供[磁拱环图鉴](../docs/stellar/README.md)使用，切换为局部切平面并按正交视口换算像素尺寸，仍复用模型和材质；调用常规 `layout()` 会恢复日面布局。CME 上升支通过 [cmeEjectionVisual.ts](assets/cmeEjectionVisual.ts) 转为金色颗粒与稀薄三维雾片；[cmeTailVisual.ts](assets/cmeTailVisual.ts) 接续长寿命尾迹，独立于单次事件淡出并支持跨喷发累积。`setEjectionAppearance()` 供 [CME 对照实验](../docs/cme/README.md)控制可见表现；几何体与材质仍归 `stellarActivity` 统一释放。资源所有权与图层见[结构图说明](../../docs/system-structure.md)。

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
| [VoyagerOrbiter.tsx](VoyagerOrbiter.tsx) | 最外层 `OrbitalRing` 的进动组 | 低模探测器的椭圆巡航、天线对星姿态、显隐与独立资源管理 |
| [OrbitalRing.tsx](OrbitalRing.tsx) | `OrbitRings` 内 | 外层进动轨道线：有序圆周顶点、首尾闭合、进动和显隐 |
| [OrbitLineMaterial.tsx](OrbitLineMaterial.tsx) | 静态及外层轨道线 | 聚焦时整体弱化、球体附近的局部渐隐，保留内置线材质的深度与雾 |
| [BrandTitle.tsx](BrandTitle.tsx) | App DOM 层 | 品牌标题与灯塔截图图标 |
| [FloatingLabels.tsx](FloatingLabels.tsx) | App DOM 层，Act 3 条件挂载 | 行星标签终端、PBD 布局、入场顺序与交互 |
| [PlanetLabelGuideLines.tsx](PlanetLabelGuideLines.tsx) | `FloatingLabels` 内 | 标签与行星之间的 SVG 连线 |
| [PlanetLabelDebug.tsx](PlanetLabelDebug.tsx) | `FloatingLabels` 内 | PBD 约束可视化，由主终端 `debug` 命令控制 |

场景组装以 [Canvas.tsx](../r3f/Canvas.tsx) 和 [App.tsx](../App.tsx) 为准。常驻 Canvas 不代表对象始终可见，需继续核对 Actor 内部的进度与透明度逻辑。

普通日珥在 Act 4 通过 [stellarPlacement.ts](../behaviors/stellarPlacement.ts) 共用事件级方位与尺寸；路径生成后才应用随机摆放，并以两个切向分量贴合球面。随机化不改变局部构型或重组时序，局部图鉴继续使用单位尺度。范围、分布与适用边界见[活动区摆放](../../docs/system-structure.md#活动区朝向尺寸与球面贴合)。

## 主页轨道与资产对应

[Planets.tsx](Planets.tsx) 的 `PLANET_FACTORIES` 按 `ORBIT_RADII` 由内到外选择普通、带卫星、带环工厂。随机粒子按粒子索引遍历，但资产必须写入 `assets[trackIdx]`，以保持更新、导航链接和聚焦目标一致。

整个资产根节点随主页滚动显隐；核心位置和缩放更新后，统一调用资产的 `updateAppearance()`，使卫星和四层环同步跟随风铃下落、轨道运动、距离缩放与遮挡淡出。卫星使用主页 R3F 时钟，Studio 继续使用独立的可暂停预览时钟。行星可见时由 `Planets` 请求下一帧，保证停止滚动后卫星仍公转；不可见时不为行星继续请求帧，保留 Canvas 的 `frameloop="demand"`。依据：[R3F 按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance#on-demand-rendering)。

带环行星在 Act 3 与 Act 4 中共用 `updateSpin(time, orbitAngularSpeed, periodRatio, precessRings)`：自转周期 `Tspin = periodRatio × Torbit`，角速度 `ωspin = ωorbit / periodRatio`。正常公转角速度统一由 [PLANET_ORBIT_SPEEDS](../types/index.ts) 提供，当前外轨为 −0.07 rad/s，对应约 89.76 秒公转一周；Act 3 保持默认 1.4 倍周期（125.66 秒自转一周），Act 4 使用独立的 0.7 倍周期（62.83 秒自转一周）。使用基础速度，不受悬停、聚焦调相或退出回位加速影响；Act 4 固定排列时沿用同一公转速度基准与场景时钟。

基础自转轴为行星环平面的法线，核心与四层环围绕自身中心同向转动。Act 4 额外传入 `precessRings=true`，让四层环再绕资产局部 Y 轴共同进动，周期约 62.83 秒；倾角保持 26.7°，但朝向改变，使椭圆轮廓、遮挡和受光持续变化。进动不作用于核心，也不改变环的中心、尺寸或层间间隙。Act 3 默认关闭进动，保持原行为。角度按绝对时间解析计算，避免逐帧累积误差；`Quaternion` / `Vector3` 在工厂构建时分配。Act 3、Act 4 沿用原有 `useFrame` 和 `invalidate()`；Studio 未调用该接口，原预览行为保持不变。当前材质近似均匀、几何体轴对称，因此单纯轴向自转的视觉变化较含蓄；Act 4 通过环面进动提供可辨认的旋转效果。周期倍率位于 [ringedPlanet.ts](assets/ringedPlanet.ts) 的 `RINGED_PLANET_SPIN_PERIOD_RATIO`；Act 4 的覆盖值位于 [Act4SystemStructure.tsx](../acts/Act4SystemStructure.tsx) 的 `RINGED_SPIN_PERIOD_RATIO`。

工厂返回的 `visualRadiusScale` 是相对核心半径的可见实体包络：普通行星取近场光晕边缘，带环行星取最外环外缘，带卫星行星取卫星完整公转范围。主页据此计算标签避让半径，避免标签遮住附件，同时避免半径随卫星相位摆动。相机聚焦后方距离和侧向距离使用 [types/index.ts](../types/index.ts) 中的 `PLANET_FOCUS_DISTANCE_SCALES`：普通行星为 1.00 倍，带卫星和带环行星统一为 1.25 倍，以兼顾近景观察和附件边距。点击和导航仍以主行星中心为目标，卫星不是独立导航入口。

## 聚焦构图

`Planets` 持有 [GSAP 聚焦时间轴](../behaviors/useFocusTimeline.ts) 与 [轨道调相控制器](../behaviors/useFocusOrbit.ts)，按轨道顺序传入三个主体的数据、真实资产半径和完整附件包络。控制器仅推进 `orbitAngle`；原轨道半径、XZ 平面和模型/附件更新流程继续生效。进入聚焦后，另外两颗行星沿原轨道移动到恒星两侧；到位后近同步缓慢公转。退出时配合镜头拉远，三颗行星沿原公转方向加速追上持续运行的参考相位，再恢复各自原速度；回位计划由同一控制器持有，中途重新聚焦会取消计划并保留参考轨道。实时面板的 `ω` 显示控制器的实际角速度。相机的起始高度、慢速抬升、视野适配和选相位原理见 [聚焦会话说明](../behaviors/README.md#聚焦会话)。

## 聚焦时的轨道显示

六条导航轨道线共用 [OrbitLineMaterial.tsx](OrbitLineMaterial.tsx) 的显示规则。全景保留原有滚动显隐；聚焦时，当前行星的公转轨道保留原透明度的 45%，另外两条保留 18%，外层装饰轨道保留 12%。进入、切换目标与退出均消费同一聚焦时间轴的 2.4 秒 `power2.out` 渐变，从当前透明度衔接。材质不再维护独立显隐计时器；30 秒超时由时间轴发出退出事件。

局部渐隐以三个行星核心的实时世界坐标与球体半径为依据，来自 `Planets` 发布的 `world` / `coreRadius` 锚点。对轨道片元位置 `p`，取各球体渐隐系数的最小值：`min_i smoothstep(1.08 r_i, 1.65 r_i, distance(p, c_i))`，再按聚焦渐变量混入透明度。这样在球体表面之外留出很窄的断口，并在外侧连续恢复线条；世界空间计算支持外层环的倾斜、拉伸与进动。使用球体真实半径而非附件包络，避免卫星和实体行星环周围出现巨大缺口。仅导航线应用此效果，实体行星环材质不受影响。

轨道保留 `transparent=true`、`depthWrite=false`、`depthTest=true` 和具体线对象的 `renderOrder=2`；球体以 `renderOrder=1` 写入深度，遮挡后方轨道。局部渐隐只修改内置 `LineBasicMaterial` 的片元透明度，不替换雾、主题色和深度流程。实现通过 `onBeforeCompile` 添加世界坐标与 uniform，并提供固定 shader 缓存键；升级 Three.js 时需核对 `project_vertex` / `opaque_fragment` 注入点。依据：[Three.js Material 文档](https://threejs.org/docs/pages/Material.html)中的 `onBeforeCompile`、`customProgramCacheKey`、`depthTest` 和 `depthWrite`。材质由 R3F 释放，向量和 uniform 在挂载时分配，逐帧复用；动画沿用可见阶段 `Planets` 的 `invalidate()`。

## Voyager 外环巡航

最外层 `GYRO_RINGS` 配置挂载 [VoyagerOrbiter](VoyagerOrbiter.tsx)，模型和轨道共用同一个进动父组；模型位于非均匀拉伸组之外，避免航天器外形被拉伸。进入 Act 3 时按需加载模块和 GLB，局部 Suspense 与错误边界将加载等待或失败限制在探测器内。模型失败时刷新页面重试。

[轨迹采样](../behaviors/useVoyagerOrbit.ts) 给出与轨道线相同的椭圆位置和切线，巡航周期 90 秒，最长尺寸归一化至 0.4125 个场景单位（前一版 0.55 的 75%）；`speedScale` 同时缩放巡航和父轨道进动，设为 0 可冻结。退出内容阶段后卸载实例，再次进入从初始巡航相位开始。自身请求可见阶段渲染，保留 demand 模式；逐帧复用向量和矩阵。聚焦行星时沿用时间轴的外环显隐通道（12%），距镜头 4–8 单位时额外平滑淡出。

[资产克隆](assets/voyager.ts) 共享缓存几何体和贴图，独占节点与去重后的材质；只释放自己的材质，保留 Studio 加载缓存。具体 Mesh 设置 `renderOrder=1`、`transparent=true`、`depthTest=true`，完整显示时沿用源材质深度写入，淡出时关闭写入；源色同色微弱自发光托住暗面，仍接受场景灯光。来源与许可证见 [模型说明](../models/README.md#来源与许可证)。

旋转、取景和点击中心使用天线与主体基座组合的精确包围盒中心，当前源模型坐标约为 `(0.07769, 1.89051, 0.17659)`；[资产克隆](assets/voyager.ts) 的 `VOYAGER_CORE_NODES` 包含碟面、馈源、中央支架和基座，不含长悬杆。加载时重新核算中心；部件匹配使用 GLTFLoader 保留的 `userData.name` 原名，避免节点名清理时丢失句点导致漏匹配。整体尺寸归一化仍沿用全模型尺寸。资产 +Y（天线开口）朝向恒星；资产 +Z 的磁力仪悬杆对齐对星视角的左上方，以恒星方向和世界竖直方向约束滚转。

[共享状态](voyagerState.ts) 分别发布围绕核心中心的完整模型半径 `radius`、核心半径 `hitRadius` 和核心网格白名单 `hitTargets`。`radius` 从全部实际顶点计算，只用于完整取景；近景点击由射线检测核心网格，悬杆与旧大包围球内的空白区域不会拦截退出。非飞行器近景时保留核心周围至少 16px 的点击余量；主终端 `voyager` 提供另一入口。

镜头位于主体的外侧右上方，聚焦完成后始终注视恒星，主体落在恒星左下方，给中央画面留出空间。自身聚焦时 `voyagerFocus` 恢复完整显示，近镜头不会淡出；点击空白或 30 秒超时返回。若从行星近景切入，原调相行星仍在同一时间轴上顺行回位。更新顺序为时间轴/行星 `-20` → 风铃 `-10` → 轨道进动 `-0.75` → 飞行器 `-0.5` → 相机 `0`，避免镜头追随上一帧位置。

资源所有权依据：[R3F primitives 与释放](https://r3f.docs.pmnd.rs/api/objects#putting-already-existing-objects-into-the-scene-graph)、[Drei useGLTF](https://drei.docs.pmnd.rs/loaders/gltf-use-gltf)。

## 渲染和共享数据

- 具体 Mesh、Line、Sprite 的渲染顺序与深度设置在各组件中维护；不能根据父 Group 的 `renderOrder` 推定所有子对象的数值。这里不再复制整套易失真的逐对象参数表。
- 热路径复用临时对象，并按实际依赖使用帧缓存。Three.js 资源的创建与释放需要明确所有权。
- `DustField` 的实例颜色初始化依赖 `materialsNeedsUpdate()` 更新步骤。
- `OceanWaves` 从 composition 锚点读取光束世界变换；`WindChimeLines` 与 `Planets` 共用风铃布局函数。修改时检查消费者和更新时序。
- 行星世界位置、屏幕坐标与终端数据需要保持对应关系；不要把主行星逻辑重新放回 `DustField`。

新增 Actor 时，先确定它应由某个 Act、Canvas 根层级还是 App DOM 层管理。可复用计算抽取到 `behaviors/`，并按改动范围验证场景和交互。

## 相关资料

- [Act 编排](../acts/README.md)、[Behavior 说明](../behaviors/README.md)、[共享约定](../../AGENTS.md)。
- [轨道系统](../../docs/orbital-system.md)。
- [PBD 交互说明](../../docs/actors/pbd-layout-explainer.html)、[形式化公式](../../docs/actors/pbd-layout-formal.md)、[操作手册](../../docs/actors/pbd-layout-operation-guide.md)、[维护指南](../../docs/actors/pbd-layout-maintenance-guide.md)。
- [渲染效果设计](../../docs/actors/design.md)、[维护指南](../../docs/actors/maintenance-guide.md)。
- [调试记录](../../docs/dev-blog/)，用于了解历史问题与修复背景。
