# Lighthouse 轮廓辉光 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LighthouseCapture 离屏截图添加 Fresnel 轮廓辉光层，支持 Leva 调参和 YAML 持久化。

**Architecture:** 新建 EdgeGlowShader，在 offscreenCapture() 中为非底座 mesh 创建 ×1.04 缩放副本并赋予 Fresnel ShaderMaterial（AdditiveBlending）。扩展 CaptureConfig + Leva + YAML 白名单。

**Tech Stack:** Three.js ShaderMaterial + TypeScript + Leva + js-yaml

## Global Constraints

- 仅离屏截图管线变更，不改 Lighthouse.tsx / BrandTitle.tsx / App.tsx
- 底座过滤阈值 `mesh.position.y < 0.30`
- 辉光层副本缩放倍率 `1.04`
- `edgeGlowIntensity` 默认值 0（关闭）
- 项目使用 pnpm，中文注释

---

### Task 1: 新建 EdgeGlowShader

**Files:**
- Create: `src/shaders/EdgeGlowShader.ts`

**Interfaces:**
- Produces: `edgeGlowVertex: string`, `edgeGlowFragment: string` — 命名导出

- [ ] **Step 1: 编写 EdgeGlowShader**

创建 `src/shaders/EdgeGlowShader.ts`：

```typescript
/**
 * EdgeGlowShader — Fresnel 轮廓辉光。
 *
 * 用于 LighthouseCapture 离屏渲染时为灯塔非底座 mesh 添加边缘辉光。
 * 与 AtmosphereShader（行星 Fresnel 壳）同模式，独立维护。
 *
 * vertex shader 传递世界法线和视线方向。
 * fragment shader 计算 fresnel = 1 - |dot(normal, viewDir)|，
 * 通过 pow(fresnel, uFalloff) 控制衰减曲线，uIntensity 控制整体强度。
 *
 * 援引：Fresnel 方程 — Schlick (1994) "An Inexpensive BRDF Model for Physically-based Rendering"
 *       倒置外壳 toon outline — Three.js 社区常见技法
 */

export const edgeGlowVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const edgeGlowFragment = /* glsl */ `
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
`
```

- [ ] **Step 2: 验证编译**

Run: `pnpm exec tsc --noEmit src/shaders/EdgeGlowShader.ts`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/shaders/EdgeGlowShader.ts
git commit -m "feat(shader): add EdgeGlowShader — Fresnel rim light for lighthouse silhouette"
```

---

### Task 2: CaptureConfig 扩展 + offscreenCapture 集成

**Files:**
- Modify: `src/actors/LighthouseCaptureTypes.ts`

**Interfaces:**
- Consumes: `edgeGlowVertex: string`, `edgeGlowFragment: string` from `../shaders/EdgeGlowShader`
- Produces: `CaptureConfig.edgeGlowIntensity: number`, `edgeGlowColor: string`, `edgeGlowFalloff: number`
- Produces: `DEFAULT_CAPTURE_CONFIG` 新增 3 个字段默认值

- [ ] **Step 1: 扩展 CaptureConfig 接口 + 默认值**

在 `LighthouseCaptureTypes.ts` 的 `CaptureConfig` 接口末尾添加：

```typescript
  // ---- 轮廓辉光 ----
  /** 辉光强度，0=关闭。动画时序中 GSAP tween 此值 */
  edgeGlowIntensity: number
  /** 辉光颜色（hex），默认 Slate-400 */
  edgeGlowColor: string
  /** 衰减曲线幂次。2.0=柔和扩散，4.0=锐利边缘 */
  edgeGlowFalloff: number
```

在 `DEFAULT_CAPTURE_CONFIG` 末尾添加：

```typescript
  edgeGlowIntensity: 0.0,
  edgeGlowColor: '#94a3b8',
  edgeGlowFalloff: 3.0,
```

- [ ] **Step 2: 在 offscreenCapture 中添加辉光层逻辑**

在 `offscreenCapture()` 顶部 import：

```typescript
import { ShaderMaterial, Mesh, Color, AdditiveBlending } from 'three'
import { edgeGlowVertex, edgeGlowFragment } from '../shaders/EdgeGlowShader'
```

在 `tempScene.add(clone)` 之后、`offRenderer.render(tempScene, capCam)` 之前插入：

```typescript
    // ---- 轮廓辉光层（Fresnel 倒置外壳副本） ----
    if (config.edgeGlowIntensity > 0) {
      const glowGroup = lighthouseGroup.clone(true)

      glowGroup.traverse((child) => {
        if (!(child instanceof Mesh)) return

        // 排除底座：地基(-0.9) / 遮罩(-0.95) / 岩石底座(-0.1) / 过渡环(0.12)
        if (child.position.y < 0.30) {
          glowGroup.remove(child)
          return
        }

        // 轮廓副本略大于原 mesh
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
    }
```

- [ ] **Step 3: 确保 import 完整**

当前 `LighthouseCaptureTypes.ts` 顶部 import 为：

```typescript
import { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, type Group } from 'three'
```

修改为：

```typescript
import {
  WebGLRenderer, Scene, PerspectiveCamera,
  AmbientLight, DirectionalLight,
  ShaderMaterial, Mesh, Color, AdditiveBlending,
  type Group,
} from 'three'
import { edgeGlowVertex, edgeGlowFragment } from '../shaders/EdgeGlowShader'
```

- [ ] **Step 4: 验证编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: 运行现有测试**

Run: `pnpm test run`
Expected: 全部测试 PASS

- [ ] **Step 6: Commit**

```bash
git add src/actors/LighthouseCaptureTypes.ts
git commit -m "feat(capture): add edge glow layer to offscreenCapture — Fresnel outline for non-base meshes"
```

---

### Task 3: Leva 控件 + YAML 白名单

**Files:**
- Modify: `src/debug/useLevaCaptureConfig.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- 无类型接口产出，纯配置同步

- [ ] **Step 1: Leva 新增"轮廓辉光"折叠组**

在 `useLevaCaptureConfig.ts` 中，位移 folder 之后和最后一个 `)` 之前添加：

```typescript
    轮廓辉光: folder(
      {
        edgeGlowIntensity: { value: defaults.edgeGlowIntensity, min: 0, max: 2, step: 0.05, label: '强度' },
        edgeGlowColor: { value: defaults.edgeGlowColor, label: '颜色' },
        edgeGlowFalloff: { value: defaults.edgeGlowFalloff, min: 1, max: 6, step: 0.1, label: '衰减' },
      },
      { collapsed: true },
    ),
```

注意：需要在 `位移` folder 的 `),` 之后（逗号前）添加。完整结构为：

```typescript
    位移: folder(
      { ... },
      { collapsed: true },
    ),

    轮廓辉光: folder(
      {
        edgeGlowIntensity: { value: defaults.edgeGlowIntensity, min: 0, max: 2, step: 0.05, label: '强度' },
        edgeGlowColor: { value: defaults.edgeGlowColor, label: '颜色' },
        edgeGlowFalloff: { value: defaults.edgeGlowFalloff, min: 1, max: 6, step: 0.1, label: '衰减' },
      },
      { collapsed: true },
    ),
  })
```

- [ ] **Step 2: YAML 白名单新增 3 个字段**

在 `vite.config.ts` 的 `SAVABLE_KEYS` 数组末尾追加：

```typescript
  'edgeGlowIntensity', 'edgeGlowColor', 'edgeGlowFalloff',
```

- [ ] **Step 3: 验证编译**

Run: `pnpm exec tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: 运行所有测试**

Run: `pnpm test run`
Expected: 全部测试 PASS

- [ ] **Step 5: Commit**

```bash
git add src/debug/useLevaCaptureConfig.ts vite.config.ts
git commit -m "feat(debug): add edge glow controls to Leva + YAML savable keys"
```

---

### Task 4: 更新文档 + 验证

**Files:**
- Modify: `src/debug/OPERATION.md`
- Modify: `src/debug/MAINTENANCE.md`

- [ ] **Step 1: 更新操作手册参数表**

在 `src/debug/OPERATION.md` 的参数分组表中增加一行：

```
| **轮廓辉光** | 强度、颜色、衰减 | 灯塔边缘 Fresnel 辉光。强度=0 关闭，intensity>0 叠加于灯塔之上 |
```

- [ ] **Step 2: 更新维护指南文件清单说明**

在 `src/debug/MAINTENANCE.md` 的文件职责矩阵中追加：

```
| **Shader** | `src/shaders/EdgeGlowShader.ts` | 顶点/片元 shader 逻辑 |
```

在"新增可调参数"章节末尾追加说明：

```
如果新参数涉及 YAML 持久化，还需在 `vite.config.ts` 的 `SAVABLE_KEYS` 中追加字段名。
```

- [ ] **Step 3: 验证编译 + 测试**

Run: `pnpm exec tsc --noEmit && pnpm test run`
Expected: 无类型错误 + 全部测试 PASS

- [ ] **Step 4: Commit**

```bash
git add src/debug/OPERATION.md src/debug/MAINTENANCE.md
git commit -m "docs: add edge glow params to debug operation and maintenance guides"
```
