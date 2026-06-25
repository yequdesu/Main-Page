import { useCallback, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type PerspectiveCamera, Vector3 } from 'three'
import OrbitRings from '../actors/OrbitRings'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { updateCameraFocus } from '../behaviors/useCameraFocus'
import { readPlanetWorldByParticleIndex, vector3FromPoint } from '../composition/coreAnchors'

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
    const point = readPlanetWorldByParticleIndex(particleIdx)
    return point ? vector3FromPoint(point, new Vector3()) : null
  }, [])

  useFrame((state, _delta) => {
    if (!visible) return
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const progress = clamped(sp, TIMELINE.act3Shift.start, 1.0)
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
