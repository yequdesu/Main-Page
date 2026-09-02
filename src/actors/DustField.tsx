import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { calcOrbitPosition } from '../behaviors/useOrbitPosition'
import { smoothstep, clamped, SCENE_CENTER_Z, ORBIT_COUNT } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { readBeamWorldDirection, readBeamWorldOrigin } from '../composition/coreAnchors'
import { getWindChimeCenterPhysicalPoint, getWindChimePlanetPhysicalPoint, getWindChimeProgress } from '../behaviors/useWindChime'
import { type ParticleData } from '../types'

const DEBRIS_COUNT = 560
const LIGHTHOUSE_DUST_Y = -0.428

interface DustParticleData extends ParticleData {
  act1X: number
  act1Y: number
  act1Z: number
  protoRadius: number
  protoAngle: number
  protoArm: number
  protoX: number
  protoY: number
  protoZ: number
  protoCoreWeight: number
  protoDensity: number
  formationDelay: number
  formationDuration: number
  formationSwirl: number
  formationOvershoot: number
  impactX: number
  impactY: number
  impactZ: number
  beamDustWeight: number
  driftAmp: number
  driftPhaseX: number
  driftPhaseY: number
  driftPhaseZ: number
  twinklePhase: number
  twinkleSpeed: number
}

const particleVertexShader = `
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
  float pointSize = aSize * uProjectionScale / depth * uPixelRatio;
  gl_PointSize = clamp(pointSize, uMinPointSize, uMaxPointSize);
  gl_Position = projectionMatrix * mvPosition;
  vColor = aColor;
  vOpacity = aOpacity;
}
`

const particleFragmentShader = `
varying vec3 vColor;
varying float vOpacity;

void main() {
  vec2 uv = gl_PointCoord.xy * 2.0 - 1.0;
  float r = dot(uv, uv);
  if (r > 1.0) discard;
  float core = 1.0 - smoothstep(0.0, 0.92, r);
  float edge = 1.0 - smoothstep(0.68, 1.0, r);
  float alpha = vOpacity * edge;
  gl_FragColor = vec4(vColor * (0.62 + core * 0.38), alpha);
}
`

function smoothRange(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gaussianRandom(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

function angleDelta(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function protoCoreDensity(x: number, y: number, z: number): number {
  const radial = (x * x) / (1.55 * 1.55) + (z * z) / (1.15 * 1.15)
  const vertical = (y * y) / (0.82 * 0.82)
  return Math.exp(-0.5 * (radial + vertical))
}

function protoArmAngle(radius: number, arm: number): number {
  return arm * ((Math.PI * 2) / 3) + radius * 0.62
}

function protoArmDensity(x: number, y: number, z: number): number {
  const radius = Math.hypot(x, z)
  if (radius < 0.85) return 0
  const theta = Math.atan2(z, x)
  const angularWidth = 0.20 + radius * 0.035
  const verticalWidth = 0.055 + radius * 0.030
  let best = 0
  for (let arm = 0; arm < 3; arm++) {
    const a = angleDelta(theta, protoArmAngle(radius, arm))
    best = Math.max(best, Math.exp(-0.5 * ((a / angularWidth) ** 2 + (y / verticalWidth) ** 2)))
  }
  return best
}

function sampleProtoNebula() {
  const coreSample = Math.random() < 0.48
  let x: number
  let y: number
  let z: number
  let arm = Math.floor(Math.random() * 3)

  if (coreSample) {
    x = gaussianRandom() * 1.08
    y = gaussianRandom() * 0.70
    z = gaussianRandom() * 0.94
  } else {
    const radius = 1.15 + Math.pow(Math.random(), 0.74) * 5.35
    arm = Math.floor(Math.random() * 3)
    const angularWidth = 0.18 + radius * 0.032
    const theta = protoArmAngle(radius, arm) + gaussianRandom() * angularWidth
    const verticalWidth = 0.055 + radius * 0.030
    x = Math.cos(theta) * radius + gaussianRandom() * 0.10
    y = gaussianRandom() * verticalWidth
    z = Math.sin(theta) * radius + gaussianRandom() * 0.10
  }

  const radius = Math.hypot(x, z)
  const angle = Math.atan2(z, x)
  const coreDensity = protoCoreDensity(x, y, z)
  const armDensity = protoArmDensity(x, y, z)
  return {
    x,
    y,
    z,
    radius,
    angle,
    arm,
    coreWeight: coreDensity / Math.max(0.001, coreDensity + armDensity * 0.72),
    density: Math.max(coreDensity, armDensity),
  }
}

function getProtoFormationPoint(d: DustParticleData, time: number, progress: number) {
  const localP = Math.max(0, Math.min(1, (progress - d.formationDelay) / d.formationDuration))
  const ease = localP * localP * localP * (localP * (localP * 6 - 15) + 10)
  const capture = Math.sin(Math.PI * localP)
  const settle = 1 + Math.exp(-localP * 3.8) * Math.sin(localP * Math.PI * 2.2 + d.twinklePhase) * d.formationOvershoot
  const looseScale = 1.42 - ease * 0.42
  const orbitalSpeed = 0.0035 + 0.145 / (0.38 + d.protoRadius)
  const spin = time * orbitalSpeed + capture * d.formationSwirl * 0.55
  const protoCos = Math.cos(spin)
  const protoSin = Math.sin(spin)
  const densityFlutter = (1 - d.protoDensity) * Math.sin(d.protoRadius * 1.5 + time * 0.11 + d.protoArm * 2.1) * 0.10
  const baseX = d.protoX * looseScale * settle
  const baseY = d.protoY * (1.55 - ease * 0.55)
  const baseZ = d.protoZ * looseScale * settle
  const vortex = capture * (0.22 + d.protoRadius * 0.045)

  return {
    x: baseX * protoCos - baseZ * protoSin + Math.cos(d.protoAngle + spin) * (densityFlutter + vortex),
    y: baseY + Math.sin(time * 0.09 + d.protoAngle) * d.driftAmp * (0.20 + d.protoCoreWeight * 0.72),
    z: baseX * protoSin + baseZ * protoCos + Math.sin(d.protoAngle + spin) * (densityFlutter + vortex),
  }
}

/**
 * DustField �?碎片 InstancedMesh2�?0 个）�?
 *
 * renderOrder = 2, depthWrite = false�?
 * �?DustField 中行�?Mesh 已剥离至 Planets.tsx�?
 *
 * 援引�?
 *   混合方案（TECH_STACK_EVALUATION.md 第十节）
 *   R3F InstancedMesh + individual <mesh> for interactive objects
 */
export default function DustField() {
  useActorRuntime('debris', true)
  const { camera, gl } = useThree()
  const { shouldSkip } = useFrameCache()
  const layer = getWebglLayer('webgl.debris')

  // Pre-allocated reusable objects
  const _scratch = useRef(new Vector3()).current
  const _scratch2 = useRef(new Color()).current
  const _color2 = useRef(new Color()).current
  const _beamColor = useRef(new Color('#ffffff')).current
  const _colorAct1 = useRef(new Color('#f0f8ff')).current
  const _colorAct3 = useRef(new Color('#64748b')).current

  // ---- Create debris particle data + InstancedMesh2 (one-time) ----
  const { particleData, debrisGrayHexes } = useMemo(() => {
    const count = DEBRIS_COUNT + ORBIT_COUNT
    const dustConfigs: { scale: number; sizeBoost: number; totalSize: number }[] = []

    for (let i = 0; i < count; i++) {
      const scale = 0.4 + Math.random() * 0.8
      const sizeBoost = Math.random() < 0.60 ? 1.5 + Math.random() * 2.5 : 0.7 + Math.random() * 0.8
      dustConfigs.push({ scale, sizeBoost, totalSize: scale * sizeBoost })
    }

    const sorted = dustConfigs.map((c, i) => ({ idx: i, size: c.totalSize }))
      .sort((a, b) => b.size - a.size)
    const planetIndices = sorted.slice(0, ORBIT_COUNT).map(s => s.idx)

    const data: DustParticleData[] = []
    const grayHexes: string[] = []

    for (let i = 0; i < count; i++) {
      const isMain = planetIndices.includes(i)
      if (isMain) continue // 行星�?Planets.tsx 管理

      const cfg = dustConfigs[i]

      const worldOrigin = new Vector3(0, LIGHTHOUSE_DUST_Y, SCENE_CENTER_Z)
      const isBeamDust = Math.random() < 0.72
      const act1Angle = Math.random() * Math.PI * 2
      const act1Radius = Math.sqrt(Math.random())
      const act1Height = (Math.random() - 0.5) * 2
      const act1X = Math.cos(act1Angle) * act1Radius * 3.4
      const act1Y = LIGHTHOUSE_DUST_Y + act1Height * 1.15
      const act1Z = SCENE_CENTER_Z + Math.sin(act1Angle) * act1Radius * 3.4 + (Math.random() - 0.5) * 3.2
      const protoSample = sampleProtoNebula()
      const impactAngle = protoSample.angle + (Math.random() - 0.5) * 0.75
      const impactPush = 0.7 + Math.random() * 1.7
      const beamDustWeight = isBeamDust ? 1 : 0
      const tt = Math.random()
      const zDist = 1 + tt * 41
      const maxR = (zDist / 42) * 7.5 + 0.2
      const angle = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * maxR
      const wx = worldOrigin.x + Math.cos(angle) * r
      const wy = worldOrigin.y + (Math.random() - 0.5) * maxR * 0.6
      const wz = worldOrigin.z + zDist

      const gray = Math.floor(100 + Math.random() * 60)
      const grayHex = '#' + gray.toString(16).padStart(2, '0').repeat(3)

      const beltT = Math.random()
      const orbitR = 5.35 + Math.pow(beltT, 0.72) * 1.05 + (Math.random() - 0.5) * 0.18
      const orbitSpeed = -(0.0045 + Math.random() * 0.009)

      const particle: DustParticleData = {
        wx, wy, wz,
        dx: (Math.random() - 0.5) * 0.15,
        dy: (Math.random() - 0.5) * 0.1 + 0.06,
        dz: (Math.random() - 0.5) * 0.08,
        ph: Math.random() * Math.PI * 2,
        scale: cfg.scale,
        sizeBoost: cfg.sizeBoost,
        grayHex,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitR,
        orbitSpeed,
        _baseSpeed: orbitSpeed,
        scaleMult: 0.70 + Math.random() * 0.55,
        isMainPlanet: false,
        hoverFactor: 0.0,
        orbitTilt: 0,
        flattenY: 1.0,
        wobbleAmp: 0.035 + Math.random() * 0.18,
        wobbleFreq: 0.08 + Math.random() * 0.16,
        act1X,
        act1Y,
        act1Z,
        protoRadius: protoSample.radius,
        protoAngle: protoSample.angle,
        protoArm: protoSample.arm,
        protoX: protoSample.x,
        protoY: protoSample.y,
        protoZ: protoSample.z,
        protoCoreWeight: protoSample.coreWeight,
        protoDensity: protoSample.density,
        formationDelay: Math.random() * 0.24,
        formationDuration: 0.56 + Math.random() * 0.32,
        formationSwirl: (Math.random() < 0.5 ? -1 : 1) * (0.65 + Math.random() * 1.25),
        formationOvershoot: 0.05 + Math.random() * 0.12,
        impactX: Math.cos(impactAngle) * impactPush,
        impactY: (Math.random() - 0.5) * 0.55,
        impactZ: Math.sin(impactAngle) * impactPush,
        beamDustWeight,
        driftAmp: 0.025 + Math.random() * 0.060,
        driftPhaseX: Math.random() * Math.PI * 2,
        driftPhaseY: Math.random() * Math.PI * 2,
        driftPhaseZ: Math.random() * Math.PI * 2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.7 + Math.random() * 1.6,
      }

      data.push(particle)
      grayHexes.push(grayHex)
    }

    return { particleData: data, debrisGrayHexes: grayHexes }
  }, [])

  // ---- Debris soft billboard points ----
  const debrisPoints = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(DEBRIS_COUNT * 3), 3))
    geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(DEBRIS_COUNT * 3), 3))
    geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(DEBRIS_COUNT), 1))
    geometry.setAttribute('aOpacity', new BufferAttribute(new Float32Array(DEBRIS_COUNT), 1))
    geometry.setDrawRange(0, DEBRIS_COUNT)

    const material = new ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uPixelRatio: { value: Math.min(2, gl.getPixelRatio()) },
        uProjectionScale: { value: 1 },
        uMinPointSize: { value: 0.75 },
        uMaxPointSize: { value: 10.0 },
      },
      transparent: layer.transparent,
      depthWrite: layer.depthWrite,
      depthTest: layer.depthTest,
    })
    const points = new Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = layer.renderOrder
    return points
  }, [gl, layer.depthTest, layer.depthWrite, layer.renderOrder, layer.transparent])
  const debrisRef = useRef<Points>(debrisPoints)

  // Initialize per-instance colors
  useEffect(() => {
    const points = debrisRef.current
    if (!points) return
    const color = new Color()
    const colorAttr = points.geometry.getAttribute('aColor') as BufferAttribute
    const colors = colorAttr.array as Float32Array
    debrisGrayHexes.forEach((hex, i) => {
      color.set(hex)
      const offset = i * 3
      colors[offset] = color.r
      colors[offset + 1] = color.g
      colors[offset + 2] = color.b
    })
    colorAttr.needsUpdate = true
  }, [debrisGrayHexes])

  // ---- Per-frame debris animation ----
  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    touchActorFrame('debris', Math.round(time * 60), true)
    if (shouldSkip(time, sp)) return

    const miniatureProgress = clamped(sp, TIMELINE.miniatureShrink.start, TIMELINE.miniatureShrink.end)
    const act3Progress = clamped(sp, TIMELINE.act3Shift.start, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const impact = smoothRange(TIMELINE.windChimeDrop.start, TIMELINE.windChimeDrop.end, sp) *
      (1 - smoothRange(TIMELINE.orbitGlow.start, TIMELINE.orbitGlow.end, sp))

    const cx = 0, cy = -1.0, cz = SCENE_CENTER_Z
    const points = debrisRef.current
    const positionAttr = points.geometry.getAttribute('position') as BufferAttribute
    const colorAttr = points.geometry.getAttribute('aColor') as BufferAttribute
    const sizeAttr = points.geometry.getAttribute('aSize') as BufferAttribute
    const opacityAttr = points.geometry.getAttribute('aOpacity') as BufferAttribute
    const positions = positionAttr.array as Float32Array
    const colors = colorAttr.array as Float32Array
    const sizes = sizeAttr.array as Float32Array
    const opacities = opacityAttr.array as Float32Array
    const cam = camera as PerspectiveCamera
    const material = points.material as ShaderMaterial
    const beamOrigin = readBeamWorldOrigin()
    const beamDirection = readBeamWorldDirection()
    const beamFacingCamera = beamDirection ? smoothRange(0.42, 0.92, beamDirection.z) : 0
    const act1Weight = 1 - smoothRange(TIMELINE.miniatureShrink.start, TIMELINE.miniatureShrink.end, sp)
    const act2Weight = smoothRange(TIMELINE.miniatureShrink.start, TIMELINE.act3Shift.start, sp) *
      (1 - smoothRange(TIMELINE.act3Shift.start, 1.0, sp))
    const wc = getWindChimeProgress(sp)
    const impactors = [
      { point: getWindChimeCenterPhysicalPoint(wc.smoothP, time), radius: 2.85, strength: 3.25, central: true },
      { point: getWindChimePlanetPhysicalPoint(0, wc.smoothP, time), radius: 0.90, strength: 0.72, central: false },
      { point: getWindChimePlanetPhysicalPoint(1, wc.smoothP, time), radius: 0.90, strength: 0.72, central: false },
      { point: getWindChimePlanetPhysicalPoint(2, wc.smoothP, time), radius: 0.90, strength: 0.72, central: false },
    ]
    material.uniforms.uPixelRatio.value = Math.min(2, gl.getPixelRatio())
    material.uniforms.uProjectionScale.value = gl.domElement.clientHeight / (2 * Math.tan((cam.fov * Math.PI) / 360))

    for (let i = 0; i < particleData.length; i++) {
      const d = particleData[i]

      const cloudX = d.act1X +
        Math.sin(time * 0.16 + d.driftPhaseX) * d.driftAmp +
        Math.sin(time * 0.041 + d.twinklePhase) * d.driftAmp * 0.55
      const cloudY = d.act1Y +
        Math.cos(time * 0.12 + d.driftPhaseY) * d.driftAmp * 0.62 +
        Math.sin(time * 0.037 + d.twinklePhase * 1.3) * d.driftAmp * 0.34
      const cloudZ = d.act1Z +
        Math.sin(time * 0.10 + d.driftPhaseZ) * d.driftAmp * 1.15 +
        Math.cos(time * 0.033 + d.twinklePhase * 1.7) * d.driftAmp * 0.72
      const act1X = cloudX
      const act1Y = cloudY
      const act1Z = cloudZ
      const orbitPoint = calcOrbitPosition(d, time, delta, cx, cy, cz, smooth3)
      const act2Ease = smoothstep(miniatureProgress)
      const act3Ease = smooth3
      const proto = getProtoFormationPoint(d, time, act2Ease)
      const protoX = proto.x
      const protoY = proto.y
      const protoZ = proto.z
      const act2X = protoX + Math.sin(time * 0.10 + d.driftPhaseX) * d.driftAmp * 0.55
      const act2Y = -1.0 + protoY + Math.cos(time * 0.085 + d.driftPhaseY) * d.driftAmp * 0.38
      const act2Z = SCENE_CENTER_Z + protoZ + Math.sin(time * 0.072 + d.driftPhaseZ) * d.driftAmp * 0.48
      const midX = act1X + (act2X - act1X) * act2Ease
      const midY = act1Y + (act2Y - act1Y) * act2Ease
      const midZ = act1Z + (act2Z - act1Z) * act2Ease
      let pushX = 0
      let pushY = 0
      let pushZ = 0
      for (const impactor of impactors) {
        const dx = midX - impactor.point.x
        const dy = midY - impactor.point.y
        const dz = midZ - impactor.point.z
        const radial = Math.hypot(dx, dz) || 0.001
        const fallSide = Math.max(0, 1 - Math.abs(dy) / (impactor.radius * 2.4))
        const near = Math.exp(-((radial / impactor.radius) ** 2)) * fallSide * impactor.strength
        const wake = Math.exp(-((radial / (impactor.radius * 2.6)) ** 2)) *
          smoothRange(-2.4, 1.0, impactor.point.y - midY) *
          impactor.strength * 0.45
        const centralBoost = impactor.central ? 1.0 + d.protoCoreWeight * 1.75 : 1
        const force = impact * (near + wake) * centralBoost
        const spread = impactor.central ? 2.15 + d.protoCoreWeight * 1.15 : 1.18 + d.protoRadius * 0.05
        pushX += (dx / radial) * force * spread
        pushY += (impactor.central ? -1.42 : -0.62 - Math.abs(d.impactY) * 0.22) * force
        pushZ += (dz / radial) * force * spread
      }
      pushX += d.impactX * impact * 0.18
      pushY += d.impactY * impact * 0.20
      pushZ += d.impactZ * impact * 0.18
      const shockX = midX + pushX
      const shockY = midY + pushY
      const shockZ = midZ + pushZ
      const px = shockX + (orbitPoint.x - shockX) * act3Ease
      const py = shockY + (orbitPoint.y - shockY) * act3Ease
      const pz = shockZ + (orbitPoint.z - shockZ) * act3Ease

      _scratch.set(px, py, pz)
      const cd = _scratch.distanceTo(camera.position)
      let beamHit = 0
      if (beamOrigin && beamDirection) {
        const vx = act1X - beamOrigin.x
        const vy = act1Y - beamOrigin.y
        const vz = act1Z - beamOrigin.z
        const proj = vx * beamDirection.x + vy * beamDirection.y + vz * beamDirection.z
        if (proj > 0) {
          const closestX = beamOrigin.x + beamDirection.x * proj
          const closestY = beamOrigin.y + beamDirection.y * proj
          const closestZ = beamOrigin.z + beamDirection.z * proj
          const distToBeam = Math.hypot(act1X - closestX, act1Y - closestY, act1Z - closestZ)
          const beamRadius = 0.24 + proj * 0.105
          beamHit = 1 - smoothRange(beamRadius * 0.35, beamRadius, distToBeam)
          beamHit *= 1 - smoothRange(6.2, 10.8, proj)
        }
      }
      const beamFactor = act1Weight * beamHit * (0.78 + beamFacingCamera * 0.22)
      const twinkle = 0.5 + Math.sin(time * d.twinkleSpeed + d.twinklePhase) * 0.5
      const act2Twinkle = 0.68 + twinkle * 0.32

      _color2.set(d.grayHex)
      _scratch2.copy(_colorAct1).lerp(_color2, miniatureProgress).lerp(_colorAct3, smooth3)
      const protoCoreGlow = d.protoCoreWeight * d.protoDensity * act2Ease * (1 - act3Ease)
      _scratch2.lerp(_beamColor, protoCoreGlow * 0.72)
      _scratch2.lerp(_beamColor, beamFactor * 0.92)

      const offset3 = i * 3
      positions[offset3] = px
      positions[offset3 + 1] = py
      positions[offset3 + 2] = pz
      colors[offset3] = _scratch2.r
      colors[offset3 + 1] = _scratch2.g
      colors[offset3 + 2] = _scratch2.b
      const act1Size = (0.012 + d.scale * 0.011) * (1 + beamFactor * 1.55)
      const act2Size = (0.040 + d.scale * 0.018) * act2Twinkle * (1 + protoCoreGlow * 0.9)
      const act3Size = 0.070 * d.scale * d.scaleMult
      const laterSize = act2Size + (act3Size - act2Size) * smooth3
      sizes[i] = act1Size + (laterSize - act1Size) * Math.max(act2Ease, act3Ease)
      const act1Opacity = 0.030 + d.beamDustWeight * 0.030 + beamFactor * 0.72
      const act2Opacity = (0.30 + twinkle * 0.18 + protoCoreGlow * 0.32) * (1 - smooth3)
      const act3Opacity = 0.58 + d.scaleMult * 0.34
      const laterOpacity = (act2Opacity + (act3Opacity - act2Opacity) * smooth3) * (1 - act2Weight * 0.08)
      const opacity = act1Opacity + (laterOpacity - act1Opacity) * Math.max(act2Ease, act3Ease)
      opacities[i] = opacity * smoothRange(4.0, 8.5, cd)
    }
    positionAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
    opacityAttr.needsUpdate = true

    // Publish camera + debris data to realtime store
    const lookDir = new Vector3()
    cam.getWorldDirection(lookDir)
    useRealtimeStore.getState().setCameraData({
      pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
      look: { x: lookDir.x, y: lookDir.y, z: lookDir.z },
      fov: cam.fov,
    })
    useRealtimeStore.getState().setDebrisCount(DEBRIS_COUNT)
  })

  return (
    <primitive object={debrisPoints} />
  )
}
