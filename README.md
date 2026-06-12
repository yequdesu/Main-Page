# YeQuDesu · Personal Site

滚动驱动的 3D 单页个人网站，全视口 `<canvas>` 渲染，GSAP ScrollTrigger 驱动三幕叙事动画。

## 体验概览

页面拉伸至 **15 倍视口高度**，单一 `scrollProgress`（0–1）贯穿三幕：

| 幕 | 区间 | 内容 |
|-----|:---:|------|
| Act 1 "OceanVoyage" | 0–45% | 暗色海洋波浪、旋转光束的灯塔、漂浮粒子 |
| Act 2 "GridTransition" | 40–85% | 白雾过渡，波浪展平为网格 |
| Act 3 "ContentPhase" | 85–100% | 轨道环绕中央恒星、三颗行星公转、可点击聚焦 |

## 交互

- **滚动** — 物理动量惯性（`FRICTION=0.955`），驱动全部 3D 动画
- **点击** — 快进跳至末尾（2s GSAP tween）；Act 3 点击行星聚焦（NDC 投影检测）
- **行星聚焦** — 相机绕行 + SVG 切线连接线 + 30s 自动取消；再次点击打开链接；聚焦时阻止滚轮

## 架构

| 层 | 技术栈 |
|----|------|
| UI | React 19 + @gsap/react |
| 3D | R3F v9 + Three.js 0.170 + InstancedMesh2 |
| 状态 | Zustand v5（渲染态）+ useState（UI 态） |
| 动画 | GSAP ScrollTrigger（命令式）+ R3F useFrame（声明式） |
| 构建 | Vite 6 + TypeScript + Vitest (13 tests) |

**组件分工：** `App.tsx` 滚动物理 + DOM 叠加层 + 品牌文字 + SVG 聚焦叠加层；R3F Canvas 内组件负责全部 3D 场景、动画循环、Act 调度。

**场景常量：**

| 常量 | 值 | 说明 |
|------|:---:|------|
| `SCENE_CENTER_Z` | -16.0 | 灯塔、轨道、恒星、行星的统一 Z 深度 |
| `WHITE_OUT_THRESHOLD` / `WHITE_OUT_END` | 0.40 / 0.55 | 白雾过渡区间 |
| `GRID_START` / `VERTICAL_START` | 0.45 / 0.58 | 网格展平 / 垂直线开始 |
| `TEXT_START` | 0.70 | 品牌文字出现 |
| `GRID_SHIFT_START` | 0.85 | Act 3 出现，全部元素下移 32Y |
| 轨道半径 / 轨道中心 | `[3.6, 5.0, 6.4]` / `(0, -1.0, -16)` | 三颗主行星 |

### 源文件结构

```
src/
├── main.tsx                       入口 + extend() 注册
├── App.tsx / App.css              滚动物理 + DOM 叠加层
├── r3f/
│   ├── Canvas.tsx                 flat + frameloop:demand
│   ├── ScrollRig.ts              阈值 + sceneApplyWhiteOut
│   ├── ScrollInvalidator.tsx     订阅→invalidate + 全局雾
│   └── PlanetClickHandler.tsx    NDC 投影点击检测
├── stores/scrollStore.ts         Zustand（scroll + focus）
├── types/index.ts                SCROLL_RIG + 数据接口
├── acts/                          Act 编排（group visible，始终挂载）
│   ├── Act1OceanVoyage.tsx        OceanWaves + Lighthouse + LightBeam
│   ├── Act2GridTransition.tsx     GridLines
│   └── Act3ContentPhase.tsx       OrbitRings + CentralStar + PlanetLabel
├── actors/                        3D 对象（创建 + useFrame 动画）
│   ├── SceneLights.tsx            全局灯光（Canvas 根层级）
│   ├── DustField.tsx              3 主行星 + InstancedMesh2×132（Canvas 根层级）
│   ├── Lighthouse.tsx + LightBeam.tsx + OceanWaves.tsx
│   ├── CentralStar.tsx + OrbitRings.tsx + GridLines.tsx
│   ├── PlanetLabel.tsx + LighthouseCapture.tsx
├── behaviors/                     纯函数 + Hook
│   ├── useCameraFocus.ts + useFrameCache.ts
│   ├── useOrbitPosition.ts + useAppearanceFade.ts
│   ├── useOcclusionFade.ts + useScreenSpaceHover.ts
│   └── __tests__/                 13 tests
├── shaders/VolumetricBeamShader.ts
└── utils/                         smoothstep / toward / shortestDelta
```

## 渲染管线

### 触发机制

`frameloop="demand"` 模式下，R3F 不自动循环。每次渲染由以下链路触发：

```
用户滚轮/拖拽/点击快进 → App.tsx 滚动物理
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
| 2 | 2 | 恒星核心、轨道环、陀螺仪环、网格线、碎片×132 | 核心=true, 其余=false |
| 9999 | 9999 | 行星标签 Sprite（depthTest=false） | false |

- `depthWrite=true` → 写入深度缓冲，遮挡后方对象
- `depthWrite=false` → 不写深度，不遮挡任何对象
- **`DustField` 必须在 Canvas 根层级**——不在任何 Act 的 `visible` group 内

**设计文档：** `docs/superpowers/specs/` | **调试记录：** `docs/dev-blog/` | **维护手册：** `docs/MAINTENANCE.md`

## 开发

```bash
pnpm install && pnpm dev         # → localhost:5173
pnpm build                       # tsc + vite → dist/
pnpm test                        # vitest（13 tests / 3 suites）
pnpm clean && pnpm mirror        # 辅助脚本
```

## 维护约束

- 方案修正或项目结构变更时，必须同步更新本文件
- 每个 R3F 方案决策必须援引社区方案并说明来源
- 面向 Claude Code 的约束见 `CLAUDE.md`

## 附属服务

- `stats_server.py` — 独立 Python 后端，`/api/stats`
- `mainpage.nginx.dev.conf` / `mainpage.nginx.prod.conf` — Nginx 配置
