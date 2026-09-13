import { Vector3, type PerspectiveCamera } from 'three'
import { STRUCTURE_LAYOUT } from './structureLayout'
import { smoothstep, SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { createFocusPoseCalculator, focusFieldOfView } from './focusPose'
import type { FocusChannels } from './useFocusTimeline'

/** 时间轴只提供进度；此控制器是相机位置、朝向与 FOV 的唯一写入方。 */
export function createCameraFocusController() {
  const globalPosition = new Vector3(0, 0.25, 8)
  const structurePosition = new Vector3(0, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.cameraZ)
  const structureLookAt = new Vector3(0, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.planeZ)
  const globalLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
  const startPosition = new Vector3()
  const startLookAt = new Vector3()
  const lookAt = globalLookAt.clone()
  const targetPosition = new Vector3()
  const targetLookAt = new Vector3()
  const direction = new Vector3()
  const inward = new Vector3(), side = new Vector3(), above = new Vector3()
  const up = new Vector3(0, 1, 0)
  const star = new Vector3(0, -1, SCENE_CENTER_Z)
  const pose = createFocusPoseCalculator()
  let revision = -1
  let baseFov: number | null = null
  let startFov = 40
  return (camera: PerspectiveCamera, channels: FocusChannels, planet: Vector3 | null, distanceScale = 1, targetRadius = 0, structureProgress = 0) => {
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
      if (channels.target === 'voyager') {
        // 从远离恒星的一侧跟随飞行器，注视点固定为恒星；偏侧量受视口余量约束。
        inward.subVectors(star, planet).normalize()
        side.crossVectors(inward, up).normalize()
        above.crossVectors(side, inward).normalize()
        const phase = Math.PI / 4
        const halfFov = baseFov * Math.PI / 360
        const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect))
        const distance = Math.max(0.7, targetRadius / Math.sin(limitingFov) * 2)
        // 镜头向右上移，主体落在恒星左下；半视角约 50% 留给模型、42% 给偏移。
        const offsetAngle = limitingFov * 0.42
        targetPosition.copy(inward).multiplyScalar(-Math.cos(offsetAngle))
          .addScaledVector(side, Math.cos(phase) * Math.sin(offsetAngle))
          .addScaledVector(above, Math.sin(phase) * Math.sin(offsetAngle))
          .multiplyScalar(distance).add(planet)
        targetLookAt.copy(star)
      } else {
        pose(planet, channels.elapsed, distanceScale, targetPosition, targetLookAt)
        fov = focusFieldOfView(camera.aspect, baseFov)
      }
    } else {
      targetPosition.copy(globalPosition)
      targetLookAt.copy(globalLookAt)
    }
    const progress = channels.mode === 'idle' ? 1 : channels.camera
    camera.position.lerpVectors(startPosition, targetPosition, progress)
    lookAt.lerpVectors(startLookAt, targetLookAt, progress)
    const structure = smoothstep(structureProgress)
    camera.position.lerp(structurePosition, structure)
    lookAt.lerp(structureLookAt, structure)
    camera.lookAt(lookAt)
    camera.layers.set(structure >= 1 ? STRUCTURE_LAYOUT.layer : 0)
    if (structure > 0) camera.layers.enable(STRUCTURE_LAYOUT.layer)
    const sceneFov = startFov + (fov - startFov) * progress
    const nextFov = sceneFov + (STRUCTURE_LAYOUT.fov - sceneFov) * structure
    if (Math.abs(nextFov - camera.fov) > 1e-6) {
      camera.fov = nextFov
      camera.updateProjectionMatrix()
    }
  }
}
