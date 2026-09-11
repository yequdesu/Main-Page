import { Quaternion, Vector3 } from 'three'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

// 保留抬高起点；环绕在入焦期间平滑加速，靠近结束后仍持续运镜。
export const FOCUS_INITIAL_PHASE = 0.9
export const FOCUS_ORBIT_START_SPEED = 0.006
export const FOCUS_ORBIT_SPEED = 0.012
export const FOCUS_ORBIT_RAMP_DURATION = 3
// 注视点略向恒星前移，为持续抬升后的远侧附件保留上缘余量。
export const FOCUS_LOOK_AHEAD = 1.05

/** 对 smoothstep 速度解析积分；镜头和构图预测共同消费时间轴 elapsed。 */
export function focusOrbitPhase(elapsed: number) {
  const t = Math.max(0, elapsed)
  const rampTime = Math.min(t, FOCUS_ORBIT_RAMP_DURATION)
  const u = rampTime / FOCUS_ORBIT_RAMP_DURATION
  const integral = u * u * u - 0.5 * u * u * u * u
  return FOCUS_INITIAL_PHASE + FOCUS_ORBIT_START_SPEED * rampTime
    + (FOCUS_ORBIT_SPEED - FOCUS_ORBIT_START_SPEED) * FOCUS_ORBIT_RAMP_DURATION * integral
    + FOCUS_ORBIT_SPEED * Math.max(0, t - FOCUS_ORBIT_RAMP_DURATION)
}
// 聚焦增加 8° 垂直视野余量；窄屏再保留最低水平视野，容纳完整附件。
export function focusFieldOfView(aspect: number, baseFov: number) {
  return 2 * Math.atan(Math.tan((baseFov + 8) * Math.PI / 360) * Math.max(1, 1.35 / Math.max(0.1, aspect))) * 180 / Math.PI
}

/** 相机与轨道调相器共用目标姿态，保持固定距离与侧向偏移。 */
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
    lookAt.copy(planet).addScaledVector(inward, FOCUS_LOOK_AHEAD)
    offset.copy(inward).multiplyScalar(-2.5 * distanceScale - FOCUS_LOOK_AHEAD)
      .addScaledVector(side, 2.2 * distanceScale)
    rotation.setFromAxisAngle(inward, focusOrbitPhase(elapsed))
    position.copy(lookAt).add(offset.applyQuaternion(rotation))
  }
}
