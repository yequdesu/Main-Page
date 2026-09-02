# types/ �?共享类型与常�?

## 职责

TypeScript 类型定义、滚动阈值常量（`SCROLL_RIG`）、行星链接数据、粒�?波浪数据结构�?

## 文件

| 文件 | 内容 |
|------|------|
| `index.ts` | `SCROLL_RIG`（阈值）、`ParticleData`、`PlanetLink`、`PLANET_LINKS`、`GridLineData`、`OverlayData`、`Act2State` |

## 维护要点

- **修改阈�?*�?`SCROLL_RIG` 中修改，所有引用处自动生效
- **新增粒子字段**追加�?`ParticleData` interface——同步检�?`DustField` �?useMemo 是否填充
- **PLANET_LINKS** 定义行星的标签文本、强调色、跳�?URL——修改这里即可更新行星信�?
- 类型文件**只包含类�?常量**，不含业务逻辑

## 依赖方向

```
types/ �?无外部依赖（纯类型定义）
```

## 相关文档

| 文档 | 用�?|
|------|------|
| [`../../docs/orbital-system.md`](../../docs/orbital-system.md) | `OrbitalRingConfig` 各字段含义和取值建�?|
| [`../actors/README.md`](../actors/README.md) | 使用这些类型�?Actor 组件 |
| [`../stores/README.md`](../stores/README.md) | `OverlayData`、`focusSlice` �?store 类型 |
| [`../../README.md`](../../README.md) | SCROLL_RIG 阈值在项目中的使用位置 |
