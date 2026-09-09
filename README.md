# YeQuDesu · Personal Site

滚动驱动的 3D 单页个人网站，全视口 `<canvas>` 渲染，GSAP ScrollTrigger 驱动三幕叙事动画。

## 体验概览

### 微缩星群转场（当前时间线）

- 25%–50%：立方体缩小翻转，420 个固定三维圆形共享缩放但不随翻转；分布内少外多、内小外大。
- 40%–65.8%：100次冷白灰识别扫描，只框选尚未汇聚的圆球，最多九组并发；选组规模1–10颗，偏向小集合，邻域半径限制为视口短边10%，避免跨稀疏区域形成大框。
- 圆球保留原240颗的同种子分布，在8–12倍包围球半径的外层追加180颗；采用随机簇状分布，立方体包围球2.4倍半径内留白；放大大小及疏密差异，保留内小外大的总体趋势。
- 50%–70%：同批圆形由内向外汇聚并产生拖尾，与立方体白化重叠；69.8%完全收束。
- 原55%–100%后续里程碑经 `afterMiniature()` 等比迁移至70%–100%，Act3约90%进入，93.33%恢复完整轨道运动。
- 会话种子在加载时生成；滚动解析计算保证逆播，不依赖定时播放。扫描选组使用参考相机及视口缓存，框跟随实时投影。
- 测试基线：三个 R3F 场景图用例因 jsdom 缺少 Canvas `createRadialGradient` mock 失败；新转场的纯函数及时间线测试不依赖此 mock。

页面拉伸至 **15 倍视口高度**，单一 `scrollProgress`（0–1）贯穿三幕：

| 幕 | 区间 | 内容 |
|-----|:---:|------|
| Act 1 "OceanVoyage" | 0–45% | 暗色海洋波浪、旋转光束的灯塔、漂浮粒子 |
| Act 2 "GridTransition" | 40–85% | 白雾过渡，波浪展平为网格 |
| Act 3 "ContentPhase" | 85–100% | 轨道环绕中央恒星、三颗行星公转、可点击聚焦 |

## 交互

- **滚动** — 物理动量惯性（`FRICTION=0.955`），驱动全部 3D 动画
- **点击** — 不再触发全页快进；Act 3 点击行星聚焦（NDC 投影检测）
- **行星聚焦** — 相机绕行 + SVG 切线连接线 + 30s 自动取消；再次点击打开链接；聚焦时阻止滚轮
- **终端系统** — 底部主终端（click + `/` 激活，支持 help / debug / day / night / clear 命令）；Act 3 左上角信息面板终端（实时显示行星/轨道/摄像机/debris 数据）
- **主题切换** — `day` / `night` 命令切换全局主题（CSS 静态元素 + Scene 背景 + Terminal 颜色三层同步过渡，0.6s crossfade）
- **灯塔截图调试** — `pnpm debug` 启动独立调试面板，Leva 实时调参 + 离屏烘焙预览 + YAML 配置持久化

## 架构

| 层 | 技术栈 |
|----|------|
| UI | React 19 + @gsap/react |
| 3D | R3F v9 + Three.js 0.170 + InstancedMesh2 |
| 状态 | Zustand v5（渲染态）+ useState（UI 态） |
| 动画 | GSAP ScrollTrigger（命令式）+ R3F useFrame（声明式） |
| 构建 | Vite 6 + TypeScript + Vitest (45 tests) |

**组件分工：** `App.tsx` 滚动物理 + DOM 叠加层 + SVG 聚焦叠加层；`BrandTitle`（品牌文字 + 灯塔图标）已从 App 抽离独立维护。R3F Canvas 内组件负责全部 3D 场景、动画循环、Act 调度。终端系统由 `TerminalBar`（纯引擎）+ `MainTerminal` / `InfoPanelTerminal`（thin wrapper）组成，通过 Slot 声明式构建。主题系统由 `src/theme/` 模块管理：`palettes.ts`（色板定义）+ `useDayNight.ts`（Hook）+ `theme.css`（CSS 变量配置），通过 GSAP blend crossfade 驱动三层平滑过渡。灯塔品牌图标由 `LighthouseCapture` 运行时离屏烘焙生成，支持 YAML 配置文件覆盖截图参数。

**场景常量：**

| 常量 | 值 | 说明 |
|------|:---:|------|
| `SCENE_CENTER_Z` | -16.0 | 灯塔、轨道、恒星、行星的统一 Z 深度 |
| `MINIATURE_START` / `MINIATURE_END` | 0.40 / 0.55 | 第一幕微缩宇宙转场 |
| `SQUARE_TRANSITION_END` | 0.60 | 方块扩散交给缩小中的轮廓画幅 |
| `TEXT_START` | 0.70 | 品牌文字出现 |
| `ACT3_START` | 0.85 | 方块轮廓与 Act 3 完成交接 |
| 轨道半径 / 轨道中心 | `[3.6, 5.0, 6.4]` / `(0, -1.0, -16)` | 三颗主行星 |

### 源文件结构

```
src/
├── main.tsx                       入口 + extend() 注册
├── debug.tsx                      调试面板入口（debug.html 加载）
├── App.tsx / App.css              滚动物理 + DOM 叠加层
├── MainTerminal.tsx               主终端（底部居中，click + / 键）
├── InfoPanelTerminal.tsx + .css   信息面板终端（Act 3 左上角）
├── r3f/
│   ├── Canvas.tsx                 flat + frameloop:demand
│   ├── ScrollRig.ts              场景阈值与通用缓动
│   ├── ScrollInvalidator.tsx     订阅→invalidate + 全局雾
│   └── PlanetClickHandler.tsx    NDC 投影点击检测
├── stores/
│   ├── scrollStore.ts              Zustand（scroll + focus + terminal + dayNight）
│   └── realtimeStore.ts            Zustand（行星/轨道/摄像机/debris + screenCoords）
├── debug/                         灯塔截图调试系统
│   ├── README.md                   系统说明
│   ├── OPERATION.md                操作手册
│   ├── MAINTENANCE.md              维护指南
│   ├── LighthousePreviewPanel.tsx  双栏调试面板（R3F Canvas + Leva + 烘焙预览）
│   ├── LighthousePreviewPanel.css  双栏布局样式
│   └── useLevaCaptureConfig.ts     Leva useControls hook
├── theme/                         主题系统
│   ├── theme.css                   CSS 变量配置（:root + [data-theme]）
│   ├── palettes.ts                 色板常量 + lerp/scroll/blend 纯函数
│   └── useDayNight.ts              Hook（store 订阅 → GSAP blend → handleThemeUpdate）
├── terminal/                      终端系统
│   ├── TerminalBar.tsx + .css     纯抽象容器引擎（layout 必传，内容 Slot children）
│   ├── slots.tsx                  Slot 类型 + collectSlots + Context
│   ├── useSlotOrchestration.ts    GSAP Timeline + echoLines 状态 + 轮询
│   ├── useTypewriterGate.ts       typewriter 动画 + exitGap 延迟
│   ├── useCommandSystem.ts        命令交互 hook
│   ├── useAnimateHeight.ts        CSS transition 高度动画
│   ├── Scrollable.tsx + .css      通用滚动容器（pinnedToBottom）
│   ├── useTypewriter.ts           逐字打字机 hook
│   ├── commands.ts                命令注册
│   └── __tests__/                 terminal 测试
├── types/index.ts                SCROLL_RIG + 数据接口
├── acts/                          Act 编排（group visible，始终挂载）
│   ├── Act1OceanVoyage.tsx        OceanWaves + Lighthouse + LightBeam
│   └── Act3ContentPhase.tsx       OrbitRings（标签由 App.tsx 的 FloatingLabels 管理）
├── actors/                        3D 对象（创建 + useFrame 动画）
│   ├── SceneLights.tsx            全局灯光（Canvas 根层级）
│   ├── DustField.tsx              3 主行星 + InstancedMesh2×80（Canvas 根层级）
│   ├── Lighthouse.tsx + LightBeam.tsx + OceanWaves.tsx
│   ├── CentralStar.tsx + OrbitRings.tsx + OrbitalRing.tsx
│   ├── Act2SquareContourTransition.tsx + Act3ContourProjection.tsx
│   ├── BrandTitle.tsx + .css      品牌标题 DOM 叠加层（BrandIcon + BrandText）
│   ├── FloatingLabels.tsx + .css  行星标签 DOM 编排容器（PBD 物理驱动）
│   ├── LighthouseCapture.tsx      灯塔离屏烘焙截图
│   ├── LighthouseCaptureTypes.ts  CaptureConfig + 默认值 + offscreenCapture 纯函数
│   └── PlanetLabelDebug.tsx + PlanetLabelGuideLines.tsx  PBD 调试覆盖层
├── behaviors/                     纯函数 + Hook
│   ├── useCameraFocus.ts + useFrameCache.ts
│   ├── useOrbitPosition.ts + useAppearanceFade.ts
│   ├── useOcclusionFade.ts + useScreenSpaceHover.ts
│   ├── useScreenProjection.ts     3D→2D 屏幕坐标投影
│   ├── useFloatingLabels.ts       标签编排逻辑（PBD + 入场排序 + 退出超时）
│   ├── usePBDLayout.ts            PBD 物理布局（连续时间约束动力学）
│   └── __tests__/                 45 tests
├── shaders/VolumetricBeamShader.ts
└── utils/                         smoothstep / toward / shortestDelta
```

## 渲染管线

### 触发机制

`frameloop="demand"` 模式下，R3F 不自动循环。每次渲染由以下链路触发：

```
用户滚轮/拖拽 → App.tsx 滚动物理
  → setScrollProgress(sp) → Zustand
  → ScrollInvalidator.subscribe → invalidate()
  → 所有 useFrame 按 scene graph 顺序执行 → WebGL 渲染
```

### 渲染层级

Three.js 按 `renderOrder` 从小到大分组渲染。`renderOrder` 不继承——每个几何体对象须显式设置。透明对象（`transparent: true`）在各组内按距离排序。

| Layer | renderOrder | 对象 | depthWrite |
|:---:|:---:|------|:---:|
| 0 | 0 | 海浪线、灯塔、光束锥体/射线/辉光 | false |
| 1 | 1 | 恒星光晕+Halo、主行星×3 | 行星=true, 其余=false |
| 2 | 2 | 恒星核心、轨道环、陀螺仪环、网格线、碎片×80 | 核心=true, 其余=false |
| — | — | 行星标签（DOM overlay，非 3D 对象） | — |

- `depthWrite=true` → 写入深度缓冲，遮挡后方对象
- `depthWrite=false` → 不写深度，不遮挡任何对象
- **`DustField` 必须在 Canvas 根层级**——不在任何 Act 的 `visible` group 内

**设计文档：** `docs/superpowers/specs/` | **调试记录：** `docs/dev-blog/` | **维护手册：** `docs/MAINTENANCE.md` | **轨道系统：** `docs/orbital-system.md`

## 开发

```bash
pnpm install && pnpm dev         # → localhost:5173（主应用 + debug.html）
pnpm debug                       # → localhost:5173/debug.html（仅灯塔截图调试面板）
pnpm build                       # tsc + vite → dist/
pnpm test                        # vitest（45 tests / 8 suites）
pnpm clean && pnpm mirror        # 辅助脚本
```

`pnpm debug` 与 `pnpm dev` 的区别见 [`src/debug/README.md`](src/debug/README.md)。

## 维护约束

- 方案修正或项目结构变更时，必须同步更新本文件
- 每个 R3F 方案决策必须援引社区方案并说明来源
- 面向 Claude Code 的约束见 `CLAUDE.md`

## 相关文档

| 文档 | 路径 | 用途 |
|------|------|------|
| 终端操作手册 | [`docs/terminal/operation-guide.md`](docs/terminal/operation-guide.md) | 用户使用指南 |
| 终端维护手册 | [`docs/terminal/maintenance-guide.md`](docs/terminal/maintenance-guide.md) | 代码地图、动画系统、扩展指南 |
| 终端技术规格 | [`docs/terminal/specification.md`](docs/terminal/specification.md) | API、设计决策 |
| 主题设计文档 | [`docs/theme/design.md`](docs/theme/design.md) | 架构、三层过渡模型、色板系统 |
| 主题操作手册 | [`docs/theme/operation-guide.md`](docs/theme/operation-guide.md) | 用户使用指南 |
| 主题维护手册 | [`docs/theme/maintenance-guide.md`](docs/theme/maintenance-guide.md) | 代码地图、修改颜色、扩展指南 |
| Actor 设计文档 | [`docs/actors/design.md`](docs/actors/design.md) | CentralStar / Planets 图层架构、渲染管线 |
| Actor 操作手册 | [`docs/actors/operation-guide.md`](docs/actors/operation-guide.md) | 视觉效果说明、故障排除 |
| Actor 维护手册 | [`docs/actors/maintenance-guide.md`](docs/actors/maintenance-guide.md) | 调参指南、新增光晕层、调试 |
| 维护手册 | [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md) | 调试/开发/维护流程 + 渲染特效 + 浏览器兼容性 |
| 交接文档 | [`docs/HANDOFF.md`](docs/HANDOFF.md) | 当前状态、已完成工作、快速启动 |
| 轨道系统 | [`docs/orbital-system.md`](docs/orbital-system.md) | 力学模型、变换推导、配置参考 |
| 技术评估 | [`docs/TECH_STACK_EVALUATION.md`](docs/TECH_STACK_EVALUATION.md) | 11 项架构决策 + 援引来源 |
| 可测试性 | [`docs/COMPOSABILITY_TESTABILITY.md`](docs/COMPOSABILITY_TESTABILITY.md) | R3F vs TresJS vs Vanilla 对比 |
| 架构分析（历史） | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Vue 原版源码分析（迁移前参考） |
| 调试系统说明 | [`src/debug/README.md`](src/debug/README.md) | 架构、配置流、文件清单 |
| 调试操作手册 | [`src/debug/OPERATION.md`](src/debug/OPERATION.md) | 启动方式、参数分组、工作流 |
| 调试维护指南 | [`src/debug/MAINTENANCE.md`](src/debug/MAINTENANCE.md) | 新增参数清单、端点说明、配置流向 |
| 调试记录 | [`docs/dev-blog/`](docs/dev-blog/) | 4 篇问题排查记录 |
| 模块说明 | [`src/*/README.md`](src/) | 各目录的职责和依赖说明 |

## 附属服务

- `stats_server.py` — 独立 Python 后端，`/api/stats`
- `mainpage.nginx.dev.conf` / `mainpage.nginx.prod.conf` — Nginx 配置
