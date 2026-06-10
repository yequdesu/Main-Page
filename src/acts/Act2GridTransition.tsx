import { memo } from 'react'
import { useFrame } from '@react-three/fiber'
import GridLines from '../actors/GridLines'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'

/**
 * Act 2 "GridTransition" — 网格过渡。
 *
 * 组装：GridLines
 * 援引：R3F visible prop 模式
 */
interface Act2Props {
  visible: boolean
}

const Act2GridTransition = memo(function Act2GridTransition({ visible }: Act2Props) {
  const { shouldSkipSp } = useFrameCache()

  useFrame((_state, _delta) => {
    if (!visible) return
    const sp = useScrollStore.getState().scrollProgress
    if (shouldSkipSp(sp)) return
    // GridLines has its own useFrame — this is for coordination
  })

  return (
    <group visible={visible}>
      <GridLines />
    </group>
  )
})

export default Act2GridTransition
