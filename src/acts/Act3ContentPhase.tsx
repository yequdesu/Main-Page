import { useCallback, useMemo, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type PerspectiveCamera, Vector3 } from 'three'
import OrbitRings from '../actors/OrbitRings'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { createCameraFocusController } from '../behaviors/useCameraFocus'
import { _planetWorldPositions, _mainPlanetIndices, _planetFocusDistanceScales } from '../actors/Planets'

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
  const updateCameraFocus = useMemo(createCameraFocusController, [])

  const getPlanetPosition = useCallback((particleIdx: number): Vector3 | null => {
    const trackIdx = _mainPlanetIndices.indexOf(particleIdx)
    if (trackIdx === -1) return null
    return _planetWorldPositions[trackIdx] || null
  }, [])

  useFrame((state, _delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const trackIdx = _mainPlanetIndices.indexOf(useScrollStore.getState().focusedPlanetIdx)
    updateCameraFocus(camera as PerspectiveCamera, sp, time, getPlanetPosition, _planetFocusDistanceScales[trackIdx] ?? 1)
  })

  return (
    <group visible={visible}>
      <OrbitRings />
    </group>
  )
})

export default Act3ContentPhase
