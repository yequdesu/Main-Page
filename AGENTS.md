# AGENTS.md

本文件是本仓库所有代码助手共享的项目协作约定，适用于整个仓库；子目录如有更具体的 `AGENTS.md`，按其作用域执行。用户在当前任务中的明确指令优先于项目约定。

## 项目与入口

YeQuDesu 是滚动驱动的 3D 单页个人网站，包含海洋灯塔、网格过渡和行星导航，以及独立的开发用 Debug Studio。

- 主应用：`index.html` → `src/main.tsx` → `src/App.tsx`。
- 3D 场景：`src/r3f/Canvas.tsx`；Act 编排在 `src/acts/`，对象在 `src/actors/`，行为逻辑在 `src/behaviors/`。
- 终端：`src/terminal/TerminalBar.tsx` 是可复用引擎；`MainTerminal`、`InfoPanelTerminal` 和行星标签负责各自的内容与交互。
- 主题：`src/theme/`；滚动、聚焦、终端及主题状态在 `src/stores/scrollStore.ts`，场景实时数据在 `realtimeStore.ts`。
- Debug Studio：`debug.html` → `src/debug.tsx` → `src/debug/StudioShell.tsx`；模型注册表在 `src/models/index.ts`，资源在 `public/models/`。
- 附属统计服务：`stats_server.py` 面向 Linux，监听 `127.0.0.1:9999/stats`；Vite/Nginx 将 `/api/stats` 代理到它。主页面当前未调用此接口。

## 工作方式

- 默认使用中文沟通和编写项目说明；保留代码标识符、命令和报错原文。
- 开始修改前查看 `git status --short`、相关源码及对应模块文档。保留用户已有改动，避免无关重构。
- 当前行为以可执行源码和配置为准；注释、旧方案、交接记录有冲突时，先核对实现再更新说明。不要为迎合旧文档修改正常代码。
- 优先沿用 React、TypeScript、R3F、GSAP、Zustand 和现有组件边界。
- 调整 R3F 架构或渲染方案时，在相关设计/维护文档记录原因和来源，优先引用官方文档或可核验的社区方案；普通文案修正不需要额外技术调研。

## 命令与验证

包管理器使用 pnpm；脚本以 `package.json` 为准，依赖解析以 `pnpm-lock.yaml` 为准。

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 主应用与 `/debug.html`，默认端口 5173 |
| `pnpm debug` | Debug Studio，根路径重定向到 `/debug.html` |
| `pnpm build` | TypeScript 检查与 Vite 生产构建，输出到 `dist/` |
| `pnpm preview` | 预览已构建的静态站点 |
| `pnpm test` | 交互式 Vitest 开发测试 |
| `pnpm test --run` | 单次运行测试，适合任务验收 |
| `pnpm test --run <测试文件路径>` | 运行相关测试 |
| `pnpm mirror` | 查看默认端口的后台服务状态 |

按改动范围验证：

- 文档变更：检查文件路径、相对链接、命令与源码事实，运行 `git diff --check`；无需为纯文档变更运行应用测试或添加镜像式测试。
- 逻辑变更：运行相关现有测试；修复缺陷或新增行为时，按需要补充能验证行为的测试。
- 应用代码、依赖或构建配置变更：运行 `pnpm build`；跨模块修改时运行 `pnpm test --run`。
- 视觉与交互变更：使用浏览器检查受影响场景。三幕过渡、快进、行星聚焦、终端和主题切换按影响范围验证；Studio 变更在 `/debug.html` 检查。构建成功不能代替视觉验证。
- 报告实际运行的检查及结果；无法执行的检查说明原因，不引用旧文档中的“全部通过”作为本次结论。

`pnpm clean` 会移除构建输出及缓存，仅在需要清理时使用。`pnpm mirror --kill` 会终止端口上的进程，执行前确认进程归属和任务范围。模型烘焙脚本会写入输出 GLB，执行前核对输入、输出路径。

## 场景与性能约束

- 保留主应用 Canvas 的 `flat` 和 `frameloop="demand"`。`ScrollInvalidator` 订阅滚动进度并调用 `invalidate()`；新增动画或外部状态更新时，明确如何请求渲染。
- 全局灯光与跨幕对象保留在 Canvas 根层级。当前包括 `SceneLights`、`Planets`、`DustField`、`Lighthouse`、`WindChimeLines`、`CentralStar`。尤其不能将 `DustField` 移入某个 Act 的可见性组。
- 三个 Act 在主应用中保持挂载，以 `visible` 控制组可见性；不能把“对象已挂载”当作“当前画面可见”。DOM 标签和信息面板有独立的条件渲染逻辑。
- 逐个渲染对象检查 `renderOrder`、`transparent`、`depthWrite` 和 `depthTest`。需要指定顺序时设置在具体对象上，不能仅给父 Group 设置后假设子对象获得相同数值。
- `InstancedMesh2` 的初始 `setColorAt` 批量写入后，保留 `materialsNeedsUpdate()` 更新步骤，避免首次渲染丢失实例颜色。
- 热路径复用 `Vector3`、`Color`、`Quaternion` 等对象，避免每帧重复分配；沿用 `useFrameCache` 时确保缓存参数覆盖实际依赖。
- `useFrame` 中读取 Zustand 使用 `getState()`，避免把每帧数据无必要地转成 React 状态更新。面向 UI 的订阅使用所需字段。
- 新建的事件监听、定时器、GSAP 动画和手动管理的 GPU 资源，要明确清理与所有权；不要释放其他组件仍在使用的共享资源。

相关排障记录：`docs/dev-blog/tone-mapping-debug.md`、`scene-graph-visibility.md`、`instanced-mesh-shader-compile.md`（后两者同在 `docs/dev-blog/`）。

## 配置与模块边界

- 滚动页面高度、惯性和快进逻辑：`src/App.tsx`。
- 共享场景阈值、轨道半径和行星链接：`src/types/index.ts`；`src/r3f/ScrollRig.ts` 负责重导出阈值和背景/雾计算。
- `Planets` 管理主行星，`DustField` 管理碎片，不重新合并两者职责。
- `TerminalBar` 保持通用；主页快捷键和业务命令放在封装组件或命令注册表。全局命令与行星标签命令分别维护。
- 主题改动同时核对 CSS、场景和终端；当前各层更新机制不同，不假设统一时长或统一色板。
- 新模型通过 `MODEL_REGISTRY` 接入，路径大小写与磁盘文件一致，保留来源和许可证信息。
- 灯塔截图默认参数在 `LighthouseCaptureTypes.ts`，覆盖配置在 `src/debug/lighthouse-capture.yaml`；开发端点和构建注入在 `vite.config.ts`。

## README 与文档治理

文档按用途分工，避免多处维护相同的大段内容：

| 文档 | 职责 |
|------|------|
| 根 `README.md` | 项目定位、当前功能、启动命令、模块地图、文档入口 |
| `AGENTS.md` | 共享协作规则、实现约束、验证和文档维护要求 |
| `CLAUDE.md` | Claude Code 的入口，引用共享约定，不复制一套规则 |
| `src/*/README.md` | 本模块职责、实际文件/接口、扩展方式及相关资料 |
| `docs/` 专题手册 | 设计原理、操作和维护细节 |
| `docs/superpowers/`、交接记录、`docs/dev-blog/` | 有时间背景的方案、计划、交接和问题记录 |

维护要求：

1. 功能、启动方式、目录职责或架构入口变化时，同步更新根 README 的对应段落；模块内部变化更新最近的模块 README 或专题手册。
2. README 的文件清单必须能在仓库中找到，不把历史组件名、旧 Vue 结构或未落地方案写成现状。
3. 不长期手写测试数量、通过数量、构建耗时或包体积。需要报告这些数据时附上日期和执行命令，作为一次验证记录。
4. 依赖版本与运行环境要求从包配置核对；不凭旧手册推断 Node/pnpm 最低版本。未声明或未验证的要求应明确说明。
5. 可读性需要的关键参数可以列在 README，但必须标明源码位置；详细参数表留在模块文档，避免重复。
6. 历史材料保留时间背景并在入口标注其用途，不将历史交接页称为“当前状态”。发现专题手册滞后时，修正本次涉及部分并说明尚未核对的范围。
7. Markdown 使用仓库内相对链接，标题和列表前后留空行；交付前检查修改过的文档链接和 `git diff --check`。

## Git 约定

- 沿用已有项目约定：切换当前工作目录的分支、创建提交前，需要用户授权；用户已明确授权同一操作时不重复询问。独立 worktree 不受切换当前分支规则限制。
- 提交应覆盖完整任务阶段，避免每个小修正都单独提交。
- 未获授权不推送、发布或部署；不覆盖用户改动，不回滚与任务无关的文件。
