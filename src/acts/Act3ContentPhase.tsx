import { readPlanetWorldPoint, vector3FromPoint } from '../composition/coreAnchors'
import { PLANET_FOCUS_DISTANCE_SCALES } from '../types'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { TIMELINE } from '../composition/timeline'
import { useMemo, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { useFocusAnimation } from '../r3f/FocusAnimationContext'
import { voyagerState } from '../actors/voyagerState'
import OrbitRings from '../actors/OrbitRings'
import { useScrollStore } from '../stores/scrollStore'
import { createCameraFocusController } from '../behaviors/useCameraFocus'

/**
 * Act 3 "ContentPhase" — 轨道环、相机聚焦。
 * 标签由 App.tsx 中的 FloatingLabels 统一管理。
 */
interface Act3Props {
  visible: boolean
}

const Act3ContentPhase = memo(function Act3ContentPhase({ visible }: Act3Props) {
  useActorRuntime('cameraFocus', visible)
  const planetPosition = useMemo(() => new Vector3(), [])
  const { camera } = useThree()
  const updateCameraFocus = useMemo(createCameraFocusController, [])

  const focusChannels = useFocusAnimation()

  useFrame(state => {
    touchActorFrame('cameraFocus', Math.round(state.clock.elapsedTime * 60), useScrollStore.getState().scrollProgress >= TIMELINE.act3Shift.start)
    const { structureProgress } = useScrollStore.getState()

    const trackIdx = focusChannels.track
    if (focusChannels.target === 'voyager') {
      updateCameraFocus(camera as PerspectiveCamera, focusChannels, voyagerState.available ? voyagerState.position : null, 1, voyagerState.radius, structureProgress)
    } else {
      const point = readPlanetWorldPoint(trackIdx)
      updateCameraFocus(camera as PerspectiveCamera, focusChannels, point ? vector3FromPoint(point, planetPosition) : null, PLANET_FOCUS_DISTANCE_SCALES[trackIdx] ?? 1, 0, structureProgress)
    }
  })

  return (
    <group visible={visible}>
      <OrbitRings />
    </group>
  )
})

export default Act3ContentPhase
