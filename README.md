# YeQuDesu · Personal Site

基于 **Vue 3 + Vite + Three.js + GSAP** 构建的单页个人网站。整个体验是一个由滚动驱动的 3D 场景，渲染在全视口 `<canvas>` 上。

## 体验概览

页面通过 GSAP ScrollTrigger 驱动，body 拉伸至 **15 倍视口高度**。单一的 `scrollProgress`（0–1）控制整个 3D 场景的演变，分为三幕：

| 幕 | 区间 | 效果 |
|-----|-------|--------------|
| **Act 1 "OceanVoyage"** | 0–45% | 暗色海洋、波浪线、旋转光束的灯塔、漂浮粒子 |
| **Act 2 "GridTransition"** | 40–85% | 白雾过渡，背景由暗转亮，波浪展平为网格，垂直网格线升起 |
| **Act 3 "ContentPhase"** | 85–100% | 网格下降，三条轨道环围绕中央恒星，三颗行星（FS、Code、GitHub）公转，可点击聚焦 |

## 交互

- **滚动** — 驱动全部 3D 场景动画，带物理动量惯性
- **点击** — 快进跳至末尾（2 秒过渡动画）
- **Act 3 点击行星** — 相机聚焦到行星，显示恒星与行星之间的切线连接线；再次点击打开对应链接；30 秒后自动取消聚焦

## 技术栈

| 依赖 | 用途 |
|------|------|
| **three** (`^0.170.0`) | 3D 渲染 |
| **gsap** (`^3.12.5`) | 滚动驱动动画（ScrollTrigger 插件）|
| **vue** (`^3.5.13`) | UI 框架 |
| **vite** (`^6.0.0`) | 构建工具 |

## 项目结构

```
src/
├── App.vue                         # 滚动触发、物理动量、品牌文字、聚焦叠加层 SVG
├── main.js                         # 入口，注册 GSAP ScrollTrigger
├── components/
│   ├── LighthouseScene.vue         # 整个 Three.js 场景与动画循环
│   └── AppFooter.vue               # 静态页脚（ICP 备案）
└── styles/
    └── main.css                    # 全局重置与基础样式
```

- `stats_server.py` — 独立 Python 后端，提供 `/api/stats` 系统指标端点（CPU、内存、磁盘、Docker 等）
- `mainpage.nginx.*.conf` — 开发/生产/直连三种 Nginx 配置

## 开发

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器（localhost:5173）
npm run build    # 生产构建 → dist/
npm run preview  # 预览生产构建
```

开发服务器将 `/api/*` 代理至 `http://127.0.0.1:9999`（去除 `/api` 前缀）。
