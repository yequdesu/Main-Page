import { useFrame } from '@react-three/fiber'
import Lighthouse from '../actors/Lighthouse'
import LightBeam from '../actors/LightBeam'
import { useFrameCache } from '../behaviors/useFrameCache'

/**
 * Act 1 "OceanVoyage" — 暗色海洋、灯塔、光束、粒子。
 *
 * 组装：Lighthouse + LightBeam（OceanWaves 和 DustField 后续 Task 添加）。
 * 通过 visible prop 控制，始终挂载。
 *
 * 援引：R3F visible prop 模式 — Performance Pitfalls
 */
interface Act1Props {
  visible: boolean
  scrollProgress: number
}

export default function Act1OceanVoyage({ visible, scrollProgress: _sp }: Act1Props) {
  const { shouldSkip } = useFrameCache()

  useFrame((state, delta) => {
    if (!visible) return
    const time = state.clock.elapsedTime
    if (shouldSkip(time, _sp)) return
    // TODO: add ocean waves + dust animation via behaviors
  })

  if (!visible) return null

  return (
    <group>
      <Lighthouse />
      <LightBeam />
    </group>
  )
}
