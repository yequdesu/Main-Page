# YeQuDesu · Personal Site

滚动驱动的 3D 单页个人网站，全视口 `<canvas>` 渲染。

## 体验概览

页面拉伸至 **15 倍视口高度**，GSAP ScrollTrigger 驱动单一 `scrollProgress`（0–1）贯穿三幕：

| 幕 | 区间 | 效果 |
|-----|-------|--------------|
| **Act 1 "OceanVoyage"** | 0–45% | 暗色海洋、波浪线、旋转光束的灯塔、漂浮粒子 |
| **Act 2 "GridTransition"** | 40–85% | 白雾过渡，波浪展平为网格，垂直网格线升起 |
| **Act 3 "ContentPhase"** | 85–100% | 轨道环围绕中央恒星，三颗行星公转，可点击聚焦 |

## 交互

- **滚动** — 驱动全部 3D 场景动画，带物理动量惯性
- **点击** — 快进跳至末尾（2 秒过渡动画）
- **Act 3 点击行星** — 聚焦行星，显示恒星与行星之间的 SVG 切线连接线；再次点击打开链接；30 秒自动取消聚焦

## 架构设计

### 当前实现（R3F · Editor-CyDlen 分支）

| 层 | 技术 | 援引 |
|----|------|------|
| UI 框架 | React 19 + @gsap/react | — |
| 3D 引擎 | React Three Fiber v9 + Drei v10 | pmndrs 生态 ~45k ★ |
| 滚动驱动 | GSAP ScrollTrigger（命令式）+ R3F useFrame（声明式渲染） | Codrops 2025, Builder.io, Ringston 3D |
| 状态管理 | Zustand v5（渲染状态）+ React useState（UI 状态） | R3F 官方"五类出口"，Galaxy Voyager |
| 场景管理 | Act 组件 + `visible` prop（始终挂载，不 mount/unmount） | R3F Performance Pitfalls |
| 粒子系统 | 3 主行星独立 Mesh + 132 碎片 InstancedMesh | Drei Sparkles, Galaxy Voyager |
| 测试 | L1 纯函数全覆盖 (13 tests) + L2 场景图验证 | vitest + @react-three/test-renderer |
| 语言 | TypeScript（`.tsx`） | R3F 自身以 TS 编写 |
| 构建 | Vite 6 + tsc | — |

**设计文档：** `docs/superpowers/specs/2026-06-10-r3f-refactor-design.md`
**技术评估：** `docs/TECH_STACK_EVALUATION.md`
**交接文档：** `docs/HANDOFF.md`
**源码分析：** `docs/ARCHITECTURE.md`

### 源文件结构（34 个文件）

```
src/
├── main.tsx                        入口 + GSAP 注册
├── App.tsx / App.css               滚动物理 + DOM 叠加层 + SVG 聚焦 + CSS 变量
├── vite-env.d.ts
├── r3f/
│   ├── Canvas.tsx                  R3F Canvas（frameloop: demand）
│   ├── ScrollRig.ts                sp 阈值 + sceneApplyWhiteOut
│   └── ScrollInvalidator.tsx       Zustand 订阅 → invalidate() 桥接
├── stores/
│   └── scrollStore.ts             Zustand（scrollSlice + focusSlice + overlayData）
├── types/
│   └── index.ts                   SCROLL_RIG + ParticleData + PlanetLink + OverlayData
├── acts/
│   ├── Act1OceanVoyage.tsx         Lighthouse + LightBeam + OceanWaves + DustField + LighthouseCapture
│   ├── Act2GridTransition.tsx      GridLines
│   └── Act3ContentPhase.tsx        OrbitRings + CentralStar + PlanetLabel + 相机聚焦
├── actors/
│   ├── Lighthouse.tsx             30 Mesh 声明式灯塔（暴露 ref 供离屏截图）
│   ├── LightBeam.tsx              3 锥体 + 2 射线 + 辉光 + 3 模式动画 + 灯光
│   ├── OceanWaves.tsx             50 条线，逐顶点波浪动画
│   ├── DustField.tsx              3 Planet + InstancedMesh(132)，per-frame 全参数更新
│   ├── Planet.tsx                 主行星（高面数 + onClick 聚焦/跳转）
│   ├── CentralStar.tsx            核心 + 光晕 + Canvas 精灵 halo
│   ├── OrbitRings.tsx             3 轨道环 + 3 陀螺仪环
│   ├── GridLines.tsx              28 垂直线 + 210 节点
│   ├── PlanetLabel.tsx            Canvas → Sprite React 组件（位置跟随 + 聚焦淡出）
│   └── LighthouseCapture.tsx      离屏 WebGLRenderTarget → base64 PNG
├── behaviors/
│   ├── useCameraFocus.ts          相机双层平滑 + 绕行 + 30s 自动取消 + SVG overlay
│   ├── useFrameCache.ts           帧缓存守卫（time + sp 重复跳过）
│   ├── useOrbitPosition.ts        轨道位置纯函数（可 L1 单测）
│   ├── useAppearanceFade.ts       缩放/透明度/颜色过渡纯函数（可 L1 单测）
│   ├── useOcclusionFade.ts        聚焦遮挡淡化纯函数（可 L1 单测）
│   ├── useScreenSpaceHover.ts     NDC 投影悬停检测 + 迟滞阈值
│   └── __tests__/
│       ├── smoothstep.test.ts     6 个 L1 纯函数测试
│       ├── toward.test.ts
│       └── r3f-components.test.tsx 7 个 L2 场景图测试
├── shaders/
│   └── VolumetricBeamShader.ts    自定义光束着色器
└── utils/
    ├── smoothstep.ts / toward.ts / shortestDelta.ts
```

## 开发

```bash
npm install       # 安装依赖（或 pnpm install && pnpm approve-builds esbuild）
npm run dev       # 启动开发服务器（localhost:5173，绑定 0.0.0.0）
npm run build     # 生产构建（tsc + vite）→ dist/
npm run preview   # 预览生产构建
npm run test      # 运行 vitest（13 tests，3 suites）
npm run test:ui   # 浏览器测试 UI
npm run clean     # 清除 dist + .vite 缓存 + tsbuildinfo
npm run mirror    # 监控后台进程（Vite :5173, Stats :9999）
```

开发服务器将 `/api/*` 代理至 `http://127.0.0.1:9999`（去除 `/api` 前缀）。

## 维护约定

- **方案修正或项目结构变更时，必须同步更新本 README**——保持文档与实际架构一致
- **每个 R3F 方案决策必须援引社区成熟方案并说明来源**——方便后续评估、维护与持续学习
- 面向人类的项目介绍见本文件，面向 Claude Code 的工作约束见 `CLAUDE.md`

## 附属服务

- `stats_server.py` — 独立 Python 后端，`/api/stats` 系统指标端点
- `mainpage.nginx.dev.conf` / `mainpage.nginx.prod.conf` — Nginx 配置
