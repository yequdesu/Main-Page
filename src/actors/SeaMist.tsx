import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
} from 'three'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { getWebglLayer } from '../composition/layerRegistry'
import { TIMELINE } from '../composition/timeline'
import { clamped, SCENE_CENTER_Z, smoothstep } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    value += noise(p) * amp;
    p = rot * p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.52;
  }
  return value;
}

void main() {
  vec2 flowA = vec2(uTime * 0.018, sin(uTime * 0.031 + uSeed) * 0.08);
  vec2 flowB = vec2(-uTime * 0.011, uTime * 0.006);
  float horizontal = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));

  float ridge = fbm(vec2(vUv.x * 2.25 + uSeed, uSeed * 0.37 + uTime * 0.010));
  float torn = fbm(vec2(vUv.x * 8.5 + flowA.x + uSeed, vUv.y * 2.8 + flowA.y));
  float wisps = fbm(vec2(vUv.x * 18.0 + flowB.x, vUv.y * 7.0 + flowB.y + uSeed));
  float edgeHeight = 0.34 + (ridge - 0.5) * 0.30 + (torn - 0.5) * 0.14;
  edgeHeight = clamp(edgeHeight, 0.16, 0.68);

  float belowEdge = 1.0 - smoothstep(edgeHeight - 0.18, edgeHeight + 0.18, vUv.y);
  float contactFeather = smoothstep(0.00, 0.20, vUv.y);
  float seaHug = exp(-pow(abs(vUv.y - 0.12) * 3.35, 1.36));
  float liftMist = exp(-pow(max(0.0, vUv.y - 0.18) * 2.25, 1.18)) * 0.34;
  float body = max(seaHug, liftMist) * belowEdge;

  float cloudCells = smoothstep(0.18, 0.82, fbm(vec2(vUv.x * 4.4 + flowA.x * 0.6 + uSeed, vUv.y * 3.0 - flowA.y)));
  float holes = smoothstep(0.34, 0.86, fbm(vec2(vUv.x * 7.6 - flowB.x + uSeed * 1.7, vUv.y * 4.2 + flowB.y)));
  float breakup = mix(0.48, 1.18, cloudCells) * mix(0.42, 1.0, holes);
  float upperFray = smoothstep(edgeHeight - 0.22, edgeHeight + 0.10, vUv.y);
  float frayMask = mix(1.0, smoothstep(0.22, 0.86, torn + wisps * 0.35), upperFray);
  float upperWisps = smoothstep(0.48, 0.88, torn + wisps * 0.42);
  upperWisps *= smoothstep(0.16, edgeHeight + 0.22, vUv.y) * (1.0 - smoothstep(edgeHeight + 0.08, edgeHeight + 0.40, vUv.y));

  float beamLift = smoothstep(0.46, 0.78, vUv.x) * (1.0 - smoothstep(0.80, 1.0, vUv.x));
  beamLift *= smoothstep(0.02, 0.25, vUv.y) * (1.0 - smoothstep(0.36, 0.70, vUv.y));

  float density = horizontal * body * breakup * frayMask;
  density += horizontal * upperWisps * 0.24;
  density += horizontal * beamLift * (0.10 + torn * 0.08);
  density *= contactFeather;
  density = clamp(density, 0.0, 1.0);

  vec3 color = uColor * (0.62 + wisps * 0.18 + beamLift * 0.30);
  gl_FragColor = vec4(color, density * uOpacity);
}
`

interface MistBandConfig {
  x: number
  width: number
  height: number
  y: number
  z: number
  opacity: number
  speed: number
  seed: number
}

const BANDS: MistBandConfig[] = [
  { x: -68, width: 112, height: 16.5, y: -3.20, z: SCENE_CENTER_Z - 96, opacity: 0.18, speed: 0.013, seed: 1.3 },
  { x: -16, width: 142, height: 17.8, y: -3.12, z: SCENE_CENTER_Z - 94, opacity: 0.21, speed: 0.018, seed: 2.1 },
  { x: 66, width: 118, height: 15.2, y: -3.08, z: SCENE_CENTER_Z - 95, opacity: 0.16, speed: -0.011, seed: 3.2 },
  { x: -56, width: 92, height: 11.2, y: -2.92, z: SCENE_CENTER_Z - 82, opacity: 0.13, speed: -0.012, seed: 3.9 },
  { x: 20, width: 126, height: 11.8, y: -2.86, z: SCENE_CENTER_Z - 80, opacity: 0.15, speed: 0.010, seed: 5.4 },
  { x: 76, width: 74, height: 9.0, y: -2.72, z: SCENE_CENTER_Z - 72, opacity: 0.10, speed: 0.014, seed: 7.1 },
  { x: -20, width: 68, height: 7.8, y: -2.64, z: SCENE_CENTER_Z - 70, opacity: 0.075, speed: -0.016, seed: 9.6 },
]

function createMistPlane(config: MistBandConfig, renderOrder: number): Mesh {
  const geometry = new BufferGeometry()
  const hw = config.width * 0.5
  const hh = config.height * 0.5
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    -hw, -hh, 0,
    hw, -hh, 0,
    hw, hh, 0,
    -hw, hh, 0,
  ]), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ]), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new Color('#a9bbcf') },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: config.seed },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  })
  const mesh = new Mesh(geometry, material)
  mesh.renderOrder = renderOrder
  mesh.position.set(config.x, config.y, config.z)
  mesh.rotation.x = -0.035
  return mesh
}

function mistAlpha(sp: number): number {
  const fadeOut = smoothstep(clamped(sp, 0.30, TIMELINE.act1OceanVoyage.end))
  return 1 - fadeOut
}

export default function SeaMist() {
  useActorRuntime('seaMist', true)
  const layer = getWebglLayer('webgl.oceanMist')
  const bands = useMemo(() => BANDS.map((config) => createMistPlane(config, layer.renderOrder)), [layer.renderOrder])

  useEffect(() => () => {
    for (const band of bands) {
      band.geometry.dispose()
      ;(band.material as ShaderMaterial).dispose()
    }
  }, [bands])

  useFrame(({ clock }) => {
    const sp = useScrollStore.getState().scrollProgress
    const alpha = mistAlpha(sp)
    const time = clock.elapsedTime
    touchActorFrame('seaMist', Math.round(time * 60), alpha > 0.001)

    for (let i = 0; i < bands.length; i++) {
      const band = bands[i]
      const config = BANDS[i]
      const material = band.material as ShaderMaterial
      band.visible = alpha > 0.001
      band.position.x = config.x + Math.sin(time * config.speed + config.seed) * 0.9
      band.position.y = config.y + Math.sin(time * config.speed * 0.73 + config.seed * 1.9) * 0.045
      material.uniforms.uTime.value = time
      material.uniforms.uOpacity.value = config.opacity * alpha
    }
  })

  return (
    <group>
      {bands.map((band, idx) => (
        <primitive key={idx} object={band} />
      ))}
    </group>
  )
}
