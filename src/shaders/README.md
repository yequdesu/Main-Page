# shaders/ — 自定义着色器

## 职责

GLSL 着色器代码，以 TypeScript 模块导出，供 Actor 中的 `ShaderMaterial` 使用。

## 文件

| 文件 | 用途 | 使用者 |
|------|------|--------|
| `VolumetricBeamShader.ts` | 灯塔光束的体积锥体着色器（边缘发光 + 长度衰减） | `LightBeam.tsx` |

## 着色器说明

### VolumetricBeamShader

```glsl
// 边缘强度：视线与法线夹角越大越亮（锥体边缘发光）
edgeIntensity = pow(abs(dot(normal, viewDir)), uEdgePower);

// 长度衰减：沿锥体长度方向逐渐透明
lengthFade = pow(clamp(1.0 - abs(vPosition.y) / uLength, 0.0, 1.0), 1.5);

// 最终颜色：uColor * (edgeIntensity * lengthFade * uOpacity)
```

Uniforms：

| uniform | 类型 | 默认值 | 说明 |
|---------|------|:---:|------|
| `uColor` | `vec3` | `#ffffff` | 光束颜色 |
| `uOpacity` | `float` | 0.4 | 基础透明度 |
| `uLength` | `float` | 30.0 | 锥体长度 |
| `uEdgePower` | `float` | 2.0 | 边缘发光强度 |

运行时 `LightBeam.tsx` 的 `beamUniforms` useMemo 会覆盖默认值（`uColor: #f0f7ff`，逐锥体 opacity）。

## 新增 Shader 步骤

1. 创建 `src/shaders/NewShader.ts`
2. 导出 `vertexShader` 和 `fragmentShader` 字符串
3. 在 Actor 的 `<shaderMaterial>` 中引用

## 依赖方向

```
shaders/ → three (类型)
shaders/ 不依赖项目中的其他模块
```
