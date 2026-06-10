import { Color, type IUniform } from 'three'

export const VolumetricBeamShader = {
  uniforms: {
    uColor:     { value: new Color('#ffffff') } satisfies IUniform<Color>,
    uOpacity:   { value: 0.4 } satisfies IUniform<number>,
    uLength:    { value: 30.0 } satisfies IUniform<number>,
    uEdgePower: { value: 2.0 } satisfies IUniform<number>,
  },

  vertexShader: /* glsl */ `
    varying vec3 vNormal, vViewPosition, vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      vPosition = position;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,

  fragmentShader: /* glsl */ `
    varying vec3 vNormal, vViewPosition, vPosition;
    uniform vec3 uColor;
    uniform float uOpacity, uLength, uEdgePower;
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float edgeIntensity = pow(abs(dot(normal, viewDir)), uEdgePower);
      edgeIntensity = 0.25 + edgeIntensity * 0.75;
      float lengthFade = pow(clamp(1.0 - (abs(vPosition.y) / uLength), 0.0, 1.0), 1.5);
      gl_FragColor = vec4(uColor, edgeIntensity * lengthFade * uOpacity);
    }
  `,
}
