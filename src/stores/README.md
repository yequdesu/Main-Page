# stores/ �?Zustand 状态管�?

## 职责

全局渲染状态（滚动进度、行星聚焦、悬停检测、SVG 叠加层数据）。UI 状态（提示可见性、品牌文字）留在 App.tsx �?`useState` 中�?

## 文件

| 文件 | Slice | 用�?|
|------|-------|------|
| `scrollStore.ts` | `scrollSlice` | `scrollProgress` �?唯一真相�?|
| | `focusSlice` | `focusedPlanetIdx`, `hoveredIdx`, `focusStartTime`, `overlayData` |

## 读写模式

| 场景 | 方式 | 说明 |
|------|------|------|
| useFrame 内读�?| `useScrollStore.getState()` | 60fps，不触发 React re-render |
| React 组件内读�?| `useScrollStore(s => s.xxx)` | 触发 re-render（如 overlayData�?|
| 写入 | `useScrollStore.setState({...})` �?store action | 同步更新 |

## 维护要点

- **`scrollProgress` 只能�?App.tsx 的滚动物理系统写�?*——不要在 Actor 中修�?
- **新增渲染状态字段追加到对应 Slice**——不要混�?UI 状�?
- **高频更新的字段（overlayData）用 `getState()` 读取**——避免每�?re-render
- `focusStartTime` 使用 **R3F 时钟�?*（`state.clock.elapsedTime`），�?`performance.now()`

## 依赖方向

```
stores/ �?types/
stores/ 不依�?r3f/, actors/, acts/
```

## 相关文档

| 文档 | 用�?|
|------|------|
| [`../../README.md`](../../README.md) §渲染管线 | Zustand �?invalidate() 触发链路 |
| [`../../docs/MAINTENANCE.md`](../../docs/MAINTENANCE.md) §7.1 | 渲染触发机制详解 |
| [`../types/README.md`](../types/README.md) | SCROLL_RIG �?store 使用的数据类�?|
| [`../behaviors/README.md`](../behaviors/README.md) | useCameraFocus 等行为（读取 store 状态） |
