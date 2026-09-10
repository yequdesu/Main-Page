import { Vector3, type PerspectiveCamera } from 'three'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { createFocusPoseCalculator, focusFieldOfView } from './focusPose'
import type { FocusChannels } from './useFocusTimeline'

/** 时间轴只提供进度；此控制器是相机位置、朝向与 FOV 的唯一写入方。 */
export function createCameraFocusController() {
  const globalPosition = new Vector3(0, 0.25, 8)
  const globalLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
  const startPosition = new Vector3()
  const startLookAt = new Vector3()
  const lookAt = globalLookAt.clone()
  const targetPosition = new Vector3()
  const targetLookAt = new Vector3()
  const direction = new Vector3()
  const pose = createFocusPoseCalculator()
  let revision = -1
  let baseFov: number | null = null
  let startFov = 40
  return (camera: PerspectiveCamera, channels: FocusChannels, planet: Vector3 | null, distanceScale = 1) => {
    baseFov ??= camera.fov
    if (revision !== channels.revision) {
      revision = channels.revision
      startPosition.copy(camera.position)
      camera.getWorldDirection(direction)
      startLookAt.copy(camera.position).addScaledVector(direction, camera.position.distanceTo(planet ?? globalLookAt))
      startFov = camera.fov
    }
    let fov = baseFov
    if (channels.mode === 'focus' && planet) {
      pose(planet, channels.elapsed, distanceScale, targetPosition, targetLookAt)
      fov = focusFieldOfView(camera.aspect, baseFov)
    } else {
      targetPosition.copy(globalPosition)
      targetLookAt.copy(globalLookAt)
    }
    const progress = channels.mode === 'idle' ? 1 : channels.camera
    camera.position.lerpVectors(startPosition, targetPosition, progress)
    lookAt.lerpVectors(startLookAt, targetLookAt, progress)
    camera.lookAt(lookAt)
    const nextFov = startFov + (fov - startFov) * progress
    if (Math.abs(nextFov - camera.fov) > 1e-6) {
      camera.fov = nextFov
      camera.updateProjectionMatrix()
    }
  }
}
