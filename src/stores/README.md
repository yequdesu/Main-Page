# stores/ — Zustand 状态管理

## 职责

全局渲染状态（滚动进度、行星聚焦、悬停检测）。UI 状态（提示可见性、品牌文字）留在 App.tsx 的 `useState` 中。

## 文件

| 文件 | Slice | 用途 |
|------|-------|------|
| `scrollStore.ts` | `scrollSlice` | `scrollProgress` — 唯一真相源 |
| | `focusSlice` | `focusedPlanetIdx`, `focusedVoyager`, `hoveredIdx`, `focusStartTime`, `focusEvent` |

## 读写模式

| 场景 | 方式 | 说明 |
|------|------|------|
| useFrame 内读取 | `useScrollStore.getState()` | 60fps，不触发 React re-render |
| React 组件内读取 | `useScrollStore(s => s.xxx)` | 触发 re-render（如 focusedPlanetIdx） |
| 写入 | `useScrollStore.setState({...})` 或 store action | 同步更新 |

## 维护要点

- **`scrollProgress` 只能由 App.tsx 的滚动物理系统写入**——不要在 Actor 中修改
- **新增渲染状态字段追加到对应 Slice**——不要混入 UI 状态
- 在 `useFrame` 中通过 `getState()` 读取所需字段，避免每帧数据触发不必要的 React 订阅
- `focusStartTime` 使用 **R3F 时钟域**（`state.clock.elapsedTime`），非 `performance.now()`；`null` 表示尚未开始计时，`0` 是有效时间。`setFocusedPlanet()` 重置该字段，由场景控制器在下一帧赋值，`clearFocus()` 清空计时与聚焦状态

聚焦业务入口必须使用 `setFocusedPlanet()` / `focusVoyager()` / `clearFocus()`，让状态和事件一起更新；直接写 `focusedPlanetIdx` 不会发出动画事件。`focusEvent` 为类型化的 `focus` / `voyager` / `exit` 事件，退出原因包括 `manual`、`timeout`、`scene`。同一帧多个请求以最后一个为准。每帧动画进度由 Canvas 内的 Context 保存，不进入此 store；`focusStartTime` 仅作场景起点记录，超时由 GSAP 时间轴控制。

## 依赖方向

```
stores/ → types/
stores/ 不依赖 r3f/, actors/, acts/
```

## 相关文档

| 文档 | 用途 |
|------|------|
| [`../../README.md`](../../README.md) §渲染管线 | Zustand → invalidate() 触发链路 |
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §7.1 | 渲染触发机制详解 |
| [`../types/README.md`](../types/README.md) | SCROLL_RIG 和 store 使用的数据类型 |
| [`../behaviors/README.md`](../behaviors/README.md) | useCameraFocus 等行为（读取 store 状态） |
