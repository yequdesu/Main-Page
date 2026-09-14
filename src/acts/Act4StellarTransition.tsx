import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { useCameraMotion } from '../r3f/CameraMotionContext'
import { useScrollStore } from '../stores/scrollStore'

/** 共享滚动时间轴的 Act 4 播放层；反向及直接跳转时也采样，不按可见性提前退出。 */
export default function Act4StellarTransition() {
  const { coordinator } = useCameraMotion()
  useEffect(() => coordinator.attachStellar(), [coordinator])
  useFrame(() => coordinator.seekStellar(useScrollStore.getState().structureProgress), -30)
  return null
}
