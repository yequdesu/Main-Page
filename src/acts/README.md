# acts/ — Act 组件（场景编排层）

## 职责

按滚动区间组装 Actor 组件，控制可见性。不做几何体创建或逐帧动画——这些由 Actor 和 Behavior 负责。

## 文件

| 文件 | 区间 | 组装内容 | 可见性控制 |
|------|:---:|------|------|
| `Act1OceanVoyage.tsx` | 0–46% | `OceanWaves` + `Lighthouse` + `LightBeam` + `LighthouseCapture` | `<group visible={visible}>` |
| `Act2GridTransition.tsx` | 40–85% | `GridLines` | `<group visible={visible}>` |
| `Act3ContentPhase.tsx` | 85–100% | `OrbitRings` + `CentralStar` + `PlanetLabel` ×3 + `updateCameraFocus` | `<group visible={visible}>` |

## 组织原则

- **始终挂载，不 return null**——使用 `<group visible={visible}>` 隐藏
- **跨 Act 存在的对象提升至 Canvas 根层级**——如 `DustField`（粒子/行星所有 Act 都可见）
- **Act 组件本身不含 useFrame**——动画逻辑在 Actor 内部
- 每个 Act 用 `React.memo` 包裹，减少不必要的 reconciler 遍历

## 新增 Act 步骤

1. 创建 `src/acts/ActXNew.tsx`，参考 `Act1OceanVoyage.tsx` 模式
2. 在 `src/types/index.ts` 的 `SCROLL_RIG` 中添加阈值（如需要）
3. 在 `src/App.tsx` 中注册：`<ActXNew visible={needsActX(sp)} />`
4. 更新 `README.md` 和本文件

## 依赖方向

```
acts/ → actors/, behaviors/, stores/, types/
acts/ 不依赖 r3f/（acts 作为 Canvas children 注入）
```
