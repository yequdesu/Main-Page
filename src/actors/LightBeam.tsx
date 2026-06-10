import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Color, ConeGeometry, SphereGeometry, BufferGeometry, Vector3, BufferAttribute, ShaderMaterial, MeshBasicMaterial, AdditiveBlending, DoubleSide, LineBasicMaterial, AmbientLight, PointLight, MathUtils, type Mesh, type Line } from 'three'
import { VolumetricBeamShader } from '../shaders/VolumetricBeamShader'
import { useScrollStore } from '../stores/scrollStore'
import { smoothstep, clamped, SCENE_CENTER_Z, WHITE_OUT_THRESHOLD, WHITE_OUT_END, IDLE_RESET_DELAY } from '../r3f/ScrollRig'

// shortestDelta — 角度最短路径差（逐字保留自原 lightBeam.js）
function shortestDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// 预分配（跨帧复用）
const _lastBeam = { time: -1, sp: -1 }

/**
 * 灯塔光束 + 灯光 — 3 模式动画。
 *
 * 原 animateBeam(): lightBeam.js:159-208，逐字保留算法。
 * 三种模式：
 *   空闲漫游 — sin/cos 组合慢扫
 *   滚动归位 — sp 0→0.40 平滑过渡到目标角度
 *   白化增强 — sp≥0.40 固定角度 + 强度提升
 *
 * 援引：VolumetricBeamShader 自定义 ShaderMaterial（逐字迁移）
 */
interface LightBeamProps {
  lighthouseY?: number // 灯泡世界 Y 坐标（默认 -2.5 + 2.96*0.7 ≈ -0.428）
}

export default function LightBeam({ lighthouseY = -0.428 }: LightBeamProps) {
  const beamPivotRef = useRef<Group>(null)
  const coneMatsRef = useRef<ShaderMaterial[]>([])
  const rayMatsRef = useRef<LineBasicMaterial[]>([])
  const glowMatRef = useRef<MeshBasicMaterial | null>(null)
  const ptLightRef = useRef<PointLight | null>(null)

  // Idle animation state（跨帧持久）
  const idleState = useRef({
    wasScrolling: false,
    returnToIdleTime: 0,
    baseBeamAngle: 0,
    idlePhase: 0,
    scrollStartAngle: 0,
    scrollStartAngleX: 0,
  })

  // Beam config（从 buildBeam 逐字保留）
  const configs = useMemo(() => [
    { radius: 0.5, length: 28, opacity: 0.85, power: 4.0 },
    { radius: 1.8, length: 32, opacity: 0.45, power: 2.5 },
    { radius: 4.8, length: 36, opacity: 0.15, power: 1.5 },
  ], [])

  // Pre-allocated shader args + ray geometry data (avoid inline `new` in JSX)
  const beamUniforms = useMemo(() => configs.map(cfg => ({
    uColor: { value: new Color('#f0f7ff') },
    uOpacity: { value: cfg.opacity },
    uLength: { value: cfg.length },
    uEdgePower: { value: cfg.power },
  })), [configs])

  const rayGeomArrays = useMemo(() => [
    new Float32Array([0, 0, 0, -4.5, 0, 55]),
    new Float32Array([0, 0, 0, 4.5, 0, 55]),
  ], [])
  const rayColorArray = useMemo(() => new Float32Array([1, 1, 1, 0.3, 0.3, 0.3]), [])

  // 将材质引用存入 ref，供 useFrame 使用
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
    } else if (sp >= WHITE_OUT_THRESHOLD) {
      // ---- White-out — snap to home ----
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
      const e = smoothstep(sp / WHITE_OUT_THRESHOLD)
      targetY = is.scrollStartAngle + shortestDelta(is.scrollStartAngle, 0) * e
      targetX = MathUtils.lerp(is.scrollStartAngleX, -0.02, e)
    }

    pivot.rotation.y = targetY
    pivot.rotation.x = targetX

    // ---- Beam intensity ----
    const beamBoost = Math.pow(sp, 1.5) * 0.4
    const wof = clamped(sp, WHITE_OUT_THRESHOLD, WHITE_OUT_END)
    const beamFade = Math.max(0, 1.0 - wof)

    const baseVals = [0.85, 0.45, 0.15]
    coneMatsRef.current.forEach((mat, i) => {
      mat.uniforms.uOpacity.value = (baseVals[i] + beamBoost * (i === 2 ? 1.8 : 1.2) + wof * 1.5) * beamFade
    })
    rayMatsRef.current.forEach((mat) => {
      mat.opacity = (0.45 + sp * 0.35 + wof * 0.5) * beamFade
    })
    if (glowMatRef.current) {
      glowMatRef.current.opacity = 0.95 * beamFade
    }
    if (ptLightRef.current) {
      ptLightRef.current.intensity = (3.0 + Math.pow(sp, 1.5) * 12 + wof * 50) * beamFade
    }
  })

  return (
    <>
      {/* 环境光 + 方向光 + 点光源（逐字保留自原 buildLights()） */}
      <ambientLight color="#222d3d" intensity={1.4} />
      <directionalLight color="#aed2ff" intensity={1.8} position={[15, 10, -10]} />
      <directionalLight color="#ffffff" intensity={0.5} position={[-15, 12, -35]} />
      <pointLight
        ref={ptLightRef}
        color="#ffffff"
        intensity={3.0}
        distance={15}
        decay={1.0}
        position={[0, lighthouseY, SCENE_CENTER_Z]}
      />

      <group ref={beamPivotRef} position={[0, lighthouseY, SCENE_CENTER_Z]}>
        {/* 3 个锥体同心光束 */}
        {configs.map((cfg, i) => (
          <mesh key={`cone-${i}`} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
            <coneGeometry args={[cfg.radius, cfg.length, 32, 1, true]} />
            <shaderMaterial
              ref={setConeMat(i)}
              args={[{
                uniforms: beamUniforms[i],
                vertexShader: VolumetricBeamShader.vertexShader,
                fragmentShader: VolumetricBeamShader.fragmentShader,
                transparent: true,
                depthWrite: false,
                blending: AdditiveBlending,
                side: DoubleSide,
              }]}
            />
          </mesh>
        ))}

        {/* 两根射线 */}
        {[-1, 1].map((dx, i) => (
          <threeLine key={`ray-${i}`} renderOrder={0}>
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
              transparent
              opacity={0.45}
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </threeLine>
        ))}

        {/* 光源辉光 */}
        <mesh renderOrder={0}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshBasicMaterial
            ref={(mat) => { if (mat) glowMatRef.current = mat }}
            color="#ffffff"
            transparent
            opacity={0.95}
          />
        </mesh>
      </group>
    </>
  )
}
