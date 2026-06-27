# acts/ �?Act 组件（场景编排层�?

## 职责

按滚动区间组�?Actor 组件，控制可见性。不做几何体创建或逐帧动画——这些由 Actor �?Behavior 负责�?

## 文件

| 文件 | 区间 | 组装内容 | 可见性控�?|
|------|:---:|------|------|
| `Act1OceanVoyage.tsx` | 0�?6% | `OceanWaves` + `Lighthouse` + `LightBeam` + `LighthouseCapture` | `<group visible={visible}>` |
| `Act2GridTransition.tsx` | 40�?5% | `GridLines` | `<group visible={visible}>` |
| `Act3ContentPhase.tsx` | 85�?00% | `OrbitRings` + `CentralStar` + `PlanetLabel` ×3 + `updateCameraFocus` | `<group visible={visible}>` |

## 组织原则

- **始终挂载，不 return null**——使�?`<group visible={visible}>` 隐藏
- **�?Act 存在的对象提升至 Canvas 根层�?*——如 `DustField`（粒�?行星所�?Act 都可见）
- **Act 组件本身不含 useFrame**——动画逻辑�?Actor 内部
- 每个 Act �?`React.memo` 包裹，减少不必要�?reconciler 遍历

## 新增 Act 步骤

1. 创建 `src/acts/ActXNew.tsx`，参�?`Act1OceanVoyage.tsx` 模式
2. �?`src/types/index.ts` �?`SCROLL_RIG` 中添加阈值（如需要）
3. �?`src/App.tsx` 中注册：`<ActXNew visible={needsActX(sp)} />`
4. 更新 `README.md` 和本文件

## 依赖方向

```
acts/ �?actors/, behaviors/, stores/, types/
acts/ 不依�?r3f/（acts 作为 Canvas children 注入�?
```

## 相关文档

| 文档 | 用�?|
|------|------|
| [`../actors/README.md`](../actors/README.md) | �?Actor 组件的职责和属�?|
| [`../../README.md`](../../README.md) | 项目架构和渲染管线概�?|
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §5.1 | 新增 Act 步骤详解 |
