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
