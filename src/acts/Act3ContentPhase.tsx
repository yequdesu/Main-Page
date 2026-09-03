import { useCallback, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { type PerspectiveCamera, Vector3 } from 'three'
import AsteroidBelts from '../actors/AsteroidBelts'
import OrbitRings from '../actors/OrbitRings'
import { useScrollStore } from '../stores/scrollStore'
import { useFrameCache } from '../behaviors/useFrameCache'
import { smoothstep, clamped, SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { updateCameraFocus } from '../behaviors/useCameraFocus'
import { readPlanetWorldByParticleIndex, readPlanetWorldPoint, vector3FromPoint } from '../composition/coreAnchors'
import { useScreenProjection } from '../behaviors/useScreenProjection'
import { renderLusionAtmosphereFrame } from '../actors/lusionAtmosphereBridge'

const _viewDir = new Vector3()
const _starWorld = new Vector3()
const _planetWorld = new Vector3()

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Act 3 "ContentPhase" �?轨道环、相机聚焦�?
 * 标签�?App.tsx 中的 FloatingLabels 统一管理�?
 */
interface Act3Props {
  visible: boolean
}

const Act3ContentPhase = memo(function Act3ContentPhase({ visible }: Act3Props) {
  const { camera } = useThree()
  const { shouldSkip } = useFrameCache()
  const { project } = useScreenProjection()

  const getPlanetPosition = useCallback((particleIdx: number): Vector3 | null => {
    const point = readPlanetWorldByParticleIndex(particleIdx)
    return point ? vector3FromPoint(point, new Vector3()) : null
  }, [])

  useFrame((state, _delta) => {
    if (!visible) {
      renderLusionAtmosphereFrame({ active: false, alpha: 0, time: state.clock.elapsedTime })
      return
    }
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    if (shouldSkip(time, sp)) return

    const progress = clamped(sp, TIMELINE.act3Shift.start, 1.0)
    const alpha = smoothstep(progress)
    updateCameraFocus(camera as PerspectiveCamera, sp, time, getPlanetPosition)
    project()
    _starWorld.set(0, -1, SCENE_CENTER_Z)
    ;(camera as PerspectiveCamera).getWorldDirection(_viewDir)
    const starDepth = _starWorld.sub(camera.position).dot(_viewDir)
    const occluderWeights = [0, 0, 0] as [number, number, number]
    for (let trackIdx = 0; trackIdx < 3; trackIdx++) {
      const point = readPlanetWorldPoint(trackIdx)
      if (!point) continue
      const planetDepth = vector3FromPoint(point, _planetWorld).sub(camera.position).dot(_viewDir)
      occluderWeights[trackIdx] = smoothstepNumber(-0.12, 0.28, starDepth - planetDepth)
    }
    renderLusionAtmosphereFrame({
      active: useScrollStore.getState().volumeLightEnabled &&
        sp >= TIMELINE.act3Shift.start - 0.01 &&
        alpha > 0.002,
      alpha,
      time,
      occluderWeights,
    })
  })

  return (
    <group visible={visible}>
      <OrbitRings />
      <AsteroidBelts />
    </group>
  )
})

export default Act3ContentPhase
