import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group } from 'three'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import OrbitLineMaterial from './OrbitLineMaterial'
import type { OrbitalRingConfig } from '../types'

/**
 * 单条外层进动轨道线 — 有序圆周折线与轨道面运动。
 *
 * ## 变换链
 *
 * ```text
 * R_y(Ω) · S_x(1/√(1−e²)) · R_x(π/2 − i)
 * ```
 *
 * - **倾角 i**：轨道面与黄道面 (X-Z) 的固定夹角，不随时间变化
 * - **偏心率 e**：X 轴非均匀拉伸（正圆 → 椭圆），内层 group 的 scale
 * - **进动 Ω**：外层 group 绕 Y 轴（黄道面法线）旋转，倾角恒常
 *
 * 环面法线 n = (sin(i)·sin(Ω), −cos(i), sin(i)·cos(Ω))，与 Y 夹角恒为 i。
 *
 * ## Props
 *
 * - `config` — 轨道参数（半径、倾角、偏心率、速度、相位等）
 * - `speedScale` — 全局进动速度缩放，默认 1.0
 *
 * ## 复用
 *
 * 要新增轨道环，只需在父级的配置数组中添加一个 `OrbitalRingConfig` 对象。
 *
 * 援引：Murray & Dermott, _Solar System Dynamics_, §2.8 (orbital elements)
 */

interface OrbitalRingProps {
  config: OrbitalRingConfig
  /** 全局进动速度缩放，默认 1.0；设为 0 冻结 */
  speedScale?: number
  /** 覆盖 config.color，用于 day/night 主题切换 */
  color?: string
  /** 随轨道面进动的对象；挂在拉伸组之外，避免模型被非均匀缩放。 */
  children?: ReactNode
}

export default function OrbitalRing({ config, speedScale = 1.0, color: colorOverride, children }: OrbitalRingProps) {
  const layer = getWebglLayer('webgl.grid')
  const {
    radius,
    inclination,
    eccentricity,
    speed,
    phase,
    color: configColor = '#cbd5e1',
    maxOpacity = 0.28,
    segments = 256,
  } = config

  const stretchX = 1 / Math.sqrt(1 - eccentricity * eccentricity)
  const segmentCount = Math.max(3, Math.floor(segments))
  const positions = useMemo(() => {
    // LineLoop 按顶点顺序连线并自动闭合；不能使用 RingGeometry 的三角面索引。
    const points = new Float32Array(segmentCount * 3)
    for (let i = 0; i < segmentCount; i++) {
      const theta = (i / segmentCount) * Math.PI * 2
      points[i * 3] = Math.cos(theta) * radius
      points[i * 3 + 1] = Math.sin(theta) * radius
    }
    return points
  }, [radius, segmentCount])

  // 外层 group — Y 轴进动（黄道面法线）
  const outerGroupRef = useRef<Group>(null)
  useFrame((_state, delta) => {
    // 进动（时间驱动）
    if (outerGroupRef.current) {
      outerGroupRef.current.rotation.y += delta * speed * speedScale
    }
  }, -0.75)

  return (
    <group
      ref={outerGroupRef}
      position={[0, -1.0, SCENE_CENTER_Z]}
      rotation={[0, phase, 0]}
      renderOrder={layer.renderOrder}
    >
      <group
        rotation={[Math.PI / 2 - inclination, 0, 0]}
        scale={[stretchX, 1, 1]}
      >
        <lineLoop renderOrder={layer.renderOrder}>
          {/* 参数变化时重建几何体，避免沿用旧包围体；资源由 R3F 管理释放。 */}
          <bufferGeometry key={`${radius}:${segmentCount}`}>
            <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          </bufferGeometry>
          <OrbitLineMaterial
            color={colorOverride ?? configColor}
            maxOpacity={maxOpacity}
            appearStart={TIMELINE.act3Shift.start}
          />
        </lineLoop>
      </group>
      {children}
    </group>
  )
}
