import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type BufferGeometry, type LineBasicMaterial } from 'three'
import { SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import { themeColor } from '../theme/colors'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import OrbitalRing from './OrbitalRing'
import { getAct3VisualAlpha } from '../behaviors/act3TerminalLayout'
import { GYRO_RINGS } from '../behaviors/orbitGeometry'

/**
 * 行星轨道系统 �?3 条静态轨道参考线 + N 条陀螺仪装饰环�?
 *
 * 陀螺仪环配置全部声明在这里，新增轨道只需�?GYRO_RINGS 数组中加一项�?
 *
 * �?act3.build():1144-1188
 */

// ============================================================
// 陀螺仪环配置（方案 A：类 Kuiper 带）
// 遵循 Ngo & Lissauer (2016) ē �?(1�?)·ī 统计关系
// ============================================================
interface OrbitRingsProps {
  /** 全局进动速度缩放，默�?1.0；设�?0 可冻结全部环 */
  speedScale?: number
}

export default function OrbitRings({ speedScale = 1.0 }: OrbitRingsProps) {
  useActorRuntime('orbits', true)
  const dayNight = useScrollStore(s => s.dayNight)
  const orbitColor = themeColor('orbit', dayNight)
  const layer = getWebglLayer('webgl.grid')

  // 轨道环顶点（静�?�?行星公转轨道的视觉参考线�?
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
  const orbitGeometryRefs = useRef<(BufferGeometry | null)[]>([null, null, null])

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    touchActorFrame('orbits', Math.round(performance.now()), sp >= TIMELINE.squareAct3Crossfade.start)
    const reveal = getAct3VisualAlpha(sp)

    orbitMatRefs.current.forEach((mat, index) => {
      const geometry = orbitGeometryRefs.current[index]
      const pointCount = geometry?.getAttribute('position').count ?? 0
      geometry?.setDrawRange(0, pointCount)
      if (mat) mat.opacity = reveal * 0.35
    })
  })

  return (
    <>
      {/* 静态轨道参考线（行星公转轨道） */}
      {orbitPoints.map((pts, t) => (
        <threeLine key={`orbit-${t}`} position={[0, -1.0, SCENE_CENTER_Z]} renderOrder={layer.renderOrder}>
          <bufferGeometry ref={(geometry) => { orbitGeometryRefs.current[t] = geometry as BufferGeometry }}>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(pts.flat()), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            ref={(mat) => { orbitMatRefs.current[t] = mat }}
            color={orbitColor}
            transparent={layer.transparent}
            opacity={0}
            depthWrite={layer.depthWrite}
            depthTest={layer.depthTest}
          />
        </threeLine>
      ))}

      {/* 陀螺仪装饰环（每条独立力学模拟�?*/}
      {GYRO_RINGS.map((cfg, i) => (
        <OrbitalRing
          key={`gyro-${i}`}
          config={cfg}
          speedScale={speedScale}
          color={orbitColor}
        />
      ))}
    </>
  )
}
