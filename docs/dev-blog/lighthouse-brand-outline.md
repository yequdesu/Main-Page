# Lighthouse Brand 轮廓描边 & base-line 调试记录

**日期**: 2026-06-24 ~ 2026-06-25
**分支**: `feat/integrated-scene-refactor-$-title`

## 背景

BrandTitle 中 lighthouse 图标在 night theme 下与暗色背景融合，轮廓不清晰。需要添加轮廓描边 + 灯塔基线（base-line）来衔接图标与品牌文字。

## 阶段 1：轮廓辉光（Fresnel → Inverted Hull → 2D 边缘检测）

### 1.1 Fresnel Shader（方案 B+，已废弃）

最初计划使用 Fresnel ShaderMaterial，参考行星 AtmosphereShader。创建了 `EdgeGlowShader.ts`，在 offscreenCapture 中为每个非底座 mesh 创建 ×1.04 缩放副本，赋予 Fresnel + AdditiveBlending。

**废弃原因**：Fresnel 产生的是柔和辉光而非硬边描边，且 `AdditiveBlending` 不处理 alpha 通道，导致 `uColor * alpha` 的 premultiply 逻辑需要额外修补。最终审查中发现了多个渲染 bug（traverse + removeFromParent 竞态、AdditiveBlending 忽略 alpha）。

### 1.2 Inverted Hull（方案 A，已废弃）

使用 `mergeGeometries` 合并所有非底座 mesh 为单一几何体，以 `MeshBasicMaterial` + `BackSide` + `AdditiveBlending` 渲染 ×1.04 缩放的背面。天然产生外轮廓描边，无内部 mesh 边缘。

**废弃原因**：BackSide 仍依赖 3D 深度测试和几何体渲染，本质是"渲染"而非"描边"。用户期望的是纯粹的 2D 边缘绘制。

### 1.3 2D Canvas Edge Detection（最终方案）

在 WebGL 渲染完成后，通过 Canvas 2D 对 PNG 的 alpha 通道做边缘检测：

1. `getImageData` 读取 alpha 通道
2. 检测 alpha>0 且邻接 alpha=0 的像素 → 外轮廓
3. 形态学膨胀（`edgeGlowThickness` 次迭代）
4. 直接写入描边像素（颜色 + 不透明度）

**优势**：纯 2D 后处理，不依赖 3D 光照/几何体/深度测试。`EdgeGlowShader.ts` 变为死代码已删除。

### 1.4 solid 剪影

`silhouetteType: 'solid'` 时，主灯塔所有 MeshStandardMaterial 替换为暗色 `#0b101d` MeshBasicMaterial。保留窗户发光（`MeshBasicMaterial #ffdf6d` + 非 transparent）使剪影具有辨识度。

## 阶段 2：lighthouse-base-line

### 2.1 初始尝试：canvas 内 2D 绘制

在 offscreenCapture 的 WebGL 渲染后，创建 Canvas 2D 叠加梯形 base-line。关键参数：
- 底边对齐 mask 底边（遮罩，`Y=-0.95`, `height=1.6`, 下半径 `1.3×0.7=0.91`）
- 高度 75px，斜率匹配 mask 侧边（`(1.3−0.75)/1.6 ≈ 0.34`）
- 左侧垂直（直角贴合 lighthouse 剪影），右侧保持倾角
- 左端：mask 右边缘 −50px
- 右端：合成 canvas 右边缘（+400px 延伸）

### 2.2 canvas 宽度扩展

base-line 需要延伸到文字区域。原始 `captureW: 512` 不足 → 扩展至 2048 + 400 = 2448px（合成 canvas 宽度）。lighthouse 裁剪至 mask 区域（~467px）贴至左侧，base-line 填充右侧。

### 2.3 畸变问题

曾尝试将 clone `shiftX` 偏移使 lighthouse 贴至 canvas 左侧 → 因 lighthouse 位于相机视锥边缘，产生透视畸变（模型倾斜）。

**解决方案**：两步合成。
1. **Step 1**：lighthouse 居中渲染（X=0，无畸变）
2. **Step 2**：裁剪 mask 区域 → 贴至合成 canvas 左侧 + base-line + 统一 `applyEdgeStroke`

## 阶段 3：BrandTitle 布局

### 3.1 从 flex-row 到 grid 叠加

原始布局为 `flex-row`：icon（1.4em）+ text（margin-left: 0.15em）并排。base-line 需要 icon 更宽 → canvas 扩展后 icon 宽度变为 `2.8em × canvasW/1024`。

为保持原始视觉定位（text 与 icon 的对齐关系不变），改用 `grid` 叠加：
```css
.brand-title-row {
  display: grid;
  grid-template: 1fr / 1fr;
  align-items: end; justify-items: start;
}
/* icon 底层，text 上层叠加 */
```

### 3.2 text 定位计算

text `margin-left` 需精确对齐 mask 右边缘。mask 屏幕宽度固定为 467px（独立于 captureW，因投影仅依赖 FOV + cameraZ），对应 display 为 `467/1024 × 2.8em × icon-font-size`。

关键 bug：`margin-left: 1.28em` 在 body 16px 字体上下文 ≈ 20px，而非 icon 字号 57px。修复为 `calc(467/1024 * 2.8 * var(--icon-fs))`。

## 阶段 4：最终视觉参数

| 参数 | 值 |
|---|---|
| 合成 canvas 宽度 | `captureW + 400px` |
| mask 屏幕宽度 | 467px（计算值，独立于 captureW） |
| base-line 左端 | mask 右边缘 −50px |
| base-line 高度 | 75px |
| base-line 形状 | 直角梯形（左侧垂直，右侧匹配 mask 斜率） |
| silhouetteType | `solid`（纯色剪影 + 窗户黄光） |
| outlineType | `silhouette`（2D 边缘检测描边） |
| edgeGlowIntensity | 0.7（描边不透明度） |
| edgeGlowColor | `#ffffff`（白色描边） |
| edgeGlowThickness | 3（描边粗细） |

## 经验教训

1. **2D > 3D**：轮廓描边问题的最优解在 2D 后处理，而非 3D 着色器技巧
2. **不加宽 canvas 用移镜头**：透视畸变使模型倾斜，合成裁剪是正确解
3. **字体上下文陷阱**：`em` 单位依赖元素自身 `font-size`，跨组件对齐时需显式使用相同基准
4. **逐步验证**：红色底座调试、红/青 mask 宽度标记线等措施，有效验证了底座识别和布局对齐
