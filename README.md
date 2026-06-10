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

### 当前实现（Legacy · Editor-CyDlen 分支）

| 层 | 技术 |
|----|------|
| UI 框架 | Vue 3 + GSAP ScrollTrigger |
| 3D 引擎 | Vanilla Three.js（命令式） |
| 场景管理 | 单文件 LighthouseScene.vue（~1580 行） |
| 状态管理 | Vue ref + 模块级变量 + GSAP tween（三层混用） |
| 语言 | JavaScript |

### 目标架构（R3F 重构 · 设计中）

| 层 | 技术 | 援引 |
|----|------|------|
| UI 框架 | React 19 + @gsap/react | — |
| 3D 引擎 | React Three Fiber v9 + Drei v10 | pmndrs 生态 ~45k ★ |
| 滚动驱动 | GSAP ScrollTrigger（命令式）+ R3F（声明式渲染） | Codrops 2025, Builder.io, Ringston 3D |
| 状态管理 | Zustand（渲染状态）+ React useState（UI 状态） | R3F 官方"五类出口"，Galaxy Voyager |
| 场景管理 | Act 组件 + `visible` prop | R3F Performance Pitfalls |
| 粒子系统 | 3 主行星独立 Mesh + 132 碎片 InstancedMesh | Drei Sparkles, Galaxy Voyager |
| 测试 | L1 纯函数全覆盖 + L2 关键路径场景图验证 | @react-three/test-renderer |
| 语言 | TypeScript（`.tsx`） | R3F 自身以 TS 编写 |

**完整设计文档：** `docs/superpowers/specs/2026-06-10-r3f-refactor-design.md`
**技术栈评估：** `docs/TECH_STACK_EVALUATION.md`
**可组合性与可测试性分析：** `docs/COMPOSABILITY_TESTABILITY.md`
**源码结构分析：** `docs/ARCHITECTURE.md`

### 目标目录结构

```
src/
├── main.tsx                        React 入口 + GSAP 注册
├── App.tsx                         滚动物理 + DOM 叠加层
├── App.css                         品牌文字 + 聚焦 SVG + 滚动提示
├── r3f/
│   ├── Canvas.tsx                  R3F Canvas 配置
│   └── ScrollRig.ts               sp 阈值集中定义
├── stores/
│   └── scrollStore.ts             Zustand（scroll/focus/hover slice）
├── acts/
│   ├── Act1OceanVoyage.tsx
│   ├── Act2GridTransition.tsx
│   └── Act3ContentPhase.tsx
├── actors/
│   ├── Lighthouse.tsx / LightBeam.tsx / OceanWaves.tsx
│   ├── DustField.tsx / Planet.tsx
│   ├── CentralStar.tsx / OrbitRings.tsx / GridLines.tsx
│   └── PlanetLabel.tsx
├── behaviors/
│   ├── useScreenSpaceHover.ts / useOrbitPosition.ts
│   ├── useAppearanceFade.ts / useOcclusionFade.ts
│   ├── useCameraFocus.ts / useFrameCache.ts
│   └── __tests__/
├── shaders/
│   └── VolumetricBeamShader.ts
└── utils/
    ├── smoothstep.ts / toward.ts / shortestDelta.ts
```

## 开发

```bash
npm install      # 安装依赖（或 pnpm install && pnpm approve-builds esbuild）
npm run dev      # 启动开发服务器（localhost:5173）
npm run build    # 生产构建 → dist/
npm run preview  # 预览生产构建
```

## 维护约定

- **方案修正或项目结构变更时，必须同步更新本 README**——保持文档与实际架构一致
- **每个 R3F 方案决策必须援引社区成熟方案并说明来源**——方便后续评估、维护与持续学习
- 面向人类的项目介绍见本文件，面向 Claude Code 的工作约束见 `CLAUDE.md`

## 附属服务

- `stats_server.py` — 独立 Python 后端，`/api/stats` 系统指标端点
- `mainpage.nginx.dev.conf` / `mainpage.nginx.prod.conf` — Nginx 配置
