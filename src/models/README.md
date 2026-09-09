# models/ — 3D 模型资产与组件

## 当前入口

[MODEL_REGISTRY](index.ts) 是 Debug Studio 模型选择器的数据源，记录组件、GLB 路径、默认环境和来源信息。Studio 优先通过 `glbPath` 加载 GLB，各视口克隆节点、骨骼和材质，共享缓存中的几何体与贴图；组件可供其他入口复用。相机由实际包围盒自动取景，三角面数从渲染器读取。

| 注册键 | 组件 | 资源 |
|--------|------|------|
| `lighthouse-capture` | [Lighthouse.tsx](../actors/Lighthouse.tsx) | 程序化生成，无独立 GLB |
| `central-star` | [CentralStarPreview](CelestialPreviews.tsx) | 共用恒星几何体、材质与光晕，独立预览 |
| `planet` | [PlanetPreview](CelestialPreviews.tsx) | 单颗行星核心、大气层与光晕，独立预览 |
| `voyager1` | [Voyager1.tsx](Voyager1.tsx) | [voyager-1.glb](../../public/models/voyager-1.glb) |
| `voyager1-low-poly` | [Voyager1LowPoly.tsx](Voyager1LowPoly.tsx) | [voyager-1-low-poly.glb](../../public/models/voyager-1-low-poly.glb) |

静态资源 URL 分别为 `/models/voyager-1.glb` 和 `/models/voyager-1-low-poly.glb`；文件名大小写必须与磁盘一致。

## 程序化资产

恒星和行星的视觉构造在 [centralStar.ts](../actors/assets/centralStar.ts)、[planet.ts](../actors/assets/planet.ts)，由主页 Actor 与 Studio 共用。[celestialPreview.ts](celestialPreview.ts) 提供独立预览场景，完整显示光晕，不读取或写入主页的滚动、聚焦与实时数据。

主页三颗行星使用同一视觉模型，因此工作台只展示一颗固定尺寸的行星，不加入轨道、公转、标签或风铃编排。该样本不是主页随机初始化结果的快照。对象页签的“预览动画”控制恒星或行星的光晕呼吸，默认暂停，支持速度调整与停止归零。

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

注册表中的三角面数是展示元数据，资源重新生成后需要核对更新；本说明不重复维护文件大小或未经重新测量的模型统计。

## 低模烘焙

[bake-low-poly.sh](../../scripts/bake-low-poly.sh) 依次执行顶点焊接、减面、纹理缩放和 meshopt 压缩，通过 `npx` 调用 `@gltf-transform/cli`。运行可能需要下载工具；输出路径会被写入，先确认输入与输出文件。

在仓库根目录运行，例如输出一个新文件：

```bash
bash scripts/bake-low-poly.sh public/models/voyager-1.glb public/models/voyager-1-preview-low.glb 0.5 512
```

省略后两个参数时，脚本当前默认减面比例为 `0.3`、纹理尺寸为 `512`；以脚本为准。生成新资产后，核对组件资源路径、加载结果和来源信息。

相关资料：[Debug Studio](../debug/README.md)、[共享约定](../../AGENTS.md)。
