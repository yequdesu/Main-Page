import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { STRUCTURE_LAYOUT } from './structureLayout'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { createStellarTransitionPose, createStellarTransitionState, type StellarTransitionState } from './stellarTransition'
import { createFocusPoseCalculator, focusFieldOfView } from './focusPose'
import type { FocusChannels } from './useFocusTimeline'

/** 时间轴只提供进度；此控制器是相机位置、朝向与 FOV 的唯一写入方。 */
export function createCameraFocusController() {
  const globalPosition = new Vector3(0, 0.25, 8)
  const structurePose = createStellarTransitionPose()
  const idleTransition = createStellarTransitionState()
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
  const front = new Vector3(0, 0, 1)
  const handoffRotation = new Quaternion(), rotation = new Quaternion(), identity = new Quaternion()
  let handoff = false, handoffDistance = 1
  const pose = createFocusPoseCalculator()
  let revision = -1
  let baseFov: number | null = null
  let startFov = 40
  return (camera: PerspectiveCamera, channels: FocusChannels, planet: Vector3 | null, distanceScale = 1, targetRadius = 0, transition: StellarTransitionState = idleTransition) => {
    baseFov ??= camera.fov
    if (revision !== channels.revision) {
      revision = channels.revision
      startPosition.copy(camera.position)
      camera.getWorldDirection(direction)
      handoff = channels.cameraDestination === 'stellar'
      startLookAt.copy(camera.position).addScaledVector(direction, camera.position.distanceTo(handoff ? star : planet ?? globalLookAt))
      startFov = camera.fov
      if (handoff) {
        handoffDistance = startPosition.distanceTo(star)
        handoffRotation.setFromUnitVectors(front, direction.subVectors(startPosition, star).normalize())
      }
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
    const structure = transition.zoom
    const next = structurePose(transition, camera.aspect)
    // 以距离的几何插值控制拉近，避免线性世界位移把绝大部分视觉放大挤到末段。
    const fromDistance = camera.position.distanceTo(next.target)
    const toDistance = next.camera.distanceTo(next.target)
    const ratio = toDistance / Math.max(1e-6, fromDistance)
    const dolly = Math.abs(ratio - 1) < 1e-6 ? structure : (1 - Math.pow(ratio, structure)) / (1 - ratio)
    if (handoff) {
      // 从接管瞬间的近景直接拉近。径向距离单调收敛，方位球面插值，背侧也不穿星。
      rotation.slerpQuaternions(handoffRotation, identity, structure)
      const distance = Math.exp(Math.log(handoffDistance) * (1 - structure) + Math.log(toDistance) * structure)
      camera.position.copy(front).applyQuaternion(rotation).multiplyScalar(distance).add(next.target)
      lookAt.lerpVectors(startLookAt, next.target, structure)
    } else {
      camera.position.lerp(next.camera, dolly)
      lookAt.lerp(next.target, structure)
    }
    camera.lookAt(lookAt)
    camera.layers.set(transition.orbitOpacity <= 0 ? STRUCTURE_LAYOUT.layer : 0)
    if (transition.progress > 0) camera.layers.enable(STRUCTURE_LAYOUT.layer)
    const sceneFov = handoff ? startFov : startFov + (fov - startFov) * progress
    const nextFov = sceneFov + (STRUCTURE_LAYOUT.fov - sceneFov) * structure
    if (Math.abs(nextFov - camera.fov) > 1e-6) {
      camera.fov = nextFov
      camera.updateProjectionMatrix()
    }
    // 已与恒星近景完全重合后交还普通路径；从 Menu 返回时仍抵达轨道全景。
    if (structure >= 1) handoff = false
  }
}
