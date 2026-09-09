# models/ — 3D 模型资产与组件

## 当前入口

[MODEL_REGISTRY](index.ts) 是 Debug Studio 模型选择器的数据源，记录组件、GLB 路径、默认环境和来源信息。Studio 优先通过 `glbPath` 加载 GLB，各视口克隆节点、骨骼和材质，共享缓存中的几何体与贴图；组件可供其他入口复用。相机由实际包围盒自动取景，三角面数从渲染器读取。

| 注册键 | 组件 | 资源 |
|--------|------|------|
| `lighthouse-capture` | [Lighthouse.tsx](../actors/Lighthouse.tsx) | 程序化生成，无独立 GLB |
| `central-star` | [CentralStarPreview](CelestialPreviews.tsx) | 共用恒星几何体、材质与光晕，独立预览 |
| `planet` | [PlanetPreview](CelestialPreviews.tsx) | 单颗行星核心、大气层与光晕，独立预览 |
| `ringed-planet` | [RingedPlanetPreview](CelestialPreviews.tsx) | 带环行星实验：共用行星主体，添加倾斜薄圆环面 |
| `satellite-planet` | [SatellitePlanetPreview](CelestialPreviews.tsx) | 一颗行星与一颗绕其公转的天然卫星 |
| `voyager1` | [Voyager1.tsx](Voyager1.tsx) | [voyager-1.glb](../../public/models/voyager-1.glb) |
| `voyager1-low-poly` | [Voyager1LowPoly.tsx](Voyager1LowPoly.tsx) | [voyager-1-low-poly.glb](../../public/models/voyager-1-low-poly.glb) |

静态资源 URL 分别为 `/models/voyager-1.glb` 和 `/models/voyager-1-low-poly.glb`；文件名大小写必须与磁盘一致。

## 程序化资产

恒星和行星的视觉构造在 [centralStar.ts](../actors/assets/centralStar.ts)、[planet.ts](../actors/assets/planet.ts)，由主页 Actor 与 Studio 共用。[celestialPreview.ts](celestialPreview.ts) 提供独立预览场景，完整显示光晕，不读取或写入主页的滚动、聚焦与实时数据。

主页三颗行星由内到外分别使用普通、带卫星和带环资产；三种 Studio 样本各展示一颗固定尺寸的行星，不加入主页轨道、公转、标签或风铃编排。该样本不是主页随机初始化结果的快照。对象页签的“预览动画”控制光晕呼吸，以及带卫星样本的卫星公转；默认暂停，支持速度调整与停止归零。

### 行星表面光照

普通、带环、带卫星行星，以及主页三颗导航行星，共用 [planet.ts](../actors/assets/planet.ts) 的 `MeshStandardMaterial` 核心。旧核心使用不响应灯光的 `MeshBasicMaterial`，而卫星使用标准材质，因此此前只有卫星呈现球面明暗。现在核心采用 `roughness=0.95`、`metalness=0`，以漫反射塑形；同色 `emissiveIntensity=0.35` 托住暗面，并在 `updateAppearance()` 中同步核心的跨幕颜色。内层白色光晕不透明度降至 `0.06`，避免覆盖核心的明暗层次。这是柔和的表面明暗渐变，不是体积散射，也没有新增投射阴影或行星环投影。

[celestialLighting.ts](../actors/assets/celestialLighting.ts) 定义共享 sRGB 色源：恒星远场柔光中心色 `#b4bed2`。恒星远场本身仍是多色渐变的加法混合 Sprite，并不发出真实场景灯光；此处选其中心色作为照明基调。主页 [SceneLights](../actors/SceneLights.tsx) 的主光、补光使用该色，保留原方向和强度，因此也会影响场景中的其他受光材质。原环境光与跨幕强度编排保持原样。

Studio 三种行星通过注册表的 `previewLighting` 使用同色主光、补光和环境光初值，参数集中在 `PLANET_PREVIEW_LIGHTING`；用户的会话调整优先，其他模型继续使用通用默认值。环境预设仍会调整环境光强度，方向光显式颜色不随预设改色。可在右侧灯光控件调节主光强度和位置观察明暗变化。主页与 Studio 的光照布局不同，因此整体亮度不保证完全相同。

材质依据：[Three.js MeshBasicMaterial](https://threejs.org/docs/pages/MeshBasicMaterial.html)、[MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)。核心保留 `renderOrder=1`、透明淡入淡出、深度测试与深度写入；光晕仍使用原有材质和按需渲染更新，未增加阴影贴图或额外每帧资源分配。

### 带环行星实验

在顶部模型选择器中选择“带环行星 · 程序化资产”。[ringedPlanet.ts](../actors/assets/ringedPlanet.ts) 组合现有行星工厂和四层带间隙的 `TorusGeometry` Mesh；同一工厂用于主页最外侧轨道的 GitHub 行星。内侧两层采用暖金色，向外逐渐变浅、变透明。这是风格化的分层环原型，尚未模拟真实行星环的颗粒和投影阴影。

参数位于该文件的 `PLANET_RING`、`PLANET_INNER_RING`、`PLANET_OUTER_RING` 和 `PLANET_OUTERMOST_RING`。以下半径和间隙均以行星核心半径 `r` 为单位，按由内向外排列；不透明度越低，透明程度越高。

| 对象节点 | 内半径 | 外半径 | 与前一层间隙 | 颜色 | 不透明度 |
|----------|--------|--------|--------------|------|----------|
| `内侧细环_0` | `1.42r` | `1.58r` | — | `#d6b987` | 50% |
| `行星环_0`（主环） | `1.64r` | `1.98r` | `0.06r` | `#d6b987` | 50% |
| `外层行星环_0` | `2.18r` | `2.54r` | `0.20r` | `#f4ead7` | 25% |
| `最外层淡环_0` | `2.70r` | `2.94r` | `0.16r` | `#fff9ed` | 12% |

内侧细环由原来的 `1.42r–1.98r` 环带切分而来，保留原环带的最内、最外边界，并在其中留出 `0.06r` 窄缝。主环的主半径为 `1.81r`、管半径为 `0.17r`；其他环的主半径由相邻环的边缘、间隙和各自管半径推导。细环、外环、最外淡环的管半径分别为 `0.08r`、`0.18r`、`0.12r`。

四层环共用局部 Z 压缩比例 `0.06`，总厚度为各自管半径的 `0.12` 倍。先将环面从 XY 平面转到 XZ 平面，再绕 Z 轴倾斜 `−26.7°`。周向 256 段、截面 24 段，参数修改在创建实例时生效。

独立预览保留固定的球体尺寸，仅为此样本收窄远场光晕，取景边界包含完整光晕和四层环面。各环可分别聚焦、隐藏或隔离，支持实体/线框对比与四视图；已有两层的对象路径保留，新增环追加到对象树。播放仍只驱动光晕呼吸，各层保持共面及固定倾角，随核心位置与尺寸更新，不覆盖 Explorer 的显示状态。

四层环面均使用 `transparent=true`、`depthTest=true`、`depthWrite=false`，具体 Mesh 设置 `renderOrder=2`，在核心与近场光晕之后绘制：前半环按各自不透明度混合，后半环被球体深度遮挡。整体淡入淡出系数乘以各层基础不透明度。每个视口拥有自己的环面几何体和材质，卸载时一并释放。构造依据：[Three.js TorusGeometry](https://threejs.org/docs/pages/TorusGeometry.html)、[BufferGeometry.scale](https://threejs.org/docs/pages/BufferGeometry.html#scale)、[材质透明度与深度](https://threejs.org/docs/pages/Material.html)、[对象绘制顺序](https://threejs.org/docs/pages/Object3D.html#renderOrder)；构造参数同时核对了仓库安装版本的实现。

### 带卫星行星实验

选择“带卫星行星 · 程序化资产”，在对象页签播放“卫星公转与光晕呼吸”。[satellitePlanet.ts](../actors/assets/satellitePlanet.ts) 复用普通行星主体，并添加一颗冷蓝灰色 `SphereGeometry` 卫星；同一工厂用于主页中间轨道的 Code 行星。卫星使用粗糙的 `MeshStandardMaterial`，由 Studio 灯光表现球体明暗。

参数集中在 `SATELLITE`：卫星半径为行星半径 `r` 的 `0.28` 倍，圆轨道半径为 `2.5r`，轨道倾角为 `0°`（水平 XZ 平面），初始相位为 `π/6`，1 倍速下每 `12` 秒公转一圈。令 `d=2.5r`、`θ=2πt/12+π/6`，则卫星相对于行星核心的位置为 `(d cosθ, 0, d sinθ)`。这是按固定圆轨道驱动的运动样本，不进行引力积分或真实天体参数拟合。

主页使用场景时钟驱动卫星公转；Studio 位置由共享预览时钟的绝对时间计算，多视口相位一致；暂停冻结位置，变速从当前位置继续，停止返回初始相位。播放时沿用 Studio 的 `invalidate()` 循环，暂停后按需渲染，不更新主页 store。取景边界预先覆盖完整轨道与卫星半径，避免公转过程中裁切或相机缩放跳动；原有行星与带环行星的取景方式保持兼容。

对象树中的 `卫星_0` 可以独立选择、隐藏和隔离，动画不会覆盖显示状态。卫星 Mesh 设置 `renderOrder=1`、`depthTest=true`，完整显示时写入深度，与行星核心形成前后遮挡；每个视口独占卫星几何体和材质，随资产卸载释放。预览时钟、资源所有权及按需渲染依据见 [Studio 维护指南](../debug/MAINTENANCE.md#恒星与行星独立预览2026-09-09)。

## 添加模型

1. 将 GLB 放入 `public/models/`，创建对应的加载组件；现有 `Voyager1.tsx` 可作参考。
2. 如使用 gltfjsx 生成组件，核对生成文件中的 import、资源 URL 和解码配置。
3. 在 `MODEL_REGISTRY` 注册组件及元数据；GLB 组件沿用 `lazy` 加载。
4. 在 `pnpm debug` 的顶部模型选择器中验证加载、材质、视口和模型自带动画。
5. 更新本文件中的资源入口与来源说明。

## 来源与许可证

以下为仓库登记的来源信息，替换模型或发布衍生资产时应保留署名：

| 模型 | 作者 | 来源 | 许可证 |
|------|------|------|--------|
| Voyager 1 | illidroid | [Sketchfab 原模型](https://sketchfab.com/3d-models/voyager-1-39bececb8b5d48a3ad0070e720586759) | CC BY 4.0 |
| Voyager 1 Low Poly | illidroid | 原模型经仓库低模脚本处理 | CC BY 4.0 |
| Lighthouse | YeQuDeSu | 程序化生成 | 项目自有 |
| Central Star / Planet | YeQuDeSu | 程序化生成，共用主页视觉资产 | 项目自有 |
| Ringed Planet | YeQuDeSu | 程序化生成，行星主体与圆环面组合 | 项目自有 |
| Satellite Planet | YeQuDeSu | 程序化生成，行星主体与单卫星圆轨道 | 项目自有 |

注册表中的三角面数是展示元数据，资源重新生成后需要核对更新；本说明不重复维护文件大小或未经重新测量的模型统计。

## 低模烘焙

[bake-low-poly.sh](../../scripts/bake-low-poly.sh) 依次执行顶点焊接、减面、纹理缩放和 meshopt 压缩，通过 `npx` 调用 `@gltf-transform/cli`。运行可能需要下载工具；输出路径会被写入，先确认输入与输出文件。

在仓库根目录运行，例如输出一个新文件：

```bash
bash scripts/bake-low-poly.sh public/models/voyager-1.glb public/models/voyager-1-preview-low.glb 0.5 512
```

省略后两个参数时，脚本当前默认减面比例为 `0.3`、纹理尺寸为 `512`；以脚本为准。生成新资产后，核对组件资源路径、加载结果和来源信息。

相关资料：[Debug Studio](../debug/README.md)、[共享约定](../../AGENTS.md)。
