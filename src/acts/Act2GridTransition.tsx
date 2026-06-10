import { useFrame } from '@react-three/fiber'
import { useFrameCache } from '../behaviors/useFrameCache'

/**
 * Act 2 "GridTransition" — 网格过渡。
 *
 * GridLines actor 后续 Task 添加。
 *
 * 援引：R3F visible prop 模式
 */
interface Act2Props {
  visible: boolean
  scrollProgress: number
}

export default function Act2GridTransition({ visible, scrollProgress: _sp }: Act2Props) {
  const { shouldSkipSp } = useFrameCache()

  useFrame((_, _delta) => {
    if (!visible) return
    if (shouldSkipSp(_sp)) return
    // TODO: animate vertical grid
  })

  if (!visible) return null

  return <group>{/* GridLines 将在后续 Task 添加 */}</group>
}
