import { useFrame } from '@react-three/fiber'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react'
import { SCENE_CENTER_Z, ORBIT_RADII, ORBIT_COUNT } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import { themeColor } from '../theme/colors'
import OrbitalRing from './OrbitalRing'
import OrbitLineMaterial from './OrbitLineMaterial'
import type { OrbitalRingConfig } from '../types'

const VoyagerOrbiter = lazy(() => import('./VoyagerOrbiter'))

// GLB/解码器加载失败只隐藏该探测器，轨道与主场景继续工作；重进 Act 3 可重建边界。
class VoyagerLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { console.error('Voyager model failed to load', error) }
  render() { return this.state.failed ? null : this.props.children }
}

/**
 * 行星轨道系统 — 3 条静态轨道参考线 + N 条进动装饰环，最外环承载 Voyager。
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
  useActorRuntime('orbits', true)
  const layer = getWebglLayer('webgl.grid')
  useFrame(state => touchActorFrame('orbits', Math.round(state.clock.elapsedTime * 60), useScrollStore.getState().scrollProgress >= TIMELINE.orbitGlow.start))
  const dayNight = useScrollStore(s => s.dayNight)
  const orbitColor = themeColor('orbit', dayNight)
  const showVoyager = useScrollStore(s => s.scrollProgress >= TIMELINE.act3Shift.start)

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

  return (
    <>
      {/* 静态轨道参考线（行星公转轨道） */}
      {orbitPoints.map((pts, t) => (
        <threeLine key={`orbit-${t}`} position={[0, -1.0, SCENE_CENTER_Z]} renderOrder={layer.renderOrder}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(pts.flat()), 3]}
            />
          </bufferGeometry>
          <OrbitLineMaterial color={orbitColor} maxOpacity={0.35} appearStart={TIMELINE.orbitGlow.start} trackIdx={t} />
        </threeLine>
      ))}

      {/* 陀螺仪装饰环（每条独立力学模拟） */}
      {GYRO_RINGS.map((cfg, i) => (
        <OrbitalRing key={`gyro-${i}`} config={cfg} speedScale={speedScale} color={orbitColor}>
          {i === GYRO_RINGS.length - 1 && showVoyager && (
            <VoyagerLoadBoundary>
              <Suspense fallback={null}>
                <VoyagerOrbiter config={cfg} speedScale={speedScale} />
              </Suspense>
            </VoyagerLoadBoundary>
          )}
        </OrbitalRing>
      ))}
    </>
  )
}
