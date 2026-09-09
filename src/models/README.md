# models/ — 3D 模型资产与组件

## 当前入口

[MODEL_REGISTRY](index.ts) 是 Debug Studio 模型选择器的数据源，记录组件、GLB 路径、默认环境和来源信息。Studio 优先通过 `glbPath` 加载 GLB，各视口克隆节点、骨骼和材质，共享缓存中的几何体与贴图；组件可供其他入口复用。相机由实际包围盒自动取景，三角面数从渲染器读取。

| 注册键 | 组件 | 资源 |
|--------|------|------|
| `lighthouse-capture` | [Lighthouse.tsx](../actors/Lighthouse.tsx) | 程序化生成，无独立 GLB |
| `central-star` | [CentralStarPreview](CelestialPreviews.tsx) | 共用恒星几何体、材质与光晕，独立预览 |
| `planet` | [PlanetPreview](CelestialPreviews.tsx) | 单颗行星核心、大气层与光晕，独立预览 |
| `ringed-planet` | [RingedPlanetPreview](CelestialPreviews.tsx) | 带环行星实验：共用行星主体，添加倾斜薄圆环面 |
| `voyager1` | [Voyager1.tsx](Voyager1.tsx) | [voyager-1.glb](../../public/models/voyager-1.glb) |
| `voyager1-low-poly` | [Voyager1LowPoly.tsx](Voyager1LowPoly.tsx) | [voyager-1-low-poly.glb](../../public/models/voyager-1-low-poly.glb) |

静态资源 URL 分别为 `/models/voyager-1.glb` 和 `/models/voyager-1-low-poly.glb`；文件名大小写必须与磁盘一致。

## 程序化资产

恒星和行星的视觉构造在 [centralStar.ts](../actors/assets/centralStar.ts)、[planet.ts](../actors/assets/planet.ts)，由主页 Actor 与 Studio 共用。[celestialPreview.ts](celestialPreview.ts) 提供独立预览场景，完整显示光晕，不读取或写入主页的滚动、聚焦与实时数据。

主页三颗行星使用同一视觉模型，因此工作台只展示一颗固定尺寸的行星，不加入轨道、公转、标签或风铃编排。该样本不是主页随机初始化结果的快照。对象页签的“预览动画”控制恒星或行星的光晕呼吸，默认暂停，支持速度调整与停止归零。

### 带环行星实验

在顶部模型选择器中选择“带环行星 · 程序化资产”。[ringedPlanet.ts](../actors/assets/ringedPlanet.ts) 组合现有行星工厂和四层带间隙的 `TorusGeometry` Mesh；未接入主页三颗导航行星。内侧两层采用暖金色，向外逐渐变浅、变透明。这是风格化的分层环原型，尚未模拟真实行星环的颗粒和投影阴影。

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

注册表中的三角面数是展示元数据，资源重新生成后需要核对更新；本说明不重复维护文件大小或未经重新测量的模型统计。

## 低模烘焙

[bake-low-poly.sh](../../scripts/bake-low-poly.sh) 依次执行顶点焊接、减面、纹理缩放和 meshopt 压缩，通过 `npx` 调用 `@gltf-transform/cli`。运行可能需要下载工具；输出路径会被写入，先确认输入与输出文件。

在仓库根目录运行，例如输出一个新文件：

```bash
bash scripts/bake-low-poly.sh public/models/voyager-1.glb public/models/voyager-1-preview-low.glb 0.5 512
```

省略后两个参数时，脚本当前默认减面比例为 `0.3`、纹理尺寸为 `512`；以脚本为准。生成新资产后，核对组件资源路径、加载结果和来源信息。

相关资料：[Debug Studio](../debug/README.md)、[共享约定](../../AGENTS.md)。
