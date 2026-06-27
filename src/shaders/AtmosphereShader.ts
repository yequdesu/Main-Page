// ============================================================
// Planet Atmosphere �?Fresnel 薄壳着色器
//
// BackSide 渲染 �?摄像机看到球壳内�?�?dot(normal, viewDir)
// 在边缘处最�?�?Fresnel 边缘亮、中心透明�?
//
// 援引�?
//   Three.js Forum �?"How to create an atmospheric glow effect"
//     discourse.threejs.org/t/32852 (backSide approach)
//   Dev.to �?"Build an award-winning 3D Website"
//     dev.to/robinzon100 (atmosphere shader with fresnel)
// ============================================================

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosition = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform float uOpacity;
  uniform vec3 uColor;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosition);
    vec3 normal = normalize(vNormal);

    // Fresnel: edge = 0 (bright), center = 1 (transparent)
    float NdotV = abs(dot(normal, viewDir));
    float fresnel = 1.0 - NdotV;
    fresnel = pow(fresnel, 2.0);  // �?.0 = tighter, �?.0 = wider glow

    gl_FragColor = vec4(uColor, fresnel * uOpacity);
  }
`
