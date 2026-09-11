import { useMemo, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type PerspectiveCamera } from 'three'
import { useFocusAnimation } from '../r3f/FocusAnimationContext'
import { voyagerState } from '../actors/voyagerState'
import OrbitRings from '../actors/OrbitRings'
import { useScrollStore } from '../stores/scrollStore'
import { createCameraFocusController } from '../behaviors/useCameraFocus'
import { _planetWorldPositions, _planetFocusDistanceScales } from '../actors/Planets'

/**
 * Act 3 "ContentPhase" — 轨道环、相机聚焦。
 * 标签由 App.tsx 中的 FloatingLabels 统一管理。
 */
interface Act3Props {
  visible: boolean
}

const Act3ContentPhase = memo(function Act3ContentPhase({ visible }: Act3Props) {
  const { camera } = useThree()
  const updateCameraFocus = useMemo(createCameraFocusController, [])

  const focusChannels = useFocusAnimation()

  useFrame(() => {
    const { structureProgress } = useScrollStore.getState()

    const trackIdx = focusChannels.track
    if (focusChannels.target === 'voyager') {
      updateCameraFocus(camera as PerspectiveCamera, focusChannels, voyagerState.available ? voyagerState.position : null, 1, voyagerState.radius, structureProgress)
    } else {
      updateCameraFocus(camera as PerspectiveCamera, focusChannels, _planetWorldPositions[trackIdx] ?? null, _planetFocusDistanceScales[trackIdx] ?? 1, 0, structureProgress)
    }
  })

  return (
    <group visible={visible}>
      <OrbitRings />
    </group>
  )
})

export default Act3ContentPhase
