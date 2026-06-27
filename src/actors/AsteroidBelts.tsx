import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three'
import { getWindChimeProgress } from '../behaviors/useWindChime'
import { getWebglLayer } from '../composition/layerRegistry'
import { TIMELINE } from '../composition/timeline'
import { clamped, ORBIT_RADII, SCENE_CENTER_Z, smoothstep } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

const vertexShader = `
attribute vec3 aColor;
attribute float aSize;
attribute float aOpacity;
varying vec3 vColor;
varying float vOpacity;
uniform float uPixelRatio;
uniform float uProjectionScale;
uniform float uMinPointSize;
uniform float uMaxPointSize;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = max(0.1, -mvPosition.z);
  gl_PointSize = clamp(aSize * uProjectionScale / depth * uPixelRatio, uMinPointSize, uMaxPointSize);
  gl_Position = projectionMatrix * mvPosition;
  vColor = aColor;
  vOpacity = aOpacity;
}
`

const fragmentShader = `
varying vec3 vColor;
varying float vOpacity;

void main() {
  vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
  float r = dot(uv, uv);
  if (r > 1.0) discard;
  float body = 1.0 - smoothstep(0.18, 0.98, r);
  float edge = 1.0 - smoothstep(0.58, 1.0, r);
  gl_FragColor = vec4(vColor * (0.74 + body * 0.26), vOpacity * edge);
}
`

function smoothRange(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

interface AsteroidParticle {
  radius: number
  angle: number
  speed: number
  size: number
  opacity: number
  color: Color
  yOffset: number
  radialJitter: number
  revealDelay: number
}

interface BeltConfig {
  count: number
  innerRadius: number
  outerRadius: number
  inclination: number
  nodeAngle: number
  thickness: number
  speed: number
  sizeMin: number
  sizeMax: number
  opacity: number
  colorA: string
  colorB: string
  revealSpan?: number
}

function makeBelt(config: BeltConfig): AsteroidParticle[] {
  const colorA = new Color(config.colorA)
  const colorB = new Color(config.colorB)
  return Array.from({ length: config.count }, () => {
    const t = Math.random()
    const radius = config.innerRadius + (config.outerRadius - config.innerRadius) * Math.sqrt(t)
    const color = colorA.clone().lerp(colorB, Math.random())
    return {
      radius,
      angle: Math.random() * Math.PI * 2,
      speed: config.speed * (0.75 + Math.random() * 0.5),
      size: config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin),
      opacity: config.opacity * (0.55 + Math.random() * 0.45),
      color,
      yOffset: (Math.random() - 0.5) * config.thickness,
      radialJitter: (Math.random() - 0.5) * (config.outerRadius - config.innerRadius) * 0.18,
      revealDelay: Math.random() * (config.revealSpan ?? 0),
    }
  })
}

function writeBeltPositions(
  particles: AsteroidParticle[],
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  opacities: Float32Array,
  offset: number,
  config: BeltConfig,
  time: number,
  alpha: number,
  centerZ: number,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  revealTime: number | null,
) {
  const sinI = Math.sin(config.inclination)
  const cosI = Math.cos(config.inclination)
  const sinNode = Math.sin(config.nodeAngle)
  const cosNode = Math.cos(config.nodeAngle)

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const idx = offset + i
    const angle = p.angle + time * p.speed
    const radius = p.radius + p.radialJitter * Math.sin(time * 0.18 + p.angle * 3.0)
    const localX = Math.cos(angle) * radius
    const localZ = Math.sin(angle) * radius
    const tiltedY = localZ * sinI + p.yOffset
    const tiltedZ = localZ * cosI
    const worldX = localX * cosNode - tiltedZ * sinNode
    const worldZ = localX * sinNode + tiltedZ * cosNode
    const worldY = -1.0 + tiltedY
    const toLightX = -worldX
    const toLightY = -tiltedY
    const toLightZ = -worldZ
    const toCameraX = cameraX - worldX
    const toCameraY = cameraY - worldY
    const toCameraZ = cameraZ - (centerZ + worldZ)
    const lightLen = Math.hypot(toLightX, toLightY, toLightZ) || 1
    const cameraLen = Math.hypot(toCameraX, toCameraY, toCameraZ) || 1
    const phase = (toLightX * toCameraX + toLightY * toCameraY + toLightZ * toCameraZ) / (lightLen * cameraLen)
    const sunlight = 0.66 + smoothRange(0.04, 0.98, phase) * 1.18
    const reveal = revealTime === null ? 1 : smoothRange(0, 0.9, revealTime - p.revealDelay)
    const positionOffset = idx * 3

    positions[positionOffset] = worldX
    positions[positionOffset + 1] = worldY
    positions[positionOffset + 2] = centerZ + worldZ
    colors[positionOffset] = Math.min(1, p.color.r * sunlight + 0.055 * sunlight)
    colors[positionOffset + 1] = Math.min(1, p.color.g * sunlight + 0.045 * sunlight)
    colors[positionOffset + 2] = Math.min(1, p.color.b * sunlight + 0.025 * sunlight)
    sizes[idx] = p.size
    opacities[idx] = p.opacity * alpha * reveal * (0.82 + sunlight * 0.36)
  }
}

export default function AsteroidBelts() {
  const layer = getWebglLayer('webgl.debris')
  const innerConfig = useMemo<BeltConfig>(() => ({
    count: 360,
    innerRadius: ORBIT_RADII[1] + 0.34,
    outerRadius: ORBIT_RADII[2] - 0.38,
    inclination: 0.045,
    nodeAngle: -0.08,
    thickness: 0.12,
    speed: -0.018,
    sizeMin: 0.030,
    sizeMax: 0.085,
    opacity: 0.52,
    colorA: '#7d8796',
    colorB: '#c1cad6',
  }), [])
  const outerConfig = useMemo<BeltConfig>(() => ({
    count: 2400,
    innerRadius: ORBIT_RADII[2] + 7.2,
    outerRadius: ORBIT_RADII[2] + 22.0,
    inclination: -0.38,
    nodeAngle: 0.62,
    thickness: 1.85,
    speed: -0.0024,
    sizeMin: 0.026,
    sizeMax: 0.082,
    opacity: 0.44,
    colorA: '#596677',
    colorB: '#a5b0bf',
    revealSpan: 4.5,
  }), [])
  const innerParticles = useMemo(() => makeBelt(innerConfig), [innerConfig])
  const outerParticles = useMemo(() => makeBelt(outerConfig), [outerConfig])
  const totalCount = innerParticles.length + outerParticles.length
  const points = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(totalCount * 3), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(totalCount * 3), 3))
    geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(totalCount), 1))
    geometry.setAttribute('aOpacity', new BufferAttribute(new Float32Array(totalCount), 1))
    geometry.setDrawRange(0, totalCount)

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPixelRatio: { value: 1 },
        uProjectionScale: { value: 1 },
        uMinPointSize: { value: 0.65 },
        uMaxPointSize: { value: 7.0 },
      },
      transparent: layer.transparent,
      depthWrite: layer.depthWrite,
      depthTest: layer.depthTest,
    })
    const result = new Points(geometry, material)
    result.frustumCulled = false
    result.renderOrder = layer.renderOrder
    return result
  }, [layer.depthTest, layer.depthWrite, layer.renderOrder, layer.transparent, totalCount])
  const pointsRef = useRef(points)
  const outerRevealStartRef = useRef<number | null>(null)
  const outerRevealElapsedRef = useRef<number | null>(null)
  const outerFadeRef = useRef(0)

  useFrame(({ camera, gl, clock }) => {
    const sp = useScrollStore.getState().scrollProgress
    const innerAlpha = smoothstep(clamped(sp, TIMELINE.act3Shift.start, 1.0))
    const material = pointsRef.current.material as ShaderMaterial
    const geometry = pointsRef.current.geometry
    const positionAttr = geometry.getAttribute('position') as BufferAttribute
    const colorAttr = geometry.getAttribute('aColor') as BufferAttribute
    const sizeAttr = geometry.getAttribute('aSize') as BufferAttribute
    const opacityAttr = geometry.getAttribute('aOpacity') as BufferAttribute
    const positions = positionAttr.array as Float32Array
    const colors = colorAttr.array as Float32Array
    const sizes = sizeAttr.array as Float32Array
    const opacities = opacityAttr.array as Float32Array
    const fov = 'fov' in camera ? (camera.fov * Math.PI) / 180 : Math.PI / 4
    const centerZ = SCENE_CENTER_Z + 6 * getWindChimeProgress(sp).smoothP
    const time = clock.elapsedTime
    const outerSignal = sp >= 0.998
    if (outerSignal && outerRevealStartRef.current === null) {
      outerRevealStartRef.current = time
      outerRevealElapsedRef.current = 0
    }
    if (outerSignal && outerRevealStartRef.current !== null) {
      outerRevealElapsedRef.current = time - outerRevealStartRef.current
    }
    outerFadeRef.current += ((outerSignal ? 1 : 0) - outerFadeRef.current) * (outerSignal ? 0.055 : 0.14)
    if (!outerSignal && outerFadeRef.current < 0.002) {
      outerFadeRef.current = 0
      outerRevealStartRef.current = null
      outerRevealElapsedRef.current = null
    }
    const outerRevealTime = outerRevealElapsedRef.current

    material.uniforms.uPixelRatio.value = Math.min(2, gl.getPixelRatio())
    material.uniforms.uProjectionScale.value = gl.domElement.clientHeight / (2 * Math.tan(fov / 2))
    writeBeltPositions(
      innerParticles,
      positions,
      colors,
      sizes,
      opacities,
      0,
      innerConfig,
      time,
      innerAlpha,
      centerZ,
      camera.position.x,
      camera.position.y,
      camera.position.z,
      null,
    )
    writeBeltPositions(
      outerParticles,
      positions,
      colors,
      sizes,
      opacities,
      innerParticles.length,
      outerConfig,
      time,
      outerFadeRef.current,
      centerZ,
      camera.position.x,
      camera.position.y,
      camera.position.z,
      outerRevealTime,
    )
    positionAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
    opacityAttr.needsUpdate = true
  })

  return <primitive object={points} />
}
