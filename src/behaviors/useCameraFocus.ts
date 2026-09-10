import { Vector3, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z, GRID_SHIFT_START, FOCUS_TIMEOUT } from '../r3f/ScrollRig'

import { createFocusPoseCalculator, focusFieldOfView } from './focusPose'

/** 每个场景独占相机平滑状态；每次聚焦从固定的抬高姿态开始，30 秒后平滑返回全局。 */
export function createCameraFocusController() {
  const defaultCamPos = new Vector3(0, 0.25, 8)
  const defaultLookAt = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
  const targetCamPos = defaultCamPos.clone()
  const targetLookAt = defaultLookAt.clone()
  const currentLookAt = defaultLookAt.clone()
  const camOffset = new Vector3()
  const axisPoint = new Vector3()
  const viewDirection = new Vector3()
  const focusPose = createFocusPoseCalculator()
  let activeIdx = -1
  let lastTime: number | null = null
  let baseFov: number | null = null

  return function updateCameraFocus(
    camera: PerspectiveCamera,
    sp: number,
    time: number,
    getPlanetPosition: (idx: number) => Vector3 | null,
    focusDistanceScale = 1,
  ): void {
    // 保留原 60fps 的双层平滑速度；长时间挂起后避免一次跳到目标。
    const delta = lastTime === null ? 1 / 60 : Math.min(0.1, Math.max(0, time - lastTime))
    baseFov ??= camera.fov
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
        // 新请求从实际相机姿态衔接，环绕时间归零，不沿用上一轮的目标位置。
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
        focusPose(planet, elapsed, focusDistanceScale, camOffset, axisPoint)
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
    const targetFov = planet ? focusFieldOfView(camera.aspect, baseFov) : baseFov
    if (Math.abs(targetFov - camera.fov) > 1e-6) {
      camera.fov += (targetFov - camera.fov) * targetAlpha
      camera.updateProjectionMatrix()
    }
  }
}
