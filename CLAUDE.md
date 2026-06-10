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
npm run build    # 生产构建（tsc + vite）→ dist/
npm run preview  # 本地预览生产构建
npm run test     # vitest，13 tests / 3 suites
npm run clean    # 清除 dist + .vite 缓存 + tsbuildinfo
npm run mirror   # 监控后台进程（Vite :5173, Stats :9999）
```

开发服务器将 `/api/*` 代理至 `http://127.0.0.1:9999`（去除 `/api` 前缀）。

## R3F 渲染约束（务必保持）

### Canvas 配置

```tsx
// src/r3f/Canvas.tsx — 三个必须保留的 prop
<R3FCanvas flat frameloop="demand" ...>
```

- **`flat`** — 禁用色调映射。调整任何颜色值时，请先确认当前 ACES 映射下的实际渲染效果。调试记录见 `docs/dev-blog/tone-mapping-debug.md`
- **`frameloop="demand"`** — 仅 `invalidate()` 时渲染，`ScrollInvalidator` 负责桥接 Zustand → R3F

### `renderOrder` 不继承

Three.js 中 `Object3D.renderOrder` 仅影响该对象自身，**不传递给子对象**。每个带几何体的对象（`Mesh`、`Line`、`Sprite`、`Points`）必须显式设置自己的 `renderOrder`。不要依赖父 `<group renderOrder={...}>` 来设定子对象的渲染顺序。

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

## 架构要点

- **React 19 + R3F v9 + TypeScript** — 28→34 源文件，完整迁移自 Vue 3 + Vanilla Three.js
- **单页、无路由** — 全视口 `<canvas>`，GSAP ScrollTrigger 驱动，body 高 `15vh`，`scrollProgress`（0–1）贯穿所有动画
- **组件分工** — `App.tsx` 管滚动/物理/品牌文字/聚焦 SVG 叠加层；R3F Canvas 内组件管 Three.js 场景
- **自定义物理滚动** — `App.tsx` 中 `gsap.ticker` 驱动动量 + 摩擦力（`FRICTION=0.955`），点击快进是 2s GSAP tween。聚焦行星时阻止滚动
- **Zustand v5 状态管理** — `scrollSlice` + `focusSlice`，`getState()` 在 useFrame 中消费（60fps，不触发 React re-render）

## 渲染层级

```
Layer 0: 海浪、灯塔、光束（最先渲染）
Layer 1: 恒星光晕球、Halo 精灵、主行星
Layer 2: 恒星核心球、轨道环、陀螺仪环、网格线、碎片（InstancedMesh2）
Layer 9999: 行星标签（depthTest=false，始终可见）
```

## 性能模式（务必保持）

- **预分配对象** — `_` 前缀的 `Vector3`/`Color`/`Quaternion` 跨帧复用，禁止在热路径中 `new`
- **帧缓存** — `useFrameCache` 守卫，同帧同参数跳过整个更新
- **批量可见性** — opacity < 0.001 时 `visible = false`，跳过逐顶点更新
- **预筛选数组** — 避免循环中 `.filter()`

## 粒子系统要点

135 个粒子，最大的 3 个按 `totalSize` 排序成为主行星（独立 `Mesh`，高面数、深度写入、`renderOrder=1`），其余 132 为碎片（`InstancedMesh2`，`renderOrder=2`，逐实例透明度）。Act 3 过渡到轨道运动。遮挡聚焦行星的主行星淡化至 `opacity * 0.12`。非行星粒子用 `_defaultCamPos` 计算缩放以避免相机聚焦影响。

**⚠️ `DustField` 必须挂载在 Canvas 根层级**（不在任何 Act 的 `visible` group 内）。原版粒子直接加在 `scene` 根层级，不受 Act 可见性限制。详见 `docs/dev-blog/scene-graph-visibility.md`。

## 行星聚焦与叠加层

- 点击检测用**屏幕空间 NDC 投影**（`PlanetClickHandler.tsx`，非 Raycaster），迟滞阈值 0.16 进 / 0.22 出
- 相机双层平滑：`_targetCamPos` 对目标 lerp(0.04)，`camera.position` 对 target lerp(0.06)
- 30s 自动取消聚焦（R3F 时钟域，非 `performance.now()`）
- 聚焦时 `App.tsx` 渲染 SVG 叠加层（虚线圆 + 外公切线），屏幕空间半径用相机右向量投影计算

## 行星标签

`PlanetLabel.tsx` — Canvas 生成的 `THREE.Sprite`，512×128，半透明胶囊背景 + Georgia 白色文字，`renderOrder = 9999`。标签跟随行星位置，聚焦时全部淡出（平滑 lerp，每帧仅计算一次 `_labelOpacityCurrent`）。

## 灯塔截图

`LighthouseCapture.tsx` — 独立 `WebGLRenderer` 离屏渲染，FOV=25，灯塔居中于原点，`toDataURL` 直接输出 512×1024 PNG。`App.tsx` 在 `scrollProgress >= 0.54` 时触发。修改灯塔几何体时需同步检查此函数。

## 额外依赖

- `@three.ez/instanced-mesh` — `InstancedMesh2`，用于碎片粒子的逐实例透明度 + 排序。已在 `main.tsx` 中通过 `extend()` 注册。**注意：** `setColorAt` 初始化后必须调用 `materialsNeedsUpdate()` 触发 shader 重编译，否则首次渲染碎片不可见（详见 `docs/dev-blog/instanced-mesh-shader-compile.md`）。
