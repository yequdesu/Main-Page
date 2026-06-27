import { Color, type IUniform } from 'three'

export const VolumetricBeamShader = {
  uniforms: {
    uColor:     { value: new Color('#ffffff') } satisfies IUniform<Color>,
    uOpacity:   { value: 0.4 } satisfies IUniform<number>,
    uLength:    { value: 30.0 } satisfies IUniform<number>,
    uEdgePower: { value: 2.0 } satisfies IUniform<number>,
    uNoiseAmount: { value: 0.0 } satisfies IUniform<number>,
    uTime: { value: 0.0 } satisfies IUniform<number>,
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
    uniform float uOpacity, uLength, uEdgePower, uNoiseAmount, uTime;

    float beamNoise(vec3 p) {
      float a = sin(p.y * 0.42 + p.x * 1.9 + uTime * 0.28);
      float b = sin(p.y * 0.18 + p.z * 2.6 - uTime * 0.17);
      return (a * 0.5 + b * 0.5) * 0.5 + 0.5;
    }

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      float edgeIntensity = pow(abs(dot(normal, viewDir)), uEdgePower);
      edgeIntensity = 0.12 + edgeIntensity * 1.18;
      float lengthFade = pow(clamp(1.0 - (abs(vPosition.y) / uLength), 0.0, 1.0), 1.5);
      float sourceBloom = 0.74 + smoothstep(1.0, 0.0, abs(vPosition.y) / max(uLength * 0.22, 0.001)) * 0.72;
      float density = mix(1.0, mix(0.72, 1.16, beamNoise(vPosition)), uNoiseAmount);
      gl_FragColor = vec4(uColor, edgeIntensity * lengthFade * sourceBloom * density * uOpacity);
    }
  `,
}
