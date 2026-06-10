import { useFrame } from '@react-three/fiber'
import OrbitRings from '../actors/OrbitRings'
import CentralStar from '../actors/CentralStar'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'

/**
 * Act 3 "ContentPhase" — 轨道环、中央恒星、行星、标签。
 *
 * 援引：R3F visible prop 模式
 */
interface Act3Props {
  visible: boolean
  scrollProgress: number
}

export default function Act3ContentPhase({ visible, scrollProgress: sp }: Act3Props) {
  const { shouldSkip } = useFrameCache()

  useFrame((state, _delta) => {
    if (!visible) return
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    // 计算 Act 3 进度
    const progress = Math.max(0, Math.min(1, (sp - GRID_SHIFT_START) / (1.0 - GRID_SHIFT_START)))
    const smoothProgress = smoothstep(progress)

    // TODO: animate orbit lines, gyro rings, star pulse, labels via behaviors
  })

  if (!visible) return null

  return (
    <group>
      <OrbitRings />
      <CentralStar />
      {/* Planet labels + DustField planets 将在后续 Task 添加 */}
    </group>
  )
}
