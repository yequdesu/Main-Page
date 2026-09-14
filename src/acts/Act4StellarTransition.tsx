import { useFrame } from '@react-three/fiber'
import { sampleStellarTransition } from '../behaviors/stellarTransition'
import { useStellarTransition } from '../r3f/StellarTransitionContext'
import { useScrollStore } from '../stores/scrollStore'

/** 共享滚动时间轴的 Act 4 播放层；反向及直接跳转时也采样，不按可见性提前退出。 */
export default function Act4StellarTransition() {
  const channels = useStellarTransition()
  useFrame(() => sampleStellarTransition(useScrollStore.getState().structureProgress, channels), -30)
  return null
}
