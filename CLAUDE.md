# CLAUDE.md

本文件为 Claude Code 在此仓库中工作时提供指导。项目介绍、交互说明、技术栈等面向人类的文档见 `README.md`。

## 维护约束

- **方案修正或项目结构变更时，必须同步更新 `README.md`**——保持文档与实际架构一致
- **每个 R3F 方案决策必须援引社区成熟方案并说明来源**——方便后续评估、维护与持续学习
- 完整设计方案见 `docs/superpowers/specs/2026-06-10-r3f-refactor-design.md`，技术评估见 `docs/TECH_STACK_EVALUATION.md`

## 语言协定

无论用户使用中文还是英文提问，默认使用中文回复。新增或修改面向维护者的文档时，也应优先使用中文；代码标识符、命令、报错文本和第三方 API 名称保持原文。

## 命令

```bash
npm run dev      # Vite 开发服务器，:5173，绑定 0.0.0.0
npm run build    # 生产构建 → dist/
npm run preview  # 本地预览生产构建
```

开发服务器将 `/api/*` 代理至 `http://127.0.0.1:9999`（去除 `/api` 前缀）。项目无测试/检查工具。

## 架构要点

- **单页、无路由** — 全视口 `<canvas>`，GSAP ScrollTrigger 驱动，body 高 `15vh`，`scrollProgress`（0–1）贯穿所有动画
- **组件分工** — `App.vue` 管滚动/物理/品牌文字/聚焦 SVG 叠加层；`LighthouseScene.vue` 管整个 Three.js 场景、动画循环、act 调度
- **自定义物理滚动** — `App.vue` 中 `gsap.ticker` 驱动动量 + 摩擦力（`FRICTION=0.955`），点击快进是 2s GSAP tween。聚焦行星时阻止滚动

## Three.js 场景关键常量

```
SCENE_CENTER_Z       = -16.0   # 灯塔、轨道、恒星、行星的统一 Z 深度
WHITE_OUT_THRESHOLD  = 0.40    # 背景/雾开始白化
WHITE_OUT_END        = 0.55    # 白化完成
GRID_START           = 0.45    # 海浪展平为网格
VERTICAL_START       = 0.58    # 垂直网格线开始延伸
TEXT_START           = 0.70    # 品牌文字出现
GRID_SHIFT_START     = 0.85    # Act 3 轨道出现，全部元素下移 32Y
```

轨道中心位于 `(0, -1.0, SCENE_CENTER_Z)`。三颗主行星轨道半径 `[3.6, 5.0, 6.4]`。

## Act 生命周期

每个 act 有 `build()`、`animate()`、`exit()`、`dispose()` 四个钩子。Act 首次进入区间时延迟构建（`builtActs` Set 跟踪）。动画循环通过比较前后帧活跃 act 名检测切换，离开时调用 `exit()`（隐藏而非移除）。修改 act 逻辑时务必保持此模式。

## 性能模式（务必保持）

- **预分配对象** — `_` 前缀的 `Vector3`/`Color`/`Quaternion` 跨帧复用，禁止在热路径中 `new`
- **帧缓存** — `_lastWavesTime` / `_lastBeamTime` / `_lastDustSp` 等守卫，同帧同参数跳过整个更新
- **批量可见性** — opacity < 0.001 时 `visible = false`，跳过逐顶点更新
- **CSS 变量节流** — `updateTextOffsetCSS` 用舍入到千分位的键值
- **预筛选数组** — `_mainPlanetsPreFiltered` 避免循环中 `.filter()`

## 粒子系统要点

135 个粒子，最大的 3 个按 `totalSize` 排序成为主行星（高面数、深度写入、`renderOrder=1`），其余为小碎片（`renderOrder=2`）。Act 3 过渡到轨道运动。遮挡聚焦行星的粒子淡化至 `opacity * 0.12`。非行星粒子用 `_defaultCamPos` 计算缩放以避免相机聚焦影响。

## 行星聚焦与叠加层

- 点击检测用**屏幕空间 NDC 投影**（非 Raycaster），迟滞阈值 0.16 进 / 0.22 出
- 相机双层平滑：`_targetCamPos` 对目标 lerp(0.04)，`camera.position` 对 target lerp(0.06)
- 30s 自动取消聚焦，点击重置计时器，聚焦时相机沿恒星→行星轴绕行
- 聚焦时 `App.vue` 渲染 SVG 叠加层（虚线圆 + 外公切线），屏幕空间半径用相机右向量投影计算

## 行星标签

Canvas 生成的 `THREE.Sprite`，512×128，半透明胶囊背景 + Georgia 白色文字，`renderOrder = 9999`。标签跟随行星位置，聚焦时淡出。

## 灯塔截图

`LighthouseScene.vue` 通过 `defineExpose` 暴露 `captureLighthouse()`，`App.vue` 在 `scrollProgress >= 0.54` 时调用。离屏渲染克隆灯塔为 512×1024 PNG，用作品牌文字旁图标。修改灯塔几何体时需同步检查此函数。
