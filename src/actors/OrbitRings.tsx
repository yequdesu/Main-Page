import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type LineBasicMaterial } from 'three'
import { SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT, clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import OrbitalRing from './OrbitalRing'
import type { OrbitalRingConfig } from '../types'

/**
 * 行星轨道系统 — 3 条静态轨道参考线 + N 条陀螺仪装饰环。
 *
 * 陀螺仪环配置全部声明在这里，新增轨道只需在 GYRO_RINGS 数组中加一项。
 *
 * 原 act3.build():1144-1188
 */

// ============================================================
// 陀螺仪环配置（方案 A：类 Kuiper 带）
// 遵循 Ngo & Lissauer (2016) ē ≈ (1–2)·ī 统计关系
// ============================================================
const GYRO_RINGS: OrbitalRingConfig[] = [
  { radius: 7.8,  inclination: 0.12, eccentricity: 0.15, speed: 0.02, phase: 0 },
  { radius: 9.4,  inclination: 0.22, eccentricity: 0.30, speed: 0.04, phase: Math.PI / 3 },
  { radius: 11.0, inclination: 0.38, eccentricity: 0.50, speed: 0.06, phase: 2 * Math.PI / 3 },
]

interface OrbitRingsProps {
  /** 全局进动速度缩放，默认 1.0；设为 0 可冻结全部环 */
  speedScale?: number
}

export default function OrbitRings({ speedScale = 1.0 }: OrbitRingsProps) {
  // 轨道环顶点（静态 — 行星公转轨道的视觉参考线）
  const orbitPoints = useMemo(() =>
    Array.from({ length: ORBIT_COUNT }, (_, t) => {
      const r = ORBIT_RADII[t]
      return Array.from({ length: 129 }, (_, i) => {
        const theta = (i / 128) * Math.PI * 2
        return [Math.cos(theta) * r, 0, Math.sin(theta) * r] as const
      })
    }), [],
  )

  const orbitMatRefs = useRef<(LineBasicMaterial | null)[]>([null, null, null])

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    orbitMatRefs.current.forEach((mat) => {
      if (mat) mat.opacity = smooth3 * 0.35
    })
  })

  return (
    <>
      {/* 静态轨道参考线（行星公转轨道） */}
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

      {/* 陀螺仪装饰环（每条独立力学模拟） */}
      {GYRO_RINGS.map((cfg, i) => (
        <OrbitalRing key={`gyro-${i}`} config={cfg} speedScale={speedScale} />
      ))}
    </>
  )
}
