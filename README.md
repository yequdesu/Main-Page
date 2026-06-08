# YeQu Main Page

个人首页 — 基于滚动的 Three.js 3D 场景，包含灯塔、海洋波浪和轨道行星。使用 **Vue 3 + Vite + Three.js + GSAP ScrollTrigger** 构建。

## 快速开始

```bash
npm install
npm run dev        # → http://localhost:5173，热更新
npm run build      # → dist/
npm run preview    # 本地预览生产构建
```

开发服务器将 `/api/*` 代理到 `http://127.0.0.1:9999`（去除 `/api` 前缀）。

## 项目结构

```
src/
├── App.vue                          # 滚动驱动器（GSAP ScrollTrigger → scrollProgress）
├── components/
│   ├── LighthouseScene.vue           # 编排层（~200 行）
│   └── AppFooter.vue
├── three/
│   ├── constants.js                  # 阈值、轨道半径、颜色、工具函数
│   ├── shared/
│   │   ├── stateContext.js           # ctx 单例（所有模块的共享命名空间）
│   │   ├── reusableObjects.js        # 预分配的 Vector3/Color，避免 GC 抖动
│   │   └── animationPipeline.js      # 主动画管线 — 显式调用顺序 + Act 管理器
│   ├── layers/                       # 跨幕共享系统（build → animate → dispose）
│   │   ├── whiteOutManager.js        # 雾效 / 背景色过渡
│   │   ├── oceanWaves.js             # 海浪线（第一幕波动 → 展平 → 第三幕沉降）
│   │   ├── lightBeam.js              # 灯塔模型 + 体积光束 + 灯光
│   │   ├── dustSystem.js             # 135 个粒子（漂浮 → 白化过渡 → 轨道）
│   │   ├── gridLines.js              # 垂直网格线 + 交叉节点（第二幕 → 第三幕）
│   │   └── overlayCanvas.js          # 相机聚焦 + 反色层 + HUD 叠加层
│   └── acts/                         # 各幕独有的 3D 对象（进入时构建，离开时退出）
│       ├── act1OceanVoyage.js        # 极简（元素已移至 layers/）
│       ├── act2GridTransition.js     # 极简（元素已移至 layers/）
│       └── act3ContentPhase.js       # 轨道环、陀螺仪环、恒星、楔形环、行星标签
└── styles/main.css
```

### 模块间如何通信

所有模块从 `stateContext.js` 导入 `ctx`——一个共享的命名空间（Map + Proxy）。`LighthouseScene.vue` 在挂载时将 `scene`、`camera`、`renderer`、Vue refs 和状态注入 `ctx`。每个 layer/act 通过 `ctx` 读写，不直接相互导入。

### 动画管线

主循环按固定顺序调用动画函数——不使用抽象调度层：

1. `sceneApplyWhiteOut(sp)` — 雾效 / 背景
2. `animateWavesAndLighting(t, sp, gridFactor, smoothProgress3)` — 海洋→网格过渡
3. `animateVerticalGrid(sp, smoothProgress3)` — 网格线
4. `animateDust(t, sp)` — 粒子
5. `animateBeam(t, sp)` — 灯塔光束
6. Act 特有的 `animate()` — 轨道环、陀螺仪、恒星、标签
7. `updateOverlayCanvas(sp, t)` — 相机聚焦 + HUD + 反色
8. `renderer.render(scene, camera)`

共享进度变量（`gridFactor`、`smoothProgress3`）在管线中计算一次后注入各层——各层不独立计算，也不互相读取。所有动画状态都是 `scrollProgress` 的纯函数，保证双向滚动的确定性。

## 三幕场景结构

页面 body 被拉伸至 `15 倍视口高度`。一个 `scrollProgress` 值（0–1）驱动所有动画：

| 幕 | 范围 | 描述 |
|-----|-------|--------------|
| 1 — OceanVoyage | 0.00–0.45 | 暗色海洋、动态波浪线、灯塔旋转光束、135 个漂浮粒子 |
| 2 — GridTransition | 0.40–0.85 | 背景过渡至白色、雾效消散、海浪展平为水平网格线、垂直网格线升起、品牌文字出现 |
| 3 — ContentPhase | 0.85–1.00 | 网格下沉、恒星出现、3 条圆形轨道 + 1 条椭圆轨道出现、4 颗行星带可点击标签（FS、Code、GitHub、Menu）、陀螺仪装饰环旋转、点击行星触发相机聚焦 |

关键阈值（在 `src/three/constants.js` 中定义）：

| 常量 | 值 | 含义 |
|----------|-------|---------|
| `WHITE_OUT_THRESHOLD` | 0.40 | 背景/雾效开始变白 |
| `WHITE_OUT_END` | 0.55 | 白化完成，雾效开始消散 |
| `GRID_START` | 0.45 | 海浪开始展平为网格 |
| `VERTICAL_START` | 0.58 | 垂直网格线开始延伸 |
| `TEXT_START` | 0.70 | 品牌文字与恒星开始淡入 |
| `GRID_SHIFT_START` | 0.85 | 一切下沉，轨道环与行星出现 |

## 部署

### 生产环境（nginx）

```bash
# 1. 构建
npm run build

# 2. Nginx 配置：mainpage.nginx.prod.conf
#    从 dist/ 提供服务，支持 SPA fallback
#    将 /api/stats 代理到 stats_server.py :9999

sudo cp mainpage.nginx.prod.conf /etc/nginx/sites-available/mainpage
sudo ln -s /etc/nginx/sites-available/mainpage /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### 系统监控服务

```bash
# 系统指标接口：/api/stats → /stats（内部）
python3 stats_server.py &
# 监听 127.0.0.1:9999
```
