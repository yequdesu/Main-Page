# Lighthouse 轮廓辉光 — 设计文档

**日期**: 2026-06-24
**分支**: `feat/integrated-scene-refactor-$-title`

## 概述

为 BrandTitle 中灯塔品牌图标添加 Fresnel 轮廓辉光。静态效果，night theme 下凸显灯塔轮廓，排除底座底边。后续可接入动画时序编排（GSAP tween `uIntensity`）。

## 方案：Fresnel 轮廓副本（B+）

离屏渲染时为灯塔非底座 mesh 创建略微放大（×1.04）的副本，赋予 Fresnel ShaderMaterial，`AdditiveBlending` 叠加于灯塔之上。与 `AtmosphereShader`（行星 Fresnel 壳）同模式，独立维护。

## 文件变更

| 操作 | 文件 | 内容 |
|------|------|------|
| 新建 | `src/shaders/EdgeGlowShader.ts` | Fresnel 轮廓辉光 vertex + fragment shader |
| 修改 | `src/actors/LighthouseCaptureTypes.ts` | `CaptureConfig` 新增 `edgeGlowIntensity` / `edgeGlowColor` / `edgeGlowFalloff` + 默认值（intensity=0 关闭） |
| 修改 | `src/actors/LighthouseCaptureTypes.ts` | `offscreenCapture()` 新增轮廓副本遍历和渲染逻辑 |
| 修改 | `src/debug/useLevaCaptureConfig.ts` | Leva 新增"轮廓辉光"折叠组（3 个控件） |
| 修改 | `vite.config.ts` | `SAVABLE_KEYS` 新增 `edgeGlowIntensity` / `edgeGlowColor` / `edgeGlowFalloff` |

不变：`Lighthouse.tsx`、`BrandTitle.tsx`、`App.tsx`、`LighthouseCapture.tsx`。

## Shader：EdgeGlowShader

```glsl
// vertex
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// fragment
varying vec3 vNormal;
varying vec3 vViewDir;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;

void main() {
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float alpha = pow(fresnel, uFalloff) * uIntensity;
  gl_FragColor = vec4(uColor, alpha);
}
```

### Uniforms

| uniform | 类型 | 默认值 | 作用 |
|---------|------|--------|------|
| `uColor` | vec3 | `#94a3b8` | 辉光颜色（Slate-400） |
| `uIntensity` | float | 0.0 | 辉光整体强度，0=关闭。动画时序中 GSAP tween |
| `uFalloff` | float | 3.0 | 衰减曲线幂次。2.0=柔和扩散，4.0=锐利边缘 |

## CaptureConfig 扩展

```ts
export interface CaptureConfig {
  // ... existing fields ...

  edgeGlowIntensity: number  // 辉光强度，0=关闭
  edgeGlowColor: string      // 辉光颜色
  edgeGlowFalloff: number    // 衰减幂次
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  // ... existing defaults ...
  edgeGlowIntensity: 0.0,
  edgeGlowColor: '#94a3b8',
  edgeGlowFalloff: 3.0,
}
```

## offscreenCapture 集成

```ts
// 主灯塔渲染后，追加辉光层
if (config.edgeGlowIntensity > 0) {
  const glowGroup = lighthouseGroup.clone(true)

  glowGroup.traverse((child) => {
    if (!(child instanceof Mesh)) return

    // 排除底座：地基(-0.9) / 遮罩(-0.95) / 岩石底座(-0.1) / 过渡环(0.12)
    if (child.position.y < 0.30) {
      glowGroup.remove(child)
      return
    }

    child.scale.multiplyScalar(1.04)

    child.material = new ShaderMaterial({
      vertexShader: edgeGlowVertex,
      fragmentShader: edgeGlowFragment,
      uniforms: {
        uColor: { value: new Color(config.edgeGlowColor) },
        uIntensity: { value: config.edgeGlowIntensity },
        uFalloff: { value: config.edgeGlowFalloff },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
  })

  tempScene.add(glowGroup)
  // 同一帧一次 render，AdditiveBlending 自动叠加
}
```

底座过滤阈值 `Y < 0.30` 位于过渡环(0.12)和第一条装饰带(Y≈0.6)之间，精确排除底座。

## Leva 控件

```ts
'轮廓辉光': folder(
  {
    edgeGlowIntensity: { value: defaults.edgeGlowIntensity, min: 0, max: 2, step: 0.05, label: '强度' },
    edgeGlowColor: { value: defaults.edgeGlowColor, label: '颜色' },
    edgeGlowFalloff: { value: defaults.edgeGlowFalloff, min: 1, max: 6, step: 0.1, label: '衰减' },
  },
  { collapsed: true },
),
```

## YAML 白名单

`SAVABLE_KEYS` 新增：
```
'edgeGlowIntensity', 'edgeGlowColor', 'edgeGlowFalloff',
```

## 动画时序预留

`uIntensity` uniform 设计为浮点值（非布尔），支持后续 GSAP tween：
- day theme → tween to 0
- night theme → tween to desired value

`LighthouseCapture` 的 `config` prop 或 YAML 配置均可被动画时序系统消费。

## 验证

1. `pnpm debug` → 调整轮廓辉光强度 > 0 → 预览中灯塔边缘发光
2. 检查底座底边无辉光
3. intensity=0 时无辉光层（`if` 跳过）
4. `pnpm dev` → 主应用 brand icon 不变（默认 intensity=0）
5. `pnpm exec tsc --noEmit` + `pnpm test run` 全部通过
