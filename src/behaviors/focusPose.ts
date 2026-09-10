import { Quaternion, Vector3 } from 'three'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

// 绕“行星 → 恒星”轴的起始相位：相机从已有俯视角开始，后续抬升为原速度的 1/4。
export const FOCUS_INITIAL_PHASE = 0.9
export const FOCUS_ORBIT_SPEED = 0.006
// 聚焦增加 8° 垂直视野余量；窄屏再保留最低水平视野，容纳完整附件。
export function focusFieldOfView(aspect: number, baseFov: number) {
  return 2 * Math.atan(Math.tan((baseFov + 8) * Math.PI / 360) * Math.max(1, 1.35 / Math.max(0.1, aspect))) * 180 / Math.PI
}

/** 相机与轨道调相器共用目标姿态，保留原来的距离、侧向偏移和注视点。 */
export function createFocusPoseCalculator() {
  const star = new Vector3(0, -1, SCENE_CENTER_Z)
  const up = new Vector3(0, 1, 0)
  const inward = new Vector3()
  const side = new Vector3()
  const offset = new Vector3()
  const rotation = new Quaternion()
  return (planet: Vector3, elapsed: number, distanceScale: number, position: Vector3, lookAt: Vector3) => {
    inward.subVectors(star, planet).normalize()
    side.crossVectors(up, inward).normalize()
    lookAt.copy(planet).addScaledVector(inward, 0.9)
    offset.copy(inward).multiplyScalar(-2.5 * distanceScale - 0.9)
      .addScaledVector(side, 2.2 * distanceScale)
    rotation.setFromAxisAngle(inward, FOCUS_INITIAL_PHASE + elapsed * FOCUS_ORBIT_SPEED)
    position.copy(lookAt).add(offset.applyQuaternion(rotation))
  }
}
