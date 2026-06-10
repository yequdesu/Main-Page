import { useFrame } from '@react-three/fiber'
import OrbitRings from '../actors/OrbitRings'
import CentralStar from '../actors/CentralStar'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, GRID_SHIFT_START } from '../r3f/ScrollRig'

/**
 * Act 3 "ContentPhase" — 轨道环、中央恒星。
 *
 * DustField 同时存在于 Act 1 和 Act 3（过渡跟随），不在 Act 3 中重复创建。
 * Planet labels 和对焦交互在 DustField 内部处理。
 *
 * 援引：R3F visible prop 模式
 */
interface Act3Props {
  visible: boolean
}

export default function Act3ContentPhase({ visible }: Act3Props) {
  const { shouldSkip } = useFrameCache()

  useFrame((state, _delta) => {
    if (!visible) return
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smoothProgress = smoothstep(progress)

    // Animate orbit rings opacity
    // Animate gyro ring rotation
    // Star pulse - all in their own useFrame or orchestrated here
    void smoothProgress // placeholder for now
  })

  if (!visible) return null

  return (
    <group>
      <OrbitRings />
      <CentralStar />
    </group>
  )
}
