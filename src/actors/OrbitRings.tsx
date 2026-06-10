import { useMemo } from 'react'
import { SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'

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
          <lineBasicMaterial color="#cbd5e1" transparent opacity={0} depthWrite={false} depthTest />
        </threeLine>
      ))}

      {/* 3 个陀螺仪装饰环 — 使用 RingGeometry 的顶点构建 LineLoop */}
      {gyroConfigs.radii.map((r, g) => {
        const segCount = 96
        const ringVerts = Array.from({ length: segCount + 1 }, (_, i) => {
          const a = (i / segCount) * Math.PI * 2
          return [Math.cos(a) * r, 0, Math.sin(a) * r]
        })

        return (
          <group
            key={`gyro-${g}`}
            position={[0, -1.0, SCENE_CENTER_Z]}
            renderOrder={2}
            rotation={[gyroConfigs.tilts[g].x, 0, gyroConfigs.tilts[g].z]}
          >
            <lineLoop>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array(ringVerts.flat()), 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#cbd5e1" transparent opacity={0} depthWrite={false} depthTest />
            </lineLoop>
          </group>
        )
      })}
    </>
  )
}
