import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { type Group, type LineBasicMaterial } from 'three'
import { SCENE_CENTER_Z, clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import type { OrbitalRingConfig } from '../types'

/**
 * 单条轨道环 — 行星轨道面力学模拟。
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
}

export default function OrbitalRing({ config, speedScale = 1.0 }: OrbitalRingProps) {
  const {
    radius,
    innerRadius = radius - 0.04,
    inclination,
    eccentricity,
    speed,
    phase,
    color = '#cbd5e1',
    maxOpacity = 0.28,
    segments = 96,
  } = config

  const stretchX = 1 / Math.sqrt(1 - eccentricity * eccentricity)

  // 外层 group — Y 轴进动（黄道面法线）
  const outerGroupRef = useRef<Group>(null)
  // 环材质 — 透明度由 scroll 驱动
  const matRef = useRef<LineBasicMaterial>(null)

  useFrame((_state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)

    // 透明度（scroll 驱动）
    if (matRef.current) {
      matRef.current.opacity = smooth3 * maxOpacity
    }

    // 进动（时间驱动）
    if (outerGroupRef.current) {
      outerGroupRef.current.rotation.y += delta * speed * speedScale
    }
  })

  return (
    <group
      ref={outerGroupRef}
      position={[0, -1.0, SCENE_CENTER_Z]}
      rotation={[0, phase, 0]}
      renderOrder={2}
    >
      <group
        rotation={[Math.PI / 2 - inclination, 0, 0]}
        scale={[stretchX, 1, 1]}
      >
        <lineLoop renderOrder={2}>
          <ringGeometry args={[innerRadius, radius, segments]} />
          <lineBasicMaterial
            ref={matRef}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest
          />
        </lineLoop>
      </group>
    </group>
  )
}
