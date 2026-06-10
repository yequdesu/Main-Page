# 色调映射调试记录

> 日期：2026-06-11  
> 标签：debug, R3F, tone-mapping, ACES, color, rendering

## 现象

迁移至 R3F 后，恒星、行星、光晕等所有视觉元素的颜色与原版（Vanilla Three.js）存在肉眼可见的偏差。即使几何体参数、材质颜色、位置完全一致，渲染结果仍不同。

## 排查过程

1. **排除雾** — 临时禁用 `FogExp2` 和 `sceneApplyWhiteOut`，问题依旧 → 非雾导致
2. **排除图层** — 调整 `renderOrder`（1→2→3），反转渲染顺序，视觉效果无变化 → 非图层问题
3. **仅渲染恒星核心球** — 隐藏光晕和 Halo，仅保留 `MeshBasicMaterial({ color: '#fff8e7' })`，仍与原版不同 → 问题在渲染管线本身
4. **定位 R3F 默认值** — 检索 R3F 源码 `events-*.js:7620`：

```js
gl.toneMapping = flat ? NoToneMapping : ACESFilmicToneMapping;
```

R3F 默认 `flat: false`，所有颜色经过 `ACESFilmicToneMapping` 处理。

原版 Vanilla Three.js `WebGLRenderer` 默认 `toneMapping = NoToneMapping`。

## 根因

| | 原版 | R3F（默认） |
|---|---|---|
| `toneMapping` | `NoToneMapping` | `ACESFilmicToneMapping` |
| 色彩管线 | 线性直出 | ACES 曲线映射 |

`#fff8e7` 经 ACES 后色值偏移，所有 `MeshBasicMaterial`、`MeshStandardMaterial`、`ShaderMaterial` 均受影响。

## 修复

`src/r3f/Canvas.tsx` 添加 `flat` prop：

```tsx
<R3FCanvas flat ...>
```

设置 `flat` 后 R3F 使用 `NoToneMapping`，与原版行为一致。

## 教训

- R3F 的默认值与 Vanilla Three.js 不完全相同。`flat`、`dpr`、`frameloop` 等 prop 可能引入意料之外的行为
- 颜色偏差排查应优先检查渲染管线设置（toneMapping、outputColorSpace），而非材质参数
- 排查渲染问题时的有效策略：逐层剥离（隐藏光晕→仅核心球→对比参数），定位到渲染管线层面而非材质层面
