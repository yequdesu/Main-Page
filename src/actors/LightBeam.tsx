import { useRef, useEffect, useMemo } from 'react'
import { type Group, type Mesh, type Line, Color, ConeGeometry, SphereGeometry, BufferGeometry, Vector3, BufferAttribute, ShaderMaterial, AdditiveBlending, DoubleSide, LineBasicMaterial } from 'three'
import { VolumetricBeamShader } from '../shaders/VolumetricBeamShader'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

/**
 * 灯塔光束 — 3 个 Cone + 2 个 Ray + Glow。
 *
 * 原 buildLightBeam():368-407，逐字保留几何参数。
 * beamPivot 位置 = lighthouseGroup.position + Y偏移
 *
 * 援引：VolumetricBeamShader 自定义 ShaderMaterial（当前代码逐字迁移）
 */
interface LightBeamProps {
  lighthouseY?: number  // 灯泡世界 Y 坐标（默认 -2.5 + 2.96*0.7 ≈ -0.428）
}

export default function LightBeam({ lighthouseY = -0.428 }: LightBeamProps) {
  const beamPivotRef = useRef<Group>(null)

  // Beam config（从 buildLightBeam 逐字保留）
  const configs = useMemo(() => [
    { radius: 0.5,  length: 28, opacity: 0.85, power: 4.0 },
    { radius: 1.8,  length: 32, opacity: 0.45, power: 2.5 },
    { radius: 4.8,  length: 36, opacity: 0.15, power: 1.5 },
  ], [])

  return (
    <group ref={beamPivotRef} position={[0, lighthouseY, SCENE_CENTER_Z]}>
      {/* 3 个锥体同心光束 */}
      {configs.map((cfg, i) => (
        <mesh key={`cone-${i}`} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
          <coneGeometry args={[cfg.radius, cfg.length, 32, 1, true]} />
          <shaderMaterial
            args={[{
              uniforms: {
                uColor: { value: new Color('#f0f7ff') },
                uOpacity: { value: cfg.opacity },
                uLength: { value: cfg.length },
                uEdgePower: { value: cfg.power },
              },
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
              args={[new Float32Array([0, 0, 0, dx * 4.5, 0, 55]), 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[new Float32Array([1, 1, 1, 0.3, 0.3, 0.3]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
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
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </mesh>
    </group>
  )
}
