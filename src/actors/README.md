# actors/ — 3D 对象组件（可渲染层）

## 职责

每个文件封装一个 Three.js 对象（Mesh、Line、Sprite、Points、InstancedMesh2）的**创建**和**逐帧动画**。组件返回 R3F JSX，内部使用 `useFrame` 驱动动画。

## 文件

| 文件 | 对象类型 | 生命周期 | renderOrder | 动画 |
|------|----------|----------|:---:|------|
| `Lighthouse.tsx` | 30 Mesh（`MeshStandardMaterial`） | Act1 group 内 | 0 | 无（静态） |
| `LightBeam.tsx` | 3 Cone + 2 Line + 1 Glow + PointLight | Act1 group 内 | 0 | 3 模式 + 每帧发布光束世界变换（供 OceanWaves 体积光照） |
| `SceneLights.tsx` | AmbientLight + 2 DirectionalLight | Canvas 根层级 | — | 无（全局静态灯光） |
| `OceanWaves.tsx` | 30 Line（逐顶点动画） | Act1 group 内 | 0 | 波浪 Y 偏移 + 体积聚光照明（读 `_beamWorldOrigin/Direction`） |
| `DustField.tsx` | 3 Mesh（主行星） + InstancedMesh2 ×80（碎片） | **Canvas 根层级** | 1/2 | 位置/颜色/透明度逐帧更新 |
| `CentralStar.tsx` | 2 Mesh（核心+光晕） + Sprite（Halo） | Act3 group 内 | 1/2/1 | 光晕脉冲 + 透明度 |
| `OrbitRings.tsx` | 3 Line（轨道参考线）+ 编排 `GYRO_RINGS` → `<OrbitalRing>` | Act3 group 内 | 2 | 透明度（参考线）+ 配置映射 |
| `OrbitalRing.tsx` | 1 LineLoop（陀螺仪环），可独立复用 | Act3 group 内（由 `OrbitRings` 编排） | 2 | 进动（Y 旋转）+ 透明度（scroll 驱动） |

> **轨道系统完整文档：** [`docs/orbital-system.md`](../../docs/orbital-system.md) — 力学模型、变换推导、配置参考、操作手册

| `GridLines.tsx` | 28 Line + 210 Points | Act2 group 内 | 2 | 延伸 + 透明度 |
| `PlanetLabel.tsx` | 3 Sprite（Canvas 纹理） | Act3 group 内 | 9999 | 位置跟随 + lerp 淡入淡出 |
| `LighthouseCapture.tsx` | 无渲染（离屏截图逻辑） | Act1 group 内 | — | 导出 `getLighthouseCapture()` |

## 编写规范

- **预分配对象**：`Vector3`/`Color`/`Matrix4` 用 `useRef().current` 跨帧复用
- **帧缓存**：使用 `useFrameCache` 守卫，同一帧不重复处理
- **材质不复用**：每个 Actor 管理自己的材质生命周期
- **renderOrder 显式设置**：不依赖父 Group 继承

## 新增 Actor 步骤

1. 创建 `src/actors/NewObject.tsx`
2. 参考同类型组件（静态参考 Lighthouse，动画参考 OceanWaves，粒子参考 DustField）
3. 在对应 Act 中导入并挂载（或 Canvas 根层级）
4. 如需纯计算逻辑，抽取至 `behaviors/`

## 依赖方向

```
actors/ → behaviors/, stores/, shaders/, types/, r3f/
actors/ 不依赖 acts/
```

**已知跨 Actor 依赖：** `OceanWaves` → `LightBeam`（通过模块级共享变量 `_beamWorldOrigin` / `_beamWorldDirection` 读取光束世界变换）。这是为避开 React props 60fps 重渲染的刻意设计，详见 `docs/MAINTENANCE.md` §8.1。

## 相关文档

| 文档 | 用途 |
|------|------|
| [`../../docs/orbital-system.md`](../../docs/orbital-system.md) | 轨道系统完整文档（OrbitalRing / OrbitRings） |
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §7 | 渲染层级和 depthWrite/depthTest 规则 |
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §8.1 | 体积聚光照明数据流（OceanWaves ↔ LightBeam） |
| [`../behaviors/README.md`](../behaviors/README.md) | 可复用行为逻辑（useFrame 中调用的纯函数） |
| [`../../docs/dev-blog/`](../../docs/dev-blog/) | 4 篇调试记录（涉及 DustField, InstancedMesh2） |
