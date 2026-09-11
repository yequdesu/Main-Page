import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three'
import { STRUCTURE_LAYOUT, type getStructureLayout } from '../../behaviors/structureLayout'

/** 日面背景的艺术化逸散微光；不是霍金辐射的物理模拟。 */
export function createStellarRadiation() {
  const count = 72
  const seeds = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = (i * 0.61803398875) % 1
    seeds[i * 3 + 1] = (i * 0.75487766625) % 1
    seeds[i * 3 + 2] = (i * 0.56984029099) % 1
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(seeds, 3))
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uPixelRatio: { value: 1 },
      uWidth: { value: 1 }, uHeight: { value: 1 }, uSunX: { value: 0 }, uRadius: { value: 1 },
      uDistance: { value: STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ },
      uWarm: { value: new Color('#ffe4ba') }, uCool: { value: new Color('#bdcfee') },
    },
    vertexShader: `
      uniform float uTime, uPixelRatio, uWidth, uHeight, uSunX, uRadius, uDistance;
      varying float vFade, vTint;
      void main() {
        float phase = fract(position.x + uTime / (10.0 + 8.0 * position.z));
        float y = (position.y - 0.5) * uHeight * 1.15;
        y += sin(phase * 3.14159 + position.z * 6.28318) * uHeight * 0.008;
        float qy = y / uDistance;
        float a = uDistance * uDistance - uRadius * uRadius;
        float c = uSunX * uSunX - uRadius * uRadius
          + (uDistance * uDistance + uSunX * uSunX - uRadius * uRadius) * qy * qy;
        float discriminant = uSunX * uSunX * uDistance * uDistance - a * c;
        // 由透视球体的切线求当前高度的日面边缘，随后缓慢向外逸散。
        float limb = (uSunX * uDistance + sqrt(max(0.0, discriminant))) / a;
        float x = limb * uDistance + uWidth * (0.002 + phase * (0.035 + 0.04 * position.z));
        float depth = uRadius * 1.6;
        float projectionScale = (uDistance + depth) / uDistance;
        vec3 p = vec3(x * projectionScale, y * projectionScale, -depth);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.5 + 2.0 * position.z) * uPixelRatio;
        vFade = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.45, 1.0, phase));
        vFade *= step(0.0, discriminant);
        vTint = step(0.82, position.z);
      }`,
    fragmentShader: `
      uniform vec3 uWarm, uCool;
      varying float vFade, vTint;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-r * r * 3.0) * (1.0 - smoothstep(0.65, 1.0, r));
        gl_FragColor = vec4(mix(uWarm, uCool, vTint), glow * vFade * 0.32);
        #include <colorspace_fragment>
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: true,
  })
  const points = new Points(geometry, material)
  points.name = '日面背景逸散微光'
  points.renderOrder = 0
  points.frustumCulled = false // 顶点在 shader 中按布局定位，CPU 种子包围盒不代表实际位置。
  return {
    points,
    layout(layout: ReturnType<typeof getStructureLayout>) {
      material.uniforms.uWidth.value = layout.width
      material.uniforms.uHeight.value = layout.height
      material.uniforms.uSunX.value = layout.sunX
      material.uniforms.uRadius.value = layout.sunRadius
    },
    update(time: number, pixelRatio: number) {
      material.uniforms.uTime.value = time
      material.uniforms.uPixelRatio.value = pixelRatio
    },
    dispose() { geometry.dispose(); material.dispose() },
  }
}
