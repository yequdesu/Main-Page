# Planet Atmosphere — 设计规格

> 日期：2026-06-19 | 状态：approved

## 目标

为 Planets.tsx 中的 3 颗主行星添加薄大气层效果，每个行星两个渲染层：
1. Fresnel 大气薄壳（视角深度感）
2. 脉冲 Sprite 光晕（柔光扩散）

## 架构

```
Planets.tsx
  ├── 行星 Mesh (existing, renderOrder=1, depthWrite=true)
  ├── Fresnel 薄壳 Mesh ←new (BackSide, renderOrder=1, depthWrite=false)
  └── Sprite 光晕 ←new (AdditiveBlending, renderOrder=1)
```

## 文件变更

### 1. 新建 `src/shaders/AtmosphereShader.ts`

纯 GLSL 字符串导出，无框架依赖：

- **vertex**: 标准 `projectionMatrix * modelViewMatrix * position`，传递 `vNormal` 和 `vPosition`（world space）
- **fragment**: `dot(normalize(vNormal), normalize(cameraPosition - vPosition))` → 边缘=0, 中心=1 → `1.0 - NdotV` → Fresnel 边缘亮。输出 gray-white + alpha

```glsl
float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(cameraPosition - vPosition)));
fresnel = pow(fresnel, 3.0);  // 收紧辉光宽度
gl_FragColor = vec4(vec3(0.78, 0.82, 0.88), fresnel * uOpacity);
```

### 2. 修改 `src/actors/Planets.tsx`

**useMemo 扩建：**

为每个行星创建两个附属对象（与 Mesh 同时创建）：

```ts
// Fresnel 壳
const atmosGeo = new SphereGeometry(0.015 * 1.30, 32, 32)  // 30% larger
const atmosMat = new ShaderMaterial({
  vertexShader: atmosVert,
  fragmentShader: atmosFrag,
  uniforms: { uOpacity: { value: 0 } },
  transparent: true, depthWrite: false, side: BackSide,
})
const atmosShell = new Mesh(atmosGeo, atmosMat)
atmosShell.renderOrder = 1

// Sprite
const spriteMat = new SpriteMaterial({
  map: haloTexture, blending: AdditiveBlending,
  transparent: true, opacity: 0, depthWrite: false, depthTest: true,
})
const haloSprite = new Sprite(spriteMat)
haloSprite.renderOrder = 9999
```

`haloTexture` 为模块级 `useMemo`（所有行星共享同一纹理），灰白色系径向渐变。

**useFrame 扩建：**

在行星动画循环中追加：

```ts
// Atmosphere shell opacity (跟随行星 appearance + scroll clamp)
atmosMat.uniforms.uOpacity.value = appearance.opacity * 0.35

// Halo sprite position + scale + opacity + pulse
haloSprite.position.copy(mesh.position)
const haloScale = d.scale * d.scaleMult * 4.0 * pulse  // pulse 基于 time
haloSprite.scale.set(haloScale, haloScale, 1)
spriteMat.opacity = appearance.opacity * 0.18 * pulse
```

脉冲公式：`pulse = 1 + Math.sin(time * freq + phase) * amp`

每个行星独立 phase 和 freq（通过 particleData 的 `ph` 字段或索引偏移）。

**JSX 扩建：**

在 `mainPlanets.map` 中每个行星输出三个 primitive：

```tsx
<primitive object={mesh} />
<primitive object={atmosShell} />
<primitive object={haloSprite} />
```

## 渲染管线

| Layer | renderOrder | depthWrite | blending |
|-------|:---:|:---:|---|
| 行星核心 | 1 | true | Opaque |
| Fresnel 薄壳 | 1 | false | Transparent |
| Sprite 光晕 | 9999 | false | Additive |

Fresnel 壳与行星同 renderOrder（Three.js 自动按距离排序透明对象），Sprite 沿用 PlanetLabel 的 9999 层级（始终在前）。

## 性能约束

- `haloTexture` 模块级共享，仅创建一次
- Fresnel 壳的 `SphereGeometry` 每个行星独立（3 个），低面数（32×32）
- ShaderMaterial uniforms 复用，无 per-frame allocation
- pulse 计算使用 `Math.sin` 无 GC 分配

## 验证

```bash
pnpm build && pnpm test
pnpm dev → Act 3 观察行星大气 + 滚动验证 opacity 过渡
```
