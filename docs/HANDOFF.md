# 项目交接文档

> 生成时间：2026-06-10  
> 分支：`Editor-CyDlen`  
> 最后提交：`b571d1d` — mirror 脚本

---

## 一、项目概述

**YeQuDesu · Personal Site** — 滚动驱动的 3D 单页个人网站。全视口 `<canvas>` 渲染，GSAP ScrollTrigger 驱动三幕叙事动画。

### 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| UI 框架 | React | 19 |
| 3D 引擎 | React Three Fiber (R3F) | 9.6 |
| 3D 辅助 | Drei | 10.7 |
| 动画 | GSAP + @gsap/react | 3.15 |
| 状态管理 | Zustand | 5.0 |
| 语言 | TypeScript | 5.7 (tsc 6.0) |
| 构建 | Vite | 6.4 |
| 测试 | Vitest | 4.1 |
| 后端 | Python (stats_server.py) | 3.x |

### 包管理器

npm 为主，pnpm 兼容。安装时若用 pnpm 需额外运行 `pnpm approve-builds esbuild`。

---

## 二、已完成工作

### 2.1 框架迁移（Vanilla Three.js + Vue → R3F + React）

| 变更 | 说明 |
|------|------|
| 移除 Vue 3 全家桶 | `vue`、`@vitejs/plugin-vue`、`.vue` 文件全部删除 |
| 引入 React 19 + R3F | 27 个 TypeScript 源文件替代原来的 5 个 Vue 文件 |
| LighthouseScene.vue 拆分 | 1580 行单文件 → 9 个 Actor + 3 个 Act + 6 个 behavior/hook |
| 命令式 → 声明式 | `new THREE.Mesh()` 链式调用 → R3F JSX 组件树 |

### 2.2 架构决策（均已归档于 `docs/TECH_STACK_EVALUATION.md`）

| # | 决策 | 方案 |
|---|------|------|
| 1 | 技术栈 | React 19 + R3F v9 + TypeScript |
| 2 | 滚动驱动 | GSAP ScrollTrigger（命令式）+ R3F useFrame（声明式渲染） |
| 3 | 状态管理 | Zustand（渲染状态）+ React useState（UI 状态） |
| 4 | Act 可见性 | `visible` prop 切换（始终挂载，不 mount/unmount） |
| 5 | 粒子系统 | 3 主行星独立 Mesh + 132 碎片 InstancedMesh |
| 6 | 测试策略 | L1 纯函数全覆盖 + L2 关键路径场景图验证 |

### 2.3 源文件结构（28 个文件）

```
src/
├── main.tsx                        入口 + GSAP 注册
├── App.tsx / App.css               滚动物理 + DOM 叠加层 + SVG 聚焦层
├── vite-env.d.ts
├── r3f/
│   ├── Canvas.tsx                   R3F Canvas（frameloop:demand）
│   └── ScrollRig.ts                阈值 + sceneApplyWhiteOut
├── stores/
│   └── scrollStore.ts              Zustand（scrollSlice + focusSlice）
├── types/
│   └── index.ts                    SCROLL_RIG + 所有共享类型
├── acts/
│   ├── Act1OceanVoyage.tsx         组装 OceanWaves + Lighthouse + LightBeam + DustField
│   ├── Act2GridTransition.tsx      组装 GridLines
│   └── Act3ContentPhase.tsx        组装 OrbitRings + CentralStar + 相机聚焦
├── actors/
│   ├── Lighthouse.tsx              30 个 Mesh 声明式灯塔
│   ├── LightBeam.tsx               3 锥体 + 2 射线 + 辉光
│   ├── OceanWaves.tsx              50 条线，逐顶点波浪动画
│   ├── DustField.tsx               3 Planet + InstancedMesh(132)，per-frame 更新
│   ├── Planet.tsx                  主行星（高面数 + onClick）
│   ├── CentralStar.tsx             核心 + 光晕 + Canvas 精灵 halo
│   ├── OrbitRings.tsx              3 轨道环 + 3 陀螺仪环
│   ├── GridLines.tsx               28 垂直线 + 210 节点
│   └── PlanetLabel.tsx             Canvas → Sprite 标签工厂
├── behaviors/
│   ├── useCameraFocus.ts           相机双层平滑 + 绕行 + 30s 自动取消 + SVG overlay
│   └── useFrameCache.ts            帧缓存守卫
├── shaders/
│   └── VolumetricBeamShader.ts     自定义光束着色器
└── utils/
    ├── smoothstep.ts / toward.ts / shortestDelta.ts
    └── __tests__/                  6 个纯函数测试
```

### 2.4 脚本

```bash
npm run dev      # 启动开发服务器（HMR, :5173）
npm run build    # 生产构建（tsc + vite）→ dist/
npm run preview  # 预览生产构建
npm run test     # 运行 vitest（6/6 通过）
npm run test:ui  # 浏览器测试 UI
npm run clean    # 清除 dist + .vite 缓存 + tsbuildinfo
npm run mirror   # 监控后台进程（Vite :5173, Stats :9999）
```

---

## 三、当前状态：功能完备度

### 已验证

| 项目 | 状态 |
|------|:---:|
| TypeScript 编译 | ✅ 零错误 |
| 生产构建 | ✅ 1.2s，~1.2MB JS |
| 单元测试 | ✅ 6/6 通过（smoothstep, toward） |
| React 脚手架 | ✅ 含 App.tsx（GSAP 滚动 + DOM 层） |
| Lighthouse actor | ✅ 30 个 Mesh 声明式组件 |
| LightBeam actor | ✅ 3 锥体 + ShaderMaterial + 射线 |
| OceanWaves actor | ✅ 50 条线，逐顶点动画 + 白化过渡 |
| GridLines actor | ✅ 28 线 + 210 节点，交错延伸 |
| DustField actor | ✅ 3 Planet + InstancedMesh(132)，per-frame 全参数更新 |
| CentralStar actor | ✅ 核心 + 光晕 + Canvas halo |
| OrbitRings actor | ✅ 3 轨道 + 3 陀螺仪环 |
| PlanetLabel actor | ✅ Canvas → Sprite 工厂函数 |
| Act 可见性控制 | ✅ visible prop（始终挂载） |
| Zustand store | ✅ scrollSlice + focusSlice |
| 相机聚焦 | ✅ 双层平滑 + 绕行 + 30s 自动取消 |
| SVG 切线叠加层 | ✅ 屏幕空间投影 + 外公切线 |
| CSS 样式迁移 | ✅ 品牌文字 + 滚动提示 + 聚焦动画 |
| pnpm 兼容 | ✅ 构建/测试均通过 |
| Mirror 进程监控 | ✅ Vite + Stats 端口检测 |
| Clean 脚本 | ✅ 中间产物清理 |

### 待完善（按优先级）

| # | 事项 | 说明 |
|---|------|------|
| 1 | **frameloop 连接** | 当前 R3F Canvas 使用 `frameloop: 'demand'`，但 GSAP ticker 未调用 `invalidate()`。需在 App.tsx 的 physics ticker 中添加 `invalidate()` 触发 R3F 重渲染 |
| 2 | **光束 idle 动画** | LightBeam 的三种模式（空闲漫游/滚动归位/白化增强）尚未实现——当前仅静态渲染 |
| 3 | **行星标签跟随** | PlanetLabel actor 已创建，但未在 Act3 中挂载并跟随行星位置 |
| 4 | **灯塔截图** | `captureLighthouse()` 函数未迁移到 R3F（需用 `useThree().gl` 做离屏渲染） |
| 5 | **行为 hook 补全** | `useScreenSpaceHover`、`useOrbitPosition`、`useAppearanceFade`、`useOcclusionFade` 的纯计算逻辑在 DustField 的 useFrame 中内联——可抽取为独立 hook 以提升可测试性 |
| 6 | **R3F 组件测试** | `@react-three/test-renderer` 已安装但未编写 L2 场景图测试 |
| 7 | **品牌文字 CSS 变量** | `--text-offset-y` 的 Act 3 同步位移逻辑未从原 `updateTextOffsetCSS` 迁移 |

---

## 四、关键设计文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| 架构分析 | `docs/ARCHITECTURE.md` | 源码逐函数拆解 + 重构建议 |
| 技术评估 | `docs/TECH_STACK_EVALUATION.md` | 11 项架构决策 + 援引来源 |
| 可组合性/可测试性 | `docs/COMPOSABILITY_TESTABILITY.md` | R3F vs TresJS vs Vanilla 对比 |
| 设计文档 | `docs/superpowers/specs/2026-06-10-r3f-refactor-design.md` | 9 章正式设计文档 |
| 实施计划 | `docs/superpowers/plans/2026-06-10-r3f-refactor.md` | 16 Task 实施计划 |
| 维护手册 | `docs/MAINTENANCE.md` | 调试/开发/维护流程 + 浏览器兼容性 |
| 项目说明 | `README.md` | 体验概览 + 架构 + 维护约定 |
| Claude 约束 | `CLAUDE.md` | 语言协定 + 维护约束 + 架构要点 |

---

## 五、维护约束（CLAUDE.md 定义）

1. 方案修正或项目结构变更时，必须同步更新 `README.md`
2. 每个 R3F 方案决策必须援引社区成熟方案并说明来源
3. `.superpowers/`、`.claude/`、`node_modules/`、`dist/`、`*.log`、`*.tsbuildinfo` 禁止提交至 git
4. 面向人类的文档见 `README.md`，面向 Claude Code 的约束见 `CLAUDE.md`

---

## 六、快速启动

```bash
git clone ... && cd YeQuDesu-Main-Page
git checkout Editor-CyDlen
npm install
npm run dev          # → http://localhost:5173
npm run mirror       # 监控后台进程
```
