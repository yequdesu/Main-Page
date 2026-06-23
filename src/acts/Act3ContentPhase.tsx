import { useCallback, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type PerspectiveCamera, Vector3 } from 'three'
import OrbitRings from '../actors/OrbitRings'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { updateCameraFocus } from '../behaviors/useCameraFocus'
import { _planetWorldPositions, _mainPlanetIndices } from '../actors/Planets'

/**
 * Act 3 "ContentPhase" — 轨道环、相机聚焦。
 * 标签由 App.tsx 中的 FloatingLabels 统一管理。
 */
interface Act3Props {
  visible: boolean
}

const Act3ContentPhase = memo(function Act3ContentPhase({ visible }: Act3Props) {
  const { camera } = useThree()
  const { shouldSkip } = useFrameCache()

  const getPlanetPosition = useCallback((particleIdx: number): Vector3 | null => {
    const trackIdx = _mainPlanetIndices.indexOf(particleIdx)
    if (trackIdx === -1) return null
    return _planetWorldPositions[trackIdx] || null
  }, [])

  useFrame((state, _delta) => {
    if (!visible) return
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const progress = clamped(sp, GRID_SHIFT_START, 1.0)
    void smoothstep(progress)
    updateCameraFocus(camera as PerspectiveCamera, sp, time, getPlanetPosition)
  })

  return (
    <group visible={visible}>
      <OrbitRings />
    </group>
  )
})

export default Act3ContentPhase
