# CLAUDE.md

Claude Code 工作约束。人类文档见 `README.md`，调试记录见 `docs/dev-blog/`。

## 语言协定

默认使用中文回复。代码标识符、命令、报错文本和第三方 API 名称保持原文。

## 命令

```bash
npm run dev / build / preview / test / clean / mirror
```
`/api/*` 代理至 `127.0.0.1:9999`。

## 必须遵守的渲染约束

### Canvas 配置

```tsx
// src/r3f/Canvas.tsx — 三个 prop 不可移除
<R3FCanvas flat frameloop="demand" ...>
```

- **`flat`** — 禁用色调映射。调整色值时先确认实际渲染效果（`docs/dev-blog/tone-mapping-debug.md`）
- **`frameloop="demand"`** — 仅 `invalidate()` 时渲染，`ScrollInvalidator` 桥接 Zustand → R3F

### renderOrder 不继承

`Object3D.renderOrder` 不传递给子对象。每个 Mesh / Line / Sprite / Points 必须显式设置。

### DustField 必须在 Canvas 根层级

`DustField` 挂载于 `Canvas.tsx`，**不能**放在任何 Act 的 `<group visible>` 内。`docs/dev-blog/scene-graph-visibility.md`

### InstancedMesh2 初始化

`setColorAt` 循环后必须调用 `materialsNeedsUpdate()`，否则首次渲染碎片不可见。`docs/dev-blog/instanced-mesh-shader-compile.md`

### 性能约束

- **预分配对象** — `_` 前缀 `Vector3` / `Color` / `Quaternion` 跨帧复用，禁止热路径 `new`
- **帧缓存** — `useFrameCache` 守卫，同帧同参数跳过
- **`getState()` 读 Zustand** — useFrame 中使用，不触发 React re-render

## 维护约束

- 方案修正或项目结构变更时，必须同步更新 `README.md`
- 每个 R3F 方案决策必须援引社区方案并说明来源
- 设计文档：`docs/superpowers/specs/2026-06-10-r3f-refactor-design.md`
- 技术评估：`docs/TECH_STACK_EVALUATION.md`
