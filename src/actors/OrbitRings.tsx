import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group, type LineBasicMaterial } from 'three'
import { SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT, clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

/**
 * 轨道环 + 陀螺仪装饰环。
 *
 * 原 act3.build():1144-1188。
 * 3 条圆形轨道（Line）+ 3 个倾斜陀螺仪环（LineLoop of RingGeometry）
 *
 * 援引：R3F <line> + bufferGeometry（手动构建顶点）
 */
export default function OrbitRings() {
  // 轨道环顶点
  const orbitPoints = useMemo(() =>
    Array.from({ length: ORBIT_COUNT }, (_, t) => {
      const r = ORBIT_RADII[t]
      return Array.from({ length: 129 }, (_, i) => {
        const theta = (i / 128) * Math.PI * 2
        return [Math.cos(theta) * r, 0, Math.sin(theta) * r] as const
      })
    }), [],
  )

  // 陀螺仪环配置
  const gyroConfigs = useMemo(() => ({
    radii: [7.8, 9.4, 11.0] as const,
    tilts: [
      { x: Math.PI / 2 + 0.25, z: 0.35 },
      { x: Math.PI / 2 - 0.30, z: -0.40 },
      { x: Math.PI / 2 + 0.55, z: 0.15 },
    ],
    speeds: [0.08, 0.13, 0.18],
  }), [])

  // ---- Animation refs ----
  const orbitMatRefs = useRef<(LineBasicMaterial | null)[]>([null, null, null])
  const gyroMatRefs = useRef<(LineBasicMaterial | null)[]>([null, null, null])
  const gyroGroupRefs = useRef<(Group | null)[]>([null, null, null])

  useFrame((_state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    // Orbit rings: 0.35 (逐字保留自原 act3.animate)
    orbitMatRefs.current.forEach((mat) => {
      if (mat) mat.opacity = smooth3 * 0.35
    })

    // Gyro rings: rotation + 0.28 opacity (逐字保留自原 act3.animate)
    gyroGroupRefs.current.forEach((group, i) => {
      if (group) group.rotation.y += delta * gyroConfigs.speeds[i] * 0.96
    })
    gyroMatRefs.current.forEach((mat) => {
      if (mat) mat.opacity = smooth3 * 0.28
    })
  })

  return (
    <>
      {/* 3 条轨道线 */}
      {orbitPoints.map((pts, t) => (
        <threeLine key={`orbit-${t}`} position={[0, -1.0, SCENE_CENTER_Z]} renderOrder={2}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(pts.flat()), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial ref={(mat) => { orbitMatRefs.current[t] = mat }} color="#cbd5e1" transparent opacity={0} depthWrite={false} depthTest />
        </threeLine>
      ))}

      {/* 3 个陀螺仪装饰环 — RingGeometry (r-0.04, r) 逐字保留自原 act3.build() */}
      {gyroConfigs.radii.map((r, g) => (
        <group
          key={`gyro-${g}`}
          ref={(el) => { gyroGroupRefs.current[g] = el }}
          position={[0, -1.0, SCENE_CENTER_Z]}
          renderOrder={2}
          rotation={[gyroConfigs.tilts[g].x, 0, gyroConfigs.tilts[g].z]}
        >
          <lineLoop>
            <ringGeometry args={[r - 0.04, r, 96]} />
            <lineBasicMaterial ref={(mat) => { gyroMatRefs.current[g] = mat }} color="#cbd5e1" transparent opacity={0} depthWrite={false} depthTest />
          </lineLoop>
        </group>
      ))}
    </>
  )
}
