# r3f/ — R3F Canvas 基础设施

## 职责

R3F Canvas 配置、渲染循环桥接、全局场景管理。本目录的组件**始终挂载**，不依赖 Act 可见性。

## 文件

| 文件 | 职责 | 生命周期 |
|------|------|----------|
| `Canvas.tsx` | R3F `<Canvas>` 配置：`flat`（NoToneMapping）、`frameloop="demand"`、相机、初始背景/雾 | 始终挂载 |
| `ScrollRig.ts` | 所有滚动阈值常量导出 + `sceneApplyWhiteOut()`（背景色/雾密度） | 纯函数/常量 |
| `ScrollInvalidator.tsx` | ① `subscribe` Zustand → `invalidate()` 桥接渲染循环 ② 每帧调用 `sceneApplyWhiteOut` | 始终挂载 |
| `PlanetClickHandler.tsx` | NDC 投影行星点击检测（替代 R3F raycasting），`stopPropagation` 阻止快进 | 始终挂载 |

## 维护要点

- **`flat` prop 不可移除**——否则色调映射差异导致色偏
- **`frameloop="demand"` 不可改为 `always`**——依赖 `ScrollInvalidator` 驱动渲染
- **新增全局对象**（如灯光、粒子系统）应挂载在此层级，避免受 Act `visible` 影响
- **修改阈值**统一在 `src/types/index.ts` 的 `SCROLL_RIG` 中，`ScrollRig.ts` 负责导出

## 依赖方向

```
r3f/ → stores/, actors/, behaviors/, types/
r3f/ 不依赖 acts/（Canvas 是容器，acts 作为 children 注入）
```
