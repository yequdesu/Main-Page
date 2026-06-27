import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Color, Quaternion, ConeGeometry, SphereGeometry, BufferGeometry, Vector3, BufferAttribute, ShaderMaterial, MeshBasicMaterial, SpriteMaterial, CanvasTexture, AdditiveBlending, DoubleSide, LineBasicMaterial, AmbientLight, PointLight, MathUtils, LinearFilter, type Mesh, type Line } from 'three'
import { VolumetricBeamShader } from '../shaders/VolumetricBeamShader'
import { useScrollStore } from '../stores/scrollStore'
import { smoothstep, clamped, SCENE_CENTER_Z, IDLE_RESET_DELAY } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import {
  beamWorldDirectionAnchorId,
  beamWorldOriginAnchorId,
  makeCoreAnchor,
  pointFromVector3,
  setCoreAnchors,
} from '../composition/coreAnchors'

// shortestDelta �?角度最短路径差（逐字保留自原 lightBeam.js�?
function shortestDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// 预分配（跨帧复用�?
const _lastBeam = { time: -1, sp: -1 }

// 共享光束世界空间变换 �?OceanWaves 读取用于波面照亮计算
// 初始化使�?beamPivot 已知位置 [0, -0.428, SCENE_CENTER_Z] + 朝向 (0,0,1)
const _beamWorldOrigin = new Vector3(0, -0.428, SCENE_CENTER_Z)
const _beamWorldDirection = new Vector3(0, 0, 1)
const _beamQuat = new Quaternion()
const _beamFwd = new Vector3()

const BEACON_HALO_TEX_SIZE = 128
let _beaconHaloTexture: CanvasTexture | null = null

function getBeaconHaloTexture(): CanvasTexture {
  if (_beaconHaloTexture) return _beaconHaloTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = BEACON_HALO_TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(
    BEACON_HALO_TEX_SIZE / 2,
    BEACON_HALO_TEX_SIZE / 2,
    0,
    BEACON_HALO_TEX_SIZE / 2,
    BEACON_HALO_TEX_SIZE / 2,
    BEACON_HALO_TEX_SIZE / 2,
  )
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.12, 'rgba(240,248,255,0.62)')
  gradient.addColorStop(0.38, 'rgba(205,225,255,0.24)')
  gradient.addColorStop(0.7, 'rgba(155,185,235,0.065)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, BEACON_HALO_TEX_SIZE, BEACON_HALO_TEX_SIZE)
  _beaconHaloTexture = new CanvasTexture(canvas)
  _beaconHaloTexture.minFilter = LinearFilter
  return _beaconHaloTexture
}

/**
 * 灯塔光束 + 灯光 �?3 模式动画�?
 *
 * �?animateBeam(): lightBeam.js:159-208，逐字保留算法�?
 * 三种模式�?
 *   空闲漫游 �?sin/cos 组合慢扫
 *   滚动归位 �?sp 0�?.40 平滑过渡到目标角�?
 *   白化增强 �?sp�?.40 固定角度 + 强度提升
 *
 * 援引：VolumetricBeamShader 自定�?ShaderMaterial（逐字迁移�?
 */
interface LightBeamProps {
  lighthouseY?: number // 灯泡世界 Y 坐标（默�?-2.5 + 2.96*0.7 �?-0.428�?
}

export default function LightBeam({ lighthouseY = -0.428 }: LightBeamProps) {
  useActorRuntime('beam', true)
  const beamPivotRef = useRef<Group>(null)
  const coneMatsRef = useRef<ShaderMaterial[]>([])
  const rayMatsRef = useRef<LineBasicMaterial[]>([])
  const sourceCoreMatRef = useRef<MeshBasicMaterial | null>(null)
  const sourceHaloMatRef = useRef<SpriteMaterial | null>(null)
  const ptLightRef = useRef<PointLight | null>(null)
  const layer = getWebglLayer('webgl.lightBeam')
  const beaconHaloTex = useMemo(() => getBeaconHaloTexture(), [])

  // Idle animation state（跨帧持久）
  const idleState = useRef({
    wasScrolling: false,
    returnToIdleTime: 0,
    baseBeamAngle: 0,
    idlePhase: 0,
    scrollStartAngle: 0,
    scrollStartAngleX: 0,
  })

  // Beam config（从 buildBeam 逐字保留�?
  const configs = useMemo(() => [
    { radius: 0.5, length: 30, opacity: 0.78, power: 3.15 },
    { radius: 1.75, length: 35, opacity: 0.36, power: 2.0 },
    { radius: 4.9, length: 40, opacity: 0.105, power: 1.3 },
    { radius: 8.6, length: 46, opacity: 0.045, power: 1.02 },
  ], [])

  // Pre-allocated shader args + ray geometry data (avoid inline `new` in JSX)
  const beamUniforms = useMemo(() => configs.map((cfg, i) => ({
    uColor: { value: new Color('#f0f7ff') },
    uOpacity: { value: cfg.opacity },
    uLength: { value: cfg.length },
    uEdgePower: { value: cfg.power },
    uNoiseAmount: { value: i >= 2 ? 0.72 : 0.24 },
    uTime: { value: 0 },
  })), [configs])

  // Cone geometries �?geo.translate(0,-len/2,0) �?tip �?y=0 �?shader lengthFade 1�?
  const coneGeos = useMemo(() => configs.map(cfg => {
    const geo = new ConeGeometry(cfg.radius, cfg.length, 48, 1, true)
    geo.translate(0, -cfg.length / 2, 0)
    return geo
  }), [configs])

  const rayGeomArrays = useMemo(() => [
    new Float32Array([0, 0, 0, -4.5, 0, 55]),
    new Float32Array([0, 0, 0, 4.5, 0, 55]),
  ], [])
  const rayColorArray = useMemo(() => new Float32Array([1, 1, 1, 0.3, 0.3, 0.3]), [])

  // 将材质引用存�?ref，供 useFrame 使用
  const setConeMat = (i: number) => (mat: ShaderMaterial) => {
    if (mat) coneMatsRef.current[i] = mat
  }
  const setRayMat = (i: number) => (mat: LineBasicMaterial) => {
    if (mat) rayMatsRef.current[i] = mat
  }

  // ---- Animation ----
  useFrame((state) => {
    const pivot = beamPivotRef.current
    if (!pivot) return

    const time = state.clock.elapsedTime
    touchActorFrame('beam', Math.round(time * 60), true)
    const sp = useScrollStore.getState().scrollProgress

    // Frame cache guard
    if (time === _lastBeam.time && sp === _lastBeam.sp) return
    _lastBeam.time = time
    _lastBeam.sp = sp

    const is = idleState.current
    const isScrolling = sp > 0.005

    let targetY = 0
    let targetX = 0.08

    if (!isScrolling) {
      // ---- Idle roaming ----
      if (is.wasScrolling) {
        is.wasScrolling = false
        is.returnToIdleTime = time
        is.baseBeamAngle = pivot.rotation.y
        is.idlePhase = is.baseBeamAngle - (time * 0.20 + Math.sin(time * 0.12) * 2.2)
      }

      const elapsed = time - is.returnToIdleTime
      const slow = time * 0.20
      const s1 = Math.sin(time * 0.12) * 2.2
      const s2 = Math.cos(time * 0.41) * 0.5
      const wanderY = slow + s1 + s2
      const pOsc = Math.sin(time * 0.3) * 0.03 + Math.cos(time * 0.67) * 0.015
      const wanderX = 0.06 + pOsc

      if (elapsed < IDLE_RESET_DELAY) {
        const b = Math.min(1, elapsed / IDLE_RESET_DELAY)
        const e = smoothstep(b)
        targetY = is.baseBeamAngle + shortestDelta(is.baseBeamAngle, wanderY + is.idlePhase) * e
        targetX = MathUtils.lerp(pivot.rotation.x, wanderX, e)
      } else {
        targetY = wanderY + is.idlePhase
        targetX = wanderX
      }
    } else if (sp >= TIMELINE.whiteOut.start) {
      // ---- White-out �?snap to home ----
      is.wasScrolling = true
      targetY = 0
      targetX = -0.02
    } else {
      // ---- Scroll homing ----
      if (!is.wasScrolling) {
        is.scrollStartAngle = pivot.rotation.y
        is.scrollStartAngleX = pivot.rotation.x
        is.wasScrolling = true
      }
      const e = smoothstep(sp / TIMELINE.whiteOut.start)
      targetY = is.scrollStartAngle + shortestDelta(is.scrollStartAngle, 0) * e
      targetX = MathUtils.lerp(is.scrollStartAngleX, -0.02, e)
    }

    pivot.rotation.y = targetY
    pivot.rotation.x = targetX

    // ---- Beam intensity ----
    const beamBoost = Math.pow(sp, 1.5) * 0.4
    const wof = clamped(sp, TIMELINE.whiteOut.start, TIMELINE.whiteOut.end)
    const beamFade = Math.max(0, 1.0 - wof)

    coneMatsRef.current.forEach((mat, i) => {
      const baseOpacity = configs[i]?.opacity ?? 0.1
      const boostScale = i >= 2 ? 1.3 : 1.75
      mat.uniforms.uOpacity.value = (baseOpacity + beamBoost * boostScale + wof * 2.35) * beamFade
      mat.uniforms.uTime.value = time
    })
    rayMatsRef.current.forEach((mat) => {
      mat.opacity = (0.45 + sp * 0.34 + wof * 0.9) * beamFade
    })
    const lampPulse = 1 + Math.sin(time * 1.7) * 0.06 + Math.sin(time * 0.63) * 0.035
    if (sourceCoreMatRef.current) {
      sourceCoreMatRef.current.opacity = 1.0 * beamFade
    }
    if (sourceHaloMatRef.current) {
      sourceHaloMatRef.current.opacity = 0.9 * beamFade * lampPulse
    }
    if (ptLightRef.current) {
      ptLightRef.current.intensity = (3.0 + Math.pow(sp, 1.5) * 12 + wof * 50) * beamFade
    }

    // 发布光束世界空间变换�?OceanWaves 读取
    pivot.getWorldPosition(_beamWorldOrigin)
    pivot.getWorldQuaternion(_beamQuat)
    _beamFwd.set(0, 0, 1).applyQuaternion(_beamQuat)
    _beamWorldDirection.copy(_beamFwd)
    setCoreAnchors([
      makeCoreAnchor(beamWorldOriginAnchorId, pointFromVector3(_beamWorldOrigin), 'world', 'beam', beamFade > 0),
      makeCoreAnchor(beamWorldDirectionAnchorId, pointFromVector3(_beamWorldDirection), 'world', 'beam', beamFade > 0),
    ])
  })

  return (
    <>
      {/* 点光�?�?灯塔光束动画，跟�?beamPivot（逐字保留自原 buildLights + animateBeam�?*/}
      <pointLight
        ref={ptLightRef}
        color="#f5fbff"
        intensity={3.0}
        distance={24}
        decay={1.0}
        position={[0, lighthouseY, SCENE_CENTER_Z]}
      />
      <group ref={beamPivotRef} position={[0, lighthouseY, SCENE_CENTER_Z]}>
        {/* 3 个锥体同心光�?�?geo.translate 已将 tip 移至原点 */}
        {configs.map((cfg, i) => (
          <mesh key={`cone-${i}`} rotation={[-Math.PI / 2, 0, 0]} renderOrder={layer.renderOrder}>
            <primitive object={coneGeos[i]} attach="geometry" />
            <shaderMaterial
              ref={setConeMat(i)}
              args={[{
                uniforms: beamUniforms[i],
                vertexShader: VolumetricBeamShader.vertexShader,
                fragmentShader: VolumetricBeamShader.fragmentShader,
                transparent: layer.transparent,
                depthWrite: layer.depthWrite,
                depthTest: layer.depthTest,
                blending: AdditiveBlending,
                side: DoubleSide,
              }]}
            />
          </mesh>
        ))}

        {/* 两根射线 */}
        {[-1, 1].map((dx, i) => (
          <threeLine key={`ray-${i}`} renderOrder={layer.renderOrder}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[rayGeomArrays[i], 3]}
              />
              <bufferAttribute
                attach="attributes-color"
                args={[rayColorArray, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              ref={setRayMat(i)}
              vertexColors
              transparent={layer.transparent}
              opacity={0.45}
              depthWrite={layer.depthWrite}
              depthTest={layer.depthTest}
              blending={AdditiveBlending}
            />
          </threeLine>
        ))}

        {/* 光源辉光 */}
        <group renderOrder={layer.renderOrder}>
          <sprite renderOrder={layer.renderOrder} scale={[2.55, 2.55, 1]}>
            <spriteMaterial
              ref={(mat) => { if (mat) sourceHaloMatRef.current = mat }}
              map={beaconHaloTex}
              color="#f7fbff"
              transparent={layer.transparent}
              opacity={0.9}
              depthWrite={false}
              depthTest={false}
              blending={AdditiveBlending}
            />
          </sprite>

          <mesh renderOrder={layer.renderOrder}>
            <sphereGeometry args={[0.11, 24, 16]} />
            <meshBasicMaterial
              ref={(mat) => { if (mat) sourceCoreMatRef.current = mat }}
              color="#ffffff"
              transparent={layer.transparent}
              opacity={0.9}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      </group>
    </>
  )
}
