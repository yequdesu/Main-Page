import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, Vector2 } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { getWebglLayer } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'

export const NIGHT_SKY = {
  seed: 7319,
  palette: ['#050811', '#0c1423', '#152033'],
  cellDensity: 14,
  contrast: 0.85,
  darkestColor: '#040710',
  centerBrightness: 0.22,
  outerBrightness: 1.15,
  darkRegionAxes: [1.2, 0.62],
  rotationRadians: 0.24,
  deformationAmplitude: 0.025,
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

function buildSky(width: number, height: number): BufferGeometry {
  const shortSide = Math.max(1, Math.min(width, height))
  // An oversized square covers every viewport corner even during rotation.
  const extent = Math.hypot(width, height) / shortSide * 1.12
  const columns = Math.ceil(extent * NIGHT_SKY.cellDensity)
  const rows = columns
  const vertices = Array.from({ length: rows + 1 }, (_, y) =>
    Array.from({ length: columns + 1 }, (_, x) => ({
      x: (x + (x === 0 || x === columns ? 0 : (hash(x, y) - 0.5) * 0.65)) / columns,
      y: (y + (y === 0 || y === rows ? 0 : (hash(x + 941, y) - 0.5) * 0.65)) / rows,
    })))
  const positions: number[] = [], colors: number[] = []
  const palette = NIGHT_SKY.palette.map(value => new Color(value))
  const shade = new Color()
  type Point = { x: number; y: number }
  function triangle(a: Point, b: Point, c: Point, variation: number) {
    const x = (a.x + b.x + c.x) / 3 * extent
    const y = (a.y + b.y + c.y) / 3 * extent
    const broad = noise(x * 2.1 + 4.7, y * 2.1 + 8.3)
    const detail = noise(x * 5.2, y * 5.2)
    const tone = Math.max(0, Math.min(1,
      (broad * 0.8 + detail * 0.2 + (variation - 0.5) * 0.16) * NIGHT_SKY.contrast))
    shade.copy(palette[tone < 0.5 ? 0 : 1])
      .lerp(palette[tone < 0.5 ? 1 : 2], tone < 0.5 ? tone * 2 : (tone - 0.5) * 2)
    for (const p of [a, b, c]) {
      positions.push((p.x * 2 - 1) * extent, (p.y * 2 - 1) * extent, 0)
      colors.push(shade.r, shade.g, shade.b)
    }
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = vertices[y][x], b = vertices[y][x + 1]
    const c = vertices[y + 1][x], d = vertices[y + 1][x + 1]
    if (hash(x + 71, y) > 0.5) {
      triangle(a, b, d, hash(x + 123, y))
      triangle(a, d, c, hash(x + 456, y))
    } else {
      triangle(a, b, c, hash(x + 123, y))
      triangle(b, d, c, hash(x + 456, y))
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  return geometry
}

export default function LowPolyNightSky() {
  const { width, height } = useThree(state => state.size)
  const geometry = useMemo(() => buildSky(width, height), [width, height])
  const uniforms = useMemo(() => ({
    uProgress: { value: useScrollStore.getState().scrollProgress },
    uViewportScale: { value: new Vector2() },
    uDarkest: { value: new Color(NIGHT_SKY.darkestColor) },
    uAxes: { value: new Vector2(...NIGHT_SKY.darkRegionAxes) },
    uBrightness: { value: new Vector2(NIGHT_SKY.centerBrightness, NIGHT_SKY.outerBrightness) },
    uRotation: { value: NIGHT_SKY.rotationRadians },
    uDeformation: { value: NIGHT_SKY.deformationAmplitude },
  }), [])
  const shortSide = Math.max(1, Math.min(width, height))
  uniforms.uViewportScale.value.set(width / shortSide, height / shortSide)
  useFrame(() => {
    uniforms.uProgress.value = useScrollStore.getState().scrollProgress
  })
  const layer = getWebglLayer('webgl.nightSky')
  useActorRuntime('lowPolyNightSky', true)
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name="lowPolyNightSky" geometry={geometry} frustumCulled={false}
      renderOrder={layer.renderOrder} raycast={() => {}}>
      <shaderMaterial uniforms={uniforms} vertexColors depthTest={false} depthWrite={false}
        transparent={false} toneMapped={false} fog={false}
        vertexShader={`
          varying vec3 vSkyColor;
          varying vec2 vScreen;
          uniform float uProgress;
          uniform float uRotation;
          uniform float uDeformation;
          uniform vec2 uViewportScale;
          void main() {
            vSkyColor = color;
            vec2 p = position.xy;
            // Shared vertex positions receive identical displacements: no cracks.
            p += uDeformation * vec2(
              sin(p.y * 1.7 + uProgress * 0.7) - sin(p.y * 1.7),
              cos(p.x * 1.4 + uProgress * 0.6) - cos(p.x * 1.4));
            float angle = uProgress * uRotation;
            p = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * p;
            // Orthographic projection of a gently tilted plane, independent
            // of the scene camera and its depth buffer.
            float tiltX = 0.18 + uProgress * 0.04;
            float tiltY = -0.12 + uProgress * 0.03;
            vec3 tilted = vec3(p.x, p.y * cos(tiltX), p.y * sin(tiltX));
            p = vec2(tilted.x * cos(tiltY) + tilted.z * sin(tiltY), tilted.y);
            vScreen = p / uViewportScale;
            gl_Position = vec4(vScreen, 0.999, 1.0);
          }
        `}
        fragmentShader={`
          varying vec3 vSkyColor;
          varying vec2 vScreen;
          uniform vec3 uDarkest;
          uniform vec2 uAxes;
          uniform vec2 uBrightness;
          void main() {
            // Screen-anchored horizontal ellipse; the texture moves beneath it.
            float radius = length(vScreen / uAxes);
            float brightness = mix(uBrightness.x, uBrightness.y,
              smoothstep(0.05, 1.3, radius));
            gl_FragColor = vec4(max(uDarkest, vSkyColor * brightness), 1.0);
            #include <colorspace_fragment>
          }
        `}
      />
    </mesh>
  )
}
