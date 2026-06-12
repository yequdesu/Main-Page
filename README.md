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
| 动画 | GSAP ScrollTrigger（命令式滚动）+ R3F useFrame（声明式渲染） |
| 构建 | Vite 6 + TypeScript + Vitest (13 tests) |

**组件分工：** `App.tsx` 滚动物理 + DOM 叠加层；R3F Canvas 内组件负责全部 3D 场景、动画循环、Act 调度。

**场景常量：** `SCENE_CENTER_Z = -16.0`，轨道中心 `(0, -1.0, -16)`，行星轨道半径 `[3.6, 5.0, 6.4]`

**设计文档：** `docs/superpowers/specs/` | **调试记录：** `docs/dev-blog/` | **维护手册：** `docs/MAINTENANCE.md`

## 渲染管线

`frameloop="demand"` → `ScrollInvalidator` 订阅 Zustand 变化 → `invalidate()` → 所有 useFrame 执行 → WebGL 渲染。

| Layer | renderOrder | 对象 | depthWrite | 说明 |
|:---:|:---:|------|:---:|------|
| 0 | 0 | 海浪线、灯塔、光束锥体/射线/辉光 | false | 背景层 |
| 1 | 1 | 恒星光晕+Halo、主行星×3 | 行星=true | 天体层 |
| 2 | 2 | 恒星核心、轨道环、陀螺仪环、网格线、碎片×132 | 核心=true | 前景层 |
| 9999 | 9999 | 行星标签 Sprite | false（无深度测试） | 始终可见 |

**renderOrder 不继承：** 每个几何体对象须显式设置。`DustField` 在 Canvas 根层级（不在 Act group 内）。

## 开发

```bash
npm install && npm run dev       # → localhost:5173
npm run build                    # tsc + vite → dist/
npm run test                     # vitest（13 tests / 3 suites）
npm run clean && npm run mirror  # 辅助脚本
```

## 维护约束

- 方案修正或项目结构变更时，必须同步更新本文件
- 每个 R3F 方案决策必须援引社区方案并说明来源
- 面向 Claude Code 的约束见 `CLAUDE.md`

## 附属服务

- `stats_server.py` — 独立 Python 后端，`/api/stats`
- `mainpage.nginx.dev.conf` / `mainpage.nginx.prod.conf` — Nginx 配置
