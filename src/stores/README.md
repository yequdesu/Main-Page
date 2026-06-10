# stores/ — Zustand 状态管理

## 职责

全局渲染状态（滚动进度、行星聚焦、悬停检测、SVG 叠加层数据）。UI 状态（提示可见性、品牌文字）留在 App.tsx 的 `useState` 中。

## 文件

| 文件 | Slice | 用途 |
|------|-------|------|
| `scrollStore.ts` | `scrollSlice` | `scrollProgress` — 唯一真相源 |
| | `focusSlice` | `focusedPlanetIdx`, `hoveredIdx`, `focusStartTime`, `overlayData` |

## 读写模式

| 场景 | 方式 | 说明 |
|------|------|------|
| useFrame 内读取 | `useScrollStore.getState()` | 60fps，不触发 React re-render |
| React 组件内读取 | `useScrollStore(s => s.xxx)` | 触发 re-render（如 overlayData） |
| 写入 | `useScrollStore.setState({...})` 或 store action | 同步更新 |

## 维护要点

- **`scrollProgress` 只能由 App.tsx 的滚动物理系统写入**——不要在 Actor 中修改
- **新增渲染状态字段追加到对应 Slice**——不要混入 UI 状态
- **高频更新的字段（overlayData）用 `getState()` 读取**——避免每帧 re-render
- `focusStartTime` 使用 **R3F 时钟域**（`state.clock.elapsedTime`），非 `performance.now()`

## 依赖方向

```
stores/ → types/
stores/ 不依赖 r3f/, actors/, acts/
```
