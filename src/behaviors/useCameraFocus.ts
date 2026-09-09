import { Vector3, Quaternion, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z, GRID_SHIFT_START, FOCUS_TIMEOUT } from '../r3f/ScrollRig'

const FOCUS_ORBIT_SPEED = 0.024 // radians / second

/** 每个场景独占相机平滑状态；每次聚焦从零相位开始，30 秒后平滑返回全局。 */
export function createCameraFocusController() {
  const defaultCamPos = new Vector3(0, 0.25, 8)
  const defaultLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
  const targetCamPos = defaultCamPos.clone()
  const targetLookAt = defaultLookAt.clone()
  const currentLookAt = defaultLookAt.clone()
  const camOffset = new Vector3()
  const camToStar = new Vector3()
  const camLeft = new Vector3()
  const camUp = new Vector3(0, 1, 0)
  const starPos = new Vector3(0, -1, SCENE_CENTER_Z)
  const axisPoint = new Vector3()
  const baseOffset = new Vector3()
  const viewDirection = new Vector3()
  const orbitQuat = new Quaternion()
  let activeIdx = -1
  let lastTime: number | null = null

  return function updateCameraFocus(
    camera: PerspectiveCamera,
    sp: number,
    time: number,
    getPlanetPosition: (idx: number) => Vector3 | null,
    focusDistanceScale = 1,
  ): void {
    // 保留原 60fps 的双层平滑速度；长时间挂起后避免一次跳到目标。
    const delta = lastTime === null ? 1 / 60 : Math.min(0.1, Math.max(0, time - lastTime))
    lastTime = time
    const targetAlpha = 1 - Math.pow(1 - 0.04, delta * 60)
    const cameraAlpha = 1 - Math.pow(1 - 0.06, delta * 60)
    const store = useScrollStore.getState()
    let planet = sp >= GRID_SHIFT_START && store.focusedPlanetIdx >= 0
      ? getPlanetPosition(store.focusedPlanetIdx) : null

    if (planet) {
      let startedAt = store.focusStartTime
      if (startedAt === null || activeIdx !== store.focusedPlanetIdx) {
        startedAt = time
        store.setFocusStartTime(time)
        activeIdx = store.focusedPlanetIdx
        // 新请求从实际相机姿态衔接，环绕相位归零，不沿用上一轮的目标位置。
        targetCamPos.copy(camera.position)
        camera.getWorldDirection(viewDirection)
        currentLookAt.copy(camera.position).addScaledVector(viewDirection, camera.position.distanceTo(planet))
        targetLookAt.copy(currentLookAt)
      }
      const elapsed = Math.max(0, time - startedAt)
      if (elapsed >= FOCUS_TIMEOUT) {
        store.clearFocus()
        planet = null
      } else {
        camToStar.subVectors(starPos, planet).normalize()
        camLeft.crossVectors(camUp, camToStar).normalize()
        axisPoint.copy(planet).addScaledVector(camToStar, 0.9)
        orbitQuat.setFromAxisAngle(camToStar, elapsed * FOCUS_ORBIT_SPEED)
        camOffset.copy(planet)
          .addScaledVector(camToStar, -2.5 * focusDistanceScale)
          .addScaledVector(camLeft, 2.2 * focusDistanceScale)
        baseOffset.subVectors(camOffset, axisPoint).applyQuaternion(orbitQuat)
        camOffset.copy(axisPoint).add(baseOffset)
        targetCamPos.lerp(camOffset, targetAlpha)
        targetLookAt.lerp(axisPoint, targetAlpha)
      }
    }

    if (!planet) {
      if (useScrollStore.getState().focusedPlanetIdx >= 0) store.clearFocus()
      activeIdx = -1
      targetCamPos.lerp(defaultCamPos, targetAlpha)
      targetLookAt.lerp(defaultLookAt, targetAlpha)
    }
    currentLookAt.lerp(targetLookAt, cameraAlpha)
    camera.position.lerp(targetCamPos, cameraAlpha)
    camera.lookAt(currentLookAt)
  }
}
