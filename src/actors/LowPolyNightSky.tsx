import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Vector2, Vector3 } from 'three'
import { getWebglLayer } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'

import { NIGHT_SKY, useNightSkyStore, type NightSkyConfig } from '../stores/nightSkyStore'

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx
  const b = hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx
  return a * (1 - sy) + b * sy
}

function buildSky(config: NightSkyConfig): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, config.cellDensity)
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const palette = config.palette.map(value => new Color(value))
  const point = new Vector3(), center = new Vector3(), shade = new Color()
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i)
    const { x, y, z } = point
    // Shared positions receive the same warp, keeping the closed sphere seamless.
    point.set(x + Math.sin(y * 17 + z * 11) * 0.009,
      y + Math.sin(z * 19 + x * 13) * 0.009,
      z + Math.sin(x * 16 + y * 12) * 0.009).normalize()
    positions.setXYZ(i, point.x, point.y, point.z)
  }
  for (let i = 0; i < positions.count; i += 3) {
    center.set(0, 0, 0)
    for (let j = 0; j < 3; j++) center.add(point.fromBufferAttribute(positions, i + j))
    center.normalize()
    const { x, y, z } = center
    const broad = (noise(x * 4 + z * 2 + 4.7, y * 4 + z * 3 + 8.3, config.seed)
      + noise(z * 4 - x * 2, y * 5 - x * 3, config.seed)) * 0.5
    const tone = Math.max(0, Math.min(1,
      0.2 + broad * 0.6 + (hash(i, 31, config.seed) - 0.5) * 0.12 * config.contrast))
    shade.copy(palette[tone < 0.5 ? 0 : 1])
      .lerp(palette[tone < 0.5 ? 1 : 2], tone < 0.5 ? tone * 2 : tone * 2 - 1)
    for (let j = 0; j < 3; j++) shade.toArray(colors, (i + j) * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

export default function LowPolyNightSky() {
  const config = useNightSkyStore(s => s.config)
  const geometry = useMemo(() => buildSky(config),
    [config.seed, config.cellDensity, config.contrast, config.palette])
  const uniforms = useMemo(() => ({
    uRotationAngle: { value: 0 },
    uPhase: { value: 0 },
    uAxis: { value: new Vector3() },
    uDarkest: { value: new Color(NIGHT_SKY.darkestColor) },
    uAxes: { value: new Vector2(NIGHT_SKY.axisX, NIGHT_SKY.axisY) },
    uBrightness: { value: new Vector2(NIGHT_SKY.centerBrightness, NIGHT_SKY.outerBrightness) },
    uDeformation: { value: NIGHT_SKY.deformationAmplitude },
  }), [])
  // Reuse the scene frame loop, with no dependency on scroll progress.
  useFrame((_, delta) => {
    uniforms.uRotationAngle.value += delta * config.rotationRadians
    uniforms.uPhase.value += delta * config.deformationSpeed
    uniforms.uDarkest.value.set(config.darkestColor)
    uniforms.uAxes.value.set(config.axisX, config.axisY)
    uniforms.uBrightness.value.set(config.centerBrightness, config.outerBrightness)
    uniforms.uDeformation.value = config.deformationAmplitude
    uniforms.uAxis.value.set(config.tiltX, 1, config.tiltZ).normalize()
  })
  const layer = getWebglLayer('webgl.nightSky')
  useActorRuntime('lowPolyNightSky', true)
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name="lowPolyNightSky" geometry={geometry} frustumCulled={false}
      renderOrder={layer.renderOrder} raycast={() => {}}>
      <shaderMaterial uniforms={uniforms} vertexColors depthTest={false} depthWrite={false}
        transparent={false} toneMapped={false} fog={false} side={BackSide}
        vertexShader={`
          varying vec3 vSkyColor;
          varying vec3 vWorldDirection;
          uniform float uRotationAngle, uPhase, uDeformation;
          uniform vec3 uAxis;
          void main() {
            vSkyColor = color;
            vec3 p = normalize(position);
            float phase = uPhase;
            p = normalize(p + uDeformation * vec3(
              sin(p.y * 5.0 + p.z * 3.0 + phase),
              sin(p.z * 4.0 + p.x * 3.0 + phase * 0.83),
              cos(p.x * 5.0 + p.y * 2.0 + phase * 0.71)));
            vec3 axis = uAxis;
            float angle = uRotationAngle;
            p = p * cos(angle) + cross(axis, p) * sin(angle)
              + axis * dot(axis, p) * (1.0 - cos(angle));
            vWorldDirection = p;
            // World direction at infinity: retain camera rotation and FOV only.
            vec4 projected = projectionMatrix * vec4(mat3(viewMatrix) * p, 1.0);
            gl_Position = projected.xyww;
          }
        `}
        fragmentShader={`
          varying vec3 vSkyColor;
          varying vec3 vWorldDirection;
          uniform vec3 uDarkest;
          uniform vec2 uAxes, uBrightness;
          void main() {
            vec3 direction = normalize(vWorldDirection);
            // Angular coordinates make the falloff span the actual visible sky.
            // Keep the broad horizontal dark region anchored in world space.
            vec2 angle = vec2(atan(direction.x, -direction.z),
              asin(clamp(direction.y, -1.0, 1.0)) + 0.028);
            vec2 offset = angle / uAxes;
            float distanceSquared = dot(offset, offset);
            float brightness = mix(uBrightness.x, uBrightness.y,
              1.0 - exp(-distanceSquared));
            // A soft color floor retains facet differences instead of clipping them.
            gl_FragColor = vec4(mix(uDarkest, vSkyColor, brightness), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  )
}
