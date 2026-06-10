import { useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type PerspectiveCamera, Vector3 } from 'three'
import OrbitRings from '../actors/OrbitRings'
import CentralStar from '../actors/CentralStar'
import PlanetLabel from '../actors/PlanetLabel'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { updateCameraFocus } from '../behaviors/useCameraFocus'
import { _planetWorldPositions } from '../actors/DustField'
import { PLANET_LINKS } from '../types'

/**
 * Act 3 "ContentPhase" — 轨道环、中央恒星、相机聚焦。
 *
 * 援引：R3F useThree — 访问 camera 实例（官方 API）
 */
interface Act3Props {
  visible: boolean
}

export default function Act3ContentPhase({ visible }: Act3Props) {
  const { camera } = useThree()
  const { shouldSkip } = useFrameCache()

  const getPlanetPosition = useCallback((idx: number): Vector3 | null => {
    return _planetWorldPositions[idx] || null
  }, [])

  useFrame((state, _delta) => {
    if (!visible) return
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smoothProgress = smoothstep(progress)

    // Camera focus
    updateCameraFocus(camera as PerspectiveCamera, sp, time, getPlanetPosition)

    // Animate orbit rings opacity based on smoothProgress
    // (OrbitRings + CentralStar have their own useFrame for detailed animation)
    void smoothProgress
  })

  return (
    <group visible={visible}>
      <OrbitRings />
      <CentralStar />
      {PLANET_LINKS.map((link, i) => (
        <PlanetLabel
          key={`label-${i}`}
          trackIdx={i}
          planetData={link}
          getWorldPosition={getPlanetPosition}
        />
      ))}
    </group>
  )
}
