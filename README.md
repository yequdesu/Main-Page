# YeQuDesu · Personal Site

YeQuDesu 的滚动驱动 3D 单页个人网站，用海洋灯塔、网格过渡、行星导航和恒星系统结构图展示个人品牌，并连接个人服务与 GitHub。仓库同时包含开发用的 3D 模型调试工作台 Debug Studio。

主应用使用全视口 WebGL Canvas，品牌文字、终端、浮动标签和标签牵引线叠加在 DOM/SVG 层。

## 页面体验

页面包含四个视觉阶段。原三幕保留 `scrollProgress` 的 0–1 区间；Act 4 接在其后，由独立的 `structureProgress` 控制。整页坐标及高度由 [App.tsx](src/App.tsx) 和 [PAGE_FLOW](src/types/index.ts) 共同确定，详见[结构图说明](docs/system-structure.md#滚动坐标)。

| 阶段 | 主要进度区间 | 内容 |
|------|------------|------|
| OceanVoyage | 0–45% | 暗色海洋、灯塔、旋转光束与漂浮碎片 |
| GridTransition | 40–85% | 雾效过渡、海浪展平与网格延伸，随后显示品牌文字 |
| ContentPhase | 85–100% | 中央恒星、轨道环、三颗主行星及导航标签 |
| SystemStructure | Act 3 之后 | 左侧日面边缘，向右排列普通、带卫星与带环行星，展示系统组成 |

这些区间描述视觉阶段，不代表组件的挂载区间。海浪延续到网格阶段，跨幕对象常驻 Canvas 根层级，各对象按进度控制自身表现；日间主题会逐渐转为亮色背景，夜间主题保持暗色。共享阈值见 [SCROLL_RIG](src/types/index.ts)，背景和雾的计算见 [ScrollRig.ts](src/r3f/ScrollRig.ts)。

- **滚动与快进**：滚轮有惯性；点击页面可用 2 秒动画快进至 Act 3。继续向下滚动或点击结构图入口进入 Act 4，向上滚动或点击返回按钮回到轨道视图。
- **行星导航**：由内到外为普通行星（FS）、带卫星行星（Code）和四层带环行星（GitHub），卫星随主体运动并绕其公转。点击与退出事件通过 GSAP 时间轴统一编排行星、相机和轨道显示。点击行星时，相机从抬高的初始姿态靠近观察；另外两颗行星沿各自轨道调相至恒星左右，形成包含恒星的三角构图，到位后近同步缓慢公转。聚焦视野适配窗口比例，再次点击当前行星打开链接；聚焦期间阻止滚轮，30 秒后自动平滑返回全局视角；退出时三颗行星沿原公转方向加速回到各自持续运行的参考位置，再恢复原速度。聚焦时导航轨道整体减弱，并在球体附近柔和淡出；返回全景后平滑恢复，实体行星环保留原有质感。
- **外环巡航**：Voyager 1 Low Poly 探测器沿最外层倾斜椭圆巡航，随轨道面进动，高增益通信天线始终朝向恒星。点击飞行器天线或主体基座、或输入 `voyager` 命令进入朝向恒星的跟随近景，点击空白退出，30 秒自动返回；聚焦行星时随外环弱化。轨迹与参数见 [轨道系统](docs/orbital-system.md#voyager-最外环巡航)。
- **主终端**：点击或按 `/` 激活，支持 `help`、`debug`、`day`、`night`、`voyager`、`clear`；`light`、`dark`、`cls` 为对应别名。
- **场景信息与标签**：Act 3 显示行星、轨道、摄像机和碎片数据；行星标签由 PBD 融合布局管理，支持 `info`、`focus`、`open` 命令。算法的公式、SVG 动画和参数实验见 [交互说明](docs/actors/pbd-layout-explainer.html)。
- **结构示意**：Act 4 按由内向外的顺序固定排列三种行星，保留卫星公转、带环行星自转与环面进动、四层行星环和浅明暗面；日面边缘通过[降阶物理模型](docs/stellar-plasma-model.md)呈现六类随机日珥构型、沿磁场流动的物质，以及带有亮金色团块和稀薄前缘的日冕物质抛射。尺寸与间距非等比例。
- **主题与品牌**：支持日夜切换，灯塔图标由场景模型离屏渲染生成。主题由 CSS、场景混合和终端色板分别更新；海洋阶段的主终端保持夜间色板。

当前行星入口由 [PLANET_LINKS](src/types/index.ts) 配置：

| 标签 | 入口 |
|------|------|
| FS | [fs.yequdesu.top](https://fs.yequdesu.top) |
| Code | [code.yequdesu.top](https://code.yequdesu.top) |
| GitHub | [yequdesu](https://github.com/yequdesu) |

## 本地开发

准备 Node.js、pnpm 和支持 WebGL 的浏览器。仓库尚未通过 `engines` 或 `packageManager` 声明统一的运行时版本；安装时应核对当前依赖的环境要求。

```bash
pnpm install
pnpm dev
```

默认访问 [主应用](http://localhost:5173/)；同一开发服务也提供 [Debug Studio](http://localhost:5173/debug.html)。端口被占用时，以 Vite 实际输出为准。

| 命令 | 用途 |
|------|------|
| `pnpm dev` | 启动主应用和 Debug Studio |
| `pnpm debug` | 专注模型调试，根路径重定向到 `/debug.html` |
| `pnpm build` | 执行 TypeScript 检查和 Vite 构建，输出到 `dist/` |
| `pnpm preview` | 本地预览已构建的主应用 |
| `pnpm build:docs` | 独立构建 PBD、磁拱环与 CME 交互说明，输出到 `dist-docs/` |
| `pnpm preview:docs` | 预览已构建的交互说明 |
| `pnpm test` | Vitest 开发测试 |
| `pnpm test --run` | 单次运行测试 |
| `pnpm clean` | 删除 `dist/`、Vite 缓存和 TypeScript 构建缓存 |
| `pnpm mirror` | 查看默认端口 5173、9999 的后台服务状态 |

命令以 [package.json](package.json) 为准。测试覆盖数学工具、部分 R3F 组件、PBD 布局、终端命令、打字机和滚动容器；具体数量与通过情况以本次运行结果为准。

运行开发服务后，访问 [PBD 交互说明](http://localhost:5173/docs/actors/pbd-layout-explainer.html)，可调整布局参数、播放 SVG 动画、逐帧观察并比较求解帧率。独立构建后运行 `pnpm preview:docs`，默认打开 [实验目录](http://localhost:4173/)，根地址自动进入三个实验的导航页。开发服务也可访问 [实验目录](http://localhost:5173/docs/index.html)。还可访问[磁拱环图鉴](http://localhost:5173/docs/actors/stellar-morphology-explainer.html)，通过种子生成六类结构、查看伴随组合，并旋转或播放三维预览。[CME 逸散实验](http://localhost:5173/docs/actors/cme-dissolution-explainer.html)展示闭环转为金色粒子与薄雾的过程，支持逐阶段观察、300 秒尾迹扩散回放和原始结构对照。独立构建使用相同路径，默认端口为 4173。这两项文档命令不改变主应用的生产入口。

## Debug Studio 与模型

Debug Studio 使用可收起、可调整宽度的三栏布局：左侧搜索与管理场景对象，中间模型视口，右侧分为场景、对象、灯塔图标和导出。底部显示活动视口的实际渲染帧率、Draw Calls 和三角面数；静止时标记按需渲染。

支持灯塔、中央恒星、单颗行星、带环行星与带卫星行星等程序化 3D 资产，以及 Voyager 1 和其低模版本。恒星和行星复用主页的视觉构造，独立预览核心、大气层与完整光晕，可播放或暂停光晕动画。带环行星在此基础上添加倾斜的薄圆环面，同时用于主页最外侧导航行星。带卫星行星添加一颗可绕主体公转的卫星，支持播放、暂停、变速与停止归零。加载后自动居中取景，单视图、实体/线框对比及正交四视图使用独立对象实例；可选中、聚焦、隐藏、隔离对象，检查材质，播放模型自带动画，并导出活动视口或全部视口拼图 PNG。灯塔图标提供与主页共用的烘焙预览、保存、重新加载和本地恢复默认。

- 模型入口：[MODEL_REGISTRY](src/models/index.ts)，GLB 文件位于 [public/models/](public/models/)。
- 灯塔参数：[lighthouse-capture.yaml](src/debug/lighthouse-capture.yaml)，通过开发端点保存，构建时注入供主页截图使用。
- 模型简化：[bake-low-poly.sh](scripts/bake-low-poly.sh)，提供顶点焊接、减面、纹理缩放和压缩流程。
- 使用与扩展：[调试系统说明](src/debug/README.md)、[操作手册](src/debug/OPERATION.md)、[维护指南](src/debug/MAINTENANCE.md)、[模型说明](src/models/README.md)。

Studio 是独立的开发入口。当前 Vite 生产构建只使用 `index.html`，不会将 `debug.html` 作为页面入口输出。

## 技术与代码地图

| 职责 | 技术 |
|------|------|
| 页面与 UI | React + TypeScript |
| 3D 场景 | Three.js + React Three Fiber + Drei + InstancedMesh2 |
| 动画 | GSAP / ScrollTrigger + R3F `useFrame` |
| 状态 | Zustand + React 本地状态 |
| 调试与配置 | Leva + YAML |
| 构建与测试 | Vite + Vitest + Testing Library / R3F Test Renderer |

依赖声明见 [package.json](package.json)，解析版本见 [pnpm-lock.yaml](pnpm-lock.yaml)。

| 位置 | 职责 |
|------|------|
| [src/main.tsx](src/main.tsx)、[src/App.tsx](src/App.tsx) | 主应用入口、滚动物理、Act 编排及 DOM/SVG 叠加层 |
| [src/r3f/](src/r3f/) | Canvas、渲染请求桥接、背景/雾和行星点击检测 |
| [src/acts/](src/acts/) | 四幕分组、结构布局与相机聚焦编排 |
| [src/actors/](src/actors/) | 灯塔、海浪、光束、行星、恒星、碎片、轨道，以及品牌和标签组件 |
| [src/behaviors/](src/behaviors/) | 轨道、聚焦、投影、风铃过渡、标签布局等计算与 Hook |
| [src/terminal/](src/terminal/) | 通用终端引擎、Slot 动画编排与命令系统 |
| [src/MainTerminal.tsx](src/MainTerminal.tsx)、[src/InfoPanelTerminal.tsx](src/InfoPanelTerminal.tsx) | 主终端和场景信息终端封装 |
| [src/theme/](src/theme/)、[src/stores/](src/stores/) | 主题色板、主题更新、交互状态和实时场景数据 |
| [src/debug/](src/debug/)、[src/models/](src/models/) | Debug Studio、模型注册表与 GLB 组件 |
| [src/docs/pbd/](src/docs/pbd/README.md) | PBD 交互说明的 SVG、公式、实验与几何诊断 |
| [src/docs/stellar/](src/docs/stellar/README.md) | 磁拱环六类结构、可复现种子、三维预览与 SVG 图鉴 |
| [src/docs/cme/](src/docs/cme/README.md) | CME 粒子化逸散、阶段回放、对照实验与公式 |
| [src/shaders/](src/shaders/)、[src/utils/](src/utils/)、[src/types/](src/types/) | Shader、数学工具、共享类型和配置 |

主场景的组装关系以 [Canvas.tsx](src/r3f/Canvas.tsx) 为准：

```text
SceneCanvas
├── ScrollInvalidator / PlanetClickHandler
├── SceneLights
├── Planets / DustField
├── Lighthouse / WindChimeLines / CentralStar
├── Act1OceanVoyage → OceanWaves / LightBeam / LighthouseCapture
├── Act2GridTransition → GridLines
├── Act3ContentPhase → OrbitRings，并统一更新相机
└── Act4SystemStructure → 日面边缘 / 三种行星的独立实例
```

四个 Act 保持挂载，通过 `visible` 控制组可见性。品牌、终端、浮动标签和标签牵引线由 App 的 DOM 层管理；主行星由 `Planets` 管理，`DustField` 负责碎片。

主 Canvas 使用 `flat` 与 `frameloop="demand"`。滚动更新通过 `scrollStore` → `ScrollInvalidator` → `invalidate()` 请求一帧，再由 `useFrame` 更新场景；GSAP 与 DOM 标签也有自己的更新调度。修改动画时应同时核对渲染触发和组件生命周期，相关约定见 [AGENTS.md](AGENTS.md)。

## 附属统计服务与部署

[stats_server.py](stats_server.py) 是独立的 Linux 统计服务，通过 `/proc` 和 Docker 命令读取 CPU、内存、磁盘、负载、运行时间和容器信息。它监听 `127.0.0.1:9999/stats`；[Vite 配置](vite.config.ts) 将开发请求 `/api/stats` 转发到该服务。主页面当前没有调用此接口，启动主页无需同时启动统计服务。

[开发 Nginx 配置](mainpage.nginx.dev.conf) 和 [生产 Nginx 配置](mainpage.nginx.prod.conf) 提供反向代理/静态站点配置。部署时先运行 `pnpm build`，再按目标机器调整配置中的地址、目录等环境参数。Python 统计服务不能直接按现状用于没有 `/proc` 的 macOS 环境。

## 文档导航与维护

[AGENTS.md](AGENTS.md) 是共享协作和文档治理入口；[CLAUDE.md](CLAUDE.md) 引用同一套规则。根 README 维护项目总览，模块 README 与专题手册维护具体实现和操作细节。功能、入口或职责变化时同步更新对应说明。

| 主题 | 文档入口 |
|------|----------|
| 场景组成 | [Act 4 结构图](docs/system-structure.md)、[Act 说明](src/acts/README.md)、[Actor 说明](src/actors/README.md)、[R3F 基础设施](src/r3f/README.md) |
| 终端 | [操作手册](docs/terminal/operation-guide.md)、[维护手册](docs/terminal/maintenance-guide.md)、[技术规格](docs/terminal/specification.md) |
| 主题 | [设计](docs/theme/design.md)、[操作](docs/theme/operation-guide.md)、[维护](docs/theme/maintenance-guide.md) |
| 轨道与标签布局 | [轨道系统](docs/orbital-system.md)、[PBD 交互说明](docs/actors/pbd-layout-explainer.html)、[形式化公式](docs/actors/pbd-layout-formal.md)、[操作](docs/actors/pbd-layout-operation-guide.md)、[维护](docs/actors/pbd-layout-maintenance-guide.md) |
| 恒星活动 | [磁拱环图鉴、有向丝线换代与中央交接实验](docs/actors/stellar-morphology-explainer.html)、[CME 逸散实验](docs/actors/cme-dissolution-explainer.html)、[日珥与 CME 降阶模型](docs/stellar-plasma-model.md) |
| 渲染效果 | [Actor 设计](docs/actors/design.md)、[操作](docs/actors/operation-guide.md)、[维护](docs/actors/maintenance-guide.md) |
| 开发排障 | [维护手册](docs/MAINTENANCE.md)、[调试记录](docs/dev-blog/) |

以下材料保留各自的时间背景，不能据此判断当前实现或测试状态：

- [架构分析](docs/ARCHITECTURE.md)：Vue 迁移前的源码分析。
- [交接记录](docs/HANDOFF.md)：2026-06-18 的阶段快照。
- [技术选型评估](docs/TECH_STACK_EVALUATION.md)、[可测试性分析](docs/COMPOSABILITY_TESTABILITY.md)：迁移与设计背景。
- [方案](docs/superpowers/specs/)、[实施计划](docs/superpowers/plans/)、[阶段交接](docs/superpowers/handoff/)：具体日期下的设计和执行记录。

专题手册也可能保留旧参数或旧文件名；本轮核对了根 README 及其直接相关的场景、模型说明，未逐篇审计历史资料。遇到冲突时，以当前源码、配置和实际验证为准。
