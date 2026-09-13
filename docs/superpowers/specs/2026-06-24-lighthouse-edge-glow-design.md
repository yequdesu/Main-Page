# Lighthouse Brand 轮廓描边 & base-line — 设计文档

**日期**: 2026-06-25（更新）
**分支**: `feat/integrated-scene-refactor-$-title`
**调试记录**: `docs/dev-blog/lighthouse-brand-outline.md`

## 概述

为 BrandTitle 中灯塔品牌图标添加 2D 边缘描边 + lighthouse-base-line（灯塔基线）。night theme 下凸显灯塔轮廓，base-line 衔接图标与品牌文字。静态效果，后续可接入动画时序编排。

## 方案：两步合成 + 2D 边缘检测

### Step 1：灯塔居中渲染

- lighthouse clone 位于 X=0（居中，无透视畸变）
- solid 剪影：`MeshBasicMaterial #0b101d` 替换所有 `MeshStandardMaterial`
- 保留窗户发光（`MeshBasicMaterial #ffdf6d`，非 transparent）
- 原始材质模式下（`silhouetteType: 'real'`）保留完整光照

### Step 2：合成 + base-line + 边缘描边

1. 裁剪 lighthouse mask 区域（467px 宽）→ 贴至合成 canvas 左侧
2. 绘制 base-line（直角梯形，左侧垂直贴合 mask，右侧匹配 mask 斜率）
3. `applyEdgeStroke()` 对合成 canvas 做 alpha 通道边缘检测 + 描边

## CaptureConfig 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `captureW` | 2048 | 3D 渲染 canvas 宽度 |
| `captureH` | 1024 | canvas 高度 |
| `silhouetteType` | `'real'` | `'real'`\|`'solid'`（主塔渲染模式） |
| `outlineType` | `'none'` | `'none'`\|`'silhouette'`（描边开关） |
| `edgeGlowIntensity` | 0.8 | 描边不透明度 0–1 |
| `edgeGlowColor` | `'#ffffff'` | 描边颜色 |
| `edgeGlowThickness` | 4 | 描边粗细 1–10 |

## base-line 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 高度 | 75px | canvas 像素 |
| 右侧延伸 | +400px | 超出 captureW |
| 左侧 | mask 右边缘 −50px | 贴合 lighthouse |
| 形状 | 直角梯形 | 左侧垂直，右侧斜率 0.34 |
| 填充色 | `#0b101d` | 与 solid 剪影同色 |

## BrandTitle 布局

Grid 叠加，icon 宽 `2.8em × canvasW/1024`，text `margin-left: calc(467/1024 * 2.8 * var(--icon-fs))` 对齐 mask 右边缘。

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/actors/LighthouseCaptureTypes.ts` | `CaptureConfig` + `DEFAULT_CAPTURE_CONFIG` + `offscreenCapture()` + `applyEdgeStroke()` |
| `src/actors/LighthouseCapture.tsx` | 配置合并（YAML define + fetch） |
| `src/actors/BrandTitle.tsx` + `.css` | 品牌标题 DOM 叠加层，grid 布局 |

## 依赖

- 无新增依赖（`EdgeGlowShader.ts` 已删除）
- 所有处理为 Canvas 2D 原生 API
