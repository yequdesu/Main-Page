import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Vector2, Vector3 } from 'three'
import { getWebglLayer } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'

export const NIGHT_SKY = {
  seed: 7319,
  palette: ['#0a101c', '#101a29', '#152033'],
  cellDensity: 24,
  contrast: 0.85,
  darkestColor: '#050811',
  centerBrightness: 0.64,
  outerBrightness: 0.90,
  darkRegionAxes: [1.1, 0.72],
  rotationRadians: 0.0015,
  deformationAmplitude: 0.018,
} as const

function hash(x: number, y: number): number {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ NIGHT_SKY.seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx
  const b = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx
  return a * (1 - sy) + b * sy
}

function buildSky(): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, NIGHT_SKY.cellDensity)
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const palette = NIGHT_SKY.palette.map(value => new Color(value))
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
    const broad = (noise(x * 4 + z * 2 + 4.7, y * 4 + z * 3 + 8.3)
      + noise(z * 4 - x * 2, y * 5 - x * 3)) * 0.5
    const tone = Math.max(0, Math.min(1,
      0.2 + broad * 0.6 + (hash(i, 31) - 0.5) * 0.12 * NIGHT_SKY.contrast))
    shade.copy(palette[tone < 0.5 ? 0 : 1])
      .lerp(palette[tone < 0.5 ? 1 : 2], tone < 0.5 ? tone * 2 : tone * 2 - 1)
    for (let j = 0; j < 3; j++) shade.toArray(colors, (i + j) * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

export default function LowPolyNightSky() {
  const geometry = useMemo(buildSky, [])
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDarkest: { value: new Color(NIGHT_SKY.darkestColor) },
    uAxes: { value: new Vector2(...NIGHT_SKY.darkRegionAxes) },
    uBrightness: { value: new Vector2(NIGHT_SKY.centerBrightness, NIGHT_SKY.outerBrightness) },
    uRotation: { value: NIGHT_SKY.rotationRadians },
    uDeformation: { value: NIGHT_SKY.deformationAmplitude },
  }), [])
  // Reuse the scene frame loop, with no dependency on scroll progress.
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime
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
          uniform float uTime, uRotation, uDeformation;
          void main() {
            vSkyColor = color;
            vec3 p = normalize(position);
            float phase = uTime * 0.025;
            p = normalize(p + uDeformation * vec3(
              sin(p.y * 5.0 + p.z * 3.0 + phase),
              sin(p.z * 4.0 + p.x * 3.0 + phase * 0.83),
              cos(p.x * 5.0 + p.y * 2.0 + phase * 0.71)));
            vec3 axis = normalize(vec3(0.28, 1.0, 0.34));
            float angle = uTime * uRotation;
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
            // Broad ellipse anchored to the initial forward world direction.
            vec2 offset = vec2(direction.x, direction.y + 0.028) / uAxes;
            float distanceSquared = dot(offset, offset) + max(0.0, direction.z) * 2.0;
            float brightness = mix(uBrightness.x, uBrightness.y,
              1.0 - exp(-distanceSquared * 0.65));
            // A soft color floor retains facet differences instead of clipping them.
            gl_FragColor = vec4(mix(uDarkest, vSkyColor, brightness), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  )
}
