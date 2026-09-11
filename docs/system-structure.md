# Act 4：恒星系统结构图

Act 3 展示公转轨道与可聚焦导航；Act 4 位于它下方，以左侧日面边缘、向右排列的普通行星（FS）、带卫星行星（Code）、四层带环行星（GitHub）展示系统组成。尺寸与间距为展示比例，不对应真实太阳系尺度。行星主体固定排列，带环行星持续轴向自转并呈现环面进动，卫星仍绕自身行星公转，保留实体行星环、浅明暗面和呼吸光晕。

## 进入与返回

- Act 1 点击快进依旧以 Act 3 为落点。
- 在 Act 3 继续向下滚动，或点击“继续向下 · 系统结构”，进入 Act 4。
- 向上滚动，或点击“返回轨道视图”，回到 Act 3；按钮使用原有 GSAP 页面滚动补间，滚轮可中断补间。
- 结构图不启用行星链接、飞行器点击或 `voyager` 聚焦命令。若通过原生滚动离开聚焦场景，`Planets` 发出 `exit / scene`，沿用原退出时间轴。

## 滚动坐标

共享边界在 [types/index.ts](../src/types/index.ts) 的 `PAGE_FLOW`，映射在 [usePageFlow.ts](../src/behaviors/usePageFlow.ts)，滚动物理和 ScrollTrigger 在 [App.tsx](../src/App.tsx)。

| 字段 | 范围 | 含义 |
|------|------|------|
| `pageProgress` | 0–1.30 | 整页位置，滚轮、原生滚动条及按钮的统一坐标 |
| `scrollProgress` | 0–1 | 原 Act 1–3 进度，保持所有既有阈值 |
| `structureProgress` | 0–1 | 从 Act 3 向 Act 4 的局部过渡进度 |

令整页位置为 `p`，则旧进度 `s = min(1, p)`，结构进度 `u = clamp((p − 1.02) / (1.22 − 1.02), 0, 1)`。`setPageProgress()` 一次更新三个字段。`p=1` 为原点击快进落点；1.02 开始过渡，1.22 完成，1.30 为页尾。

原三幕滚动距离保留为 24 倍视口高度；整页可滚动距离为 `24 × 1.30` 倍视口，body 高度为 `1 + 24 × 1.30 = 32.2` 倍视口。原生 ScrollTrigger 的 0–1 进度乘 1.30 后进入映射；同步浏览器滚动位置时做逆变换。窗口缩放会按新高度重建滚动范围，并保留当前页面坐标。

## 布局与单相机渲染

[Act4SystemStructure.tsx](../src/acts/Act4SystemStructure.tsx) 常驻同一 Canvas，使用独立的三种行星资产实例，不移动 Act 3 的对象。布局在 [structureLayout.ts](../src/behaviors/structureLayout.ts)，DOM 说明在 [SystemStructureOverlay.tsx](../src/acts/SystemStructureOverlay.tsx)。

最终相机位于 `(0, −24, 8)`，面向 `(0, −24, −16)`，垂直 FOV 为 40°。距离 `d=24`，可视高度 `H = 2d tan(FOV/2)`，宽度 `W = H × aspect`。行星中心的水平屏幕比例为 40%、58%、76%，世界横坐标为 `x = (fraction − 0.5)W`；模型和 DOM 共用这组比例。相邻中心间距为初版的 75%，以中间行星为基准对称收紧；半径为初版的 50%，仍受视口宽、高共同限制，为卫星公转与最外行星环保留间距。恒星核心半径为 `R = 0.9H`，球心放在左屏外。令边缘射线斜率 `k = −0.395W/d`，球心横坐标为 `x = kd − R√(1+k²)`，使透视投影下的核心右侧轮廓位于视口宽度的 10.5%。资产整体缩放为 `R / CENTRAL_STAR_CORE_RADIUS`。页面不再显示恒星名称、日面标签或底部脚注；非等比例的说明保留在本文。

相机仍由 [useCameraFocus.ts](../src/behaviors/useCameraFocus.ts) 的唯一控制器写入；`Act3ContentPhase` 即使隐藏也继续调用它。以 `q = 3u² − 2u³` 在原镜头与结构镜头的位置、注视点和 FOV 之间插值。这样滚动中途反向仍对应同一条路径。既有行星、飞行器的聚焦姿态逻辑继续保留。

结构图位于 Three.js layer 1，原场景位于 layer 0。每个结构图 Mesh / Sprite 都显式设置 layer 1；相机在过渡时启用两层，完整进入后只启用 layer 1，返回时恢复 layer 0。这避免 Act 3 的常驻恒星、碎片、探测器或光晕穿入结构图，同时保留其状态。所有全局灯光仍在 Canvas 根层级；结构图的补光和左上主光通过 layer 1 隔离，表面光源色沿用恒星远场柔光的 `STAR_FAR_LIGHT_COLOR`。过渡期间相机启用两层，两组灯光均参与渲染。

方案采用同一渲染器、同一相机和对象图层，无需新增 Canvas 或第二套聚焦控制器。依据：[Three.js Layers 官方说明](https://threejs.org/docs/pages/Layers.html)——对象与相机至少共享一个图层才会显示；`set()` 替换图层，`enable()` 追加图层。图层在此控制可见性，不暂停对象的动画计算。

## 资产与生命周期

恒星完整复用 [centralStar.ts](../src/actors/assets/centralStar.ts) 的 `createCentralStarAsset()`，与 Act 3、Studio 同源；保留球形核心、内层光晕、近远场柔光及 `updateGlow()` 呼吸动画。每个实例独占资源，Act 4 不复用 Act 3 的场景节点或滚动行为。Act 4 通过工厂的可选 `segments: 128` 提高特写球面细分，默认 Act 3 和 Studio 仍使用 32。仅该实例将内层光晕缩放乘 0.7、近场柔光乘 0.25、远场柔光乘 0.18，并将内层光晕最大半径限制为右侧轮廓位于视口宽度 28% 的球面半径，以避免整个呼吸周期中遮住首颗行星；特写的颜色、透明度与低频呼吸由下述适配器控制，默认工厂行为不变。原独立日面圆盘实现已移除。具体节点的深度和透明度配置沿用共用工厂。

### 日面特写材质与柔光

[stellarCloseup.ts](../src/actors/assets/stellarCloseup.ts) 仅配置 Act 4 的资产实例，不改变 Act 3 和 Studio。恒星仍只有一个核心球体；原先的双色内核来自光晕叠加，尤其是面向相机的 Sprite 平面穿过偏轴球体，在部分日面上形成了额外加色边界。

核心保留 `MeshBasicMaterial` 的自发光外观，增加连续的边缘渐暗：`μ = max(0, N·V)`，`C = mix(Crim, Ccore, μ^0.45)`，核心色为 `#ffe4b0`，轮廓色为 `#edab58`。这是表现球面体积的表面明暗近似，没有新增第二个核心或体积光散射通道。

内层光晕与两层 Sprite 统一按视线到核心球心的最短距离建立轮廓遮罩。相机空间中球心为 `c`、单位视线为 `r`、核心半径为 `R`，轮廓外距离 `e = |c × r| / R − 1`。核心内侧不叠加光效，边界以 `fwidth(e)` 做像素级平滑；轮廓外按 `exp(−max(e, 0)/w)` 衰减。内层、近场、远场的衰减宽度 `w` 分别为 0.045、0.075、0.20。Sprite 仍复用工厂节点，但特写改用距轮廓的程序化渐变，替代原来按球心衰减的贴图采样，避免裁切、压缩后日面边缘几乎没有柔光。

共享动画以 `t′ = 0.15t` 供时，因此呼吸频率为原来的 15%，周期变为约 6.67 倍；不会改变卫星或其他场景时钟。基准不透明度为内层 0.15、近场 0.20、远场 0.20，对应透明度 85%、80%、80%。亮度随原来的双频脉动因子变化；近场与远场透明度相同，内层比两层柔光更透明。保留 28% 视口的内层扩张上限。

适配器使用 Three.js 的 `onBeforeCompile` 和独立 `customProgramCacheKey` 扩展当前 WebGL 材质；相机空间 uniform 在各光效节点的 `onBeforeRender` 更新，适配滚动运镜与窗口变化。无新纹理、几何体或渲染循环；材质依旧由恒星工厂释放。依据：[Material.onBeforeCompile](https://threejs.org/docs/pages/Material.html#onBeforeCompile)、[customProgramCacheKey](https://threejs.org/docs/pages/Material.html#customProgramCacheKey)。

### 日面背景逸散微光

[stellarRadiation.ts](../src/actors/assets/stellarRadiation.ts) 提供艺术化的辐射感：72 个稀疏微光点沿日面边缘缓慢向外漂移，单次生命周期为 10–18 秒，淡入后逐渐消失。主色为暖白，少量冷白光点交错；这是示意图的视觉效果，不是霍金辐射物理模拟。

粒子起点由透视球体在各高度的切线求得，向外漂移不超过视口宽度的 7.7%，与第一颗行星保持距离。粒子放在核心平面后方 `1.6R`，根据深度补偿投影尺寸；核心正常写入深度，背景光点不会穿过日面。点云使用 `renderOrder=0`、`transparent=true`、`depthWrite=false`、`depthTest=true`，对象仍位于 Act 4 的 layer 1。

使用单个 `Points + ShaderMaterial` 绘制，72 组确定性种子只分配一次，动画在顶点 shader 中计算。沿用 Act 4 的时钟和 `invalidate()`；每帧只更新时间与像素密度 uniform，不新增计时器或 CPU 粒子对象。关闭该点云的 CPU 视锥裁剪，因为种子位置不是实际 shader 位置；Act 的组可见性仍有效。点云几何体和材质由 Act 4 统一释放。实现依据：[Three.js Points](https://threejs.org/docs/pages/Points.html)、[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)。

### 带环行星自转与环面进动

Act 4 使用共用带环资产的 `updateSpin()`，与 Act 3 沿用同一 R3F 场景时钟和 `PLANET_ORBIT_SPEEDS[2]`。Act 4 通过独立参数将自转周期设为正常公转周期的 0.7 倍，当前约 62.83 秒；Act 3 使用 1.4 倍周期（约 125.66 秒）；固定排列不表示停止自转。自转轴、速度基准与资源约束见[主页资产对应](../src/actors/README.md#主页轨道与资产对应)。

Act 4 调用 `updateSpin(..., true)` 开启环面进动，Act 3 与 Studio 默认关闭。核心保持原轴向自转；四层环在轴向旋转之后，共同绕资产局部 Y 轴旋转。环面法线与该轴的夹角保持 26.7°，方位持续改变，所以屏幕上能看到椭圆展开、收窄，以及前后遮挡和明暗变化。进动与 Act 4 自转共用约 62.83 秒的周期。

旋转组合为 `Qring = Qy(θ) Qaxis(θ)`，其中 `θ = time × ωorbit / 0.7`；核心仍使用 `Qcore = Qaxis(θ) Qtilt`。四层环使用相同四元数，保持层间间隙、半径和中心；不旋转资产根节点，不改变排布。每帧由绝对时间重新计算，避免累积误差；使用预分配四元数，沿用原渲染请求。

### 其他资产与渲染请求

- 复用 [planet.ts](../src/actors/assets/planet.ts)、[satellitePlanet.ts](../src/actors/assets/satellitePlanet.ts)、[ringedPlanet.ts](../src/actors/assets/ringedPlanet.ts)。新实例保持原颜色、卫星轨道及四层行星环透明度，局部倾斜便于阅读。
- 保留 `flat` 和 `frameloop="demand"`。`ScrollInvalidator` 同时响应旧场景与结构进度；结构图可见时 `useFrame` 更新卫星、光晕并 `invalidate()`，无新增定时器。
- Act 4 拥有自己的几何体、材质及三颗行星共用的光晕纹理，卸载时统一释放；显隐切换不释放、不重建。Act 3 的轨道与时间轴仍可继续推进，返回后衔接当前时间。

## 验证入口

- [页面映射与取景测试](../src/behaviors/__tests__/usePageFlow.test.ts)：原阈值、快进落点、原子状态、宽窄屏投影、往返镜头和图层。
- [结构图组件测试](../src/acts/__tests__/Act4SystemStructure.test.tsx)：图层、固定位置、卫星运动、显隐与资源释放。
- [点击测试](../src/r3f/__tests__/PlanetClickHandler.test.tsx)：结构图中禁用轨道场景点击与飞行器命令。
- 浏览器检查 Act 1 点击、Act 3 聚焦、向下进入、返回、滚轮中断、窗口尺寸改变，以及日夜主题。构建不能代替这些视觉检查。
