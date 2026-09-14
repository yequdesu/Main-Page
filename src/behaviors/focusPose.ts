import { Quaternion, Vector3 } from 'three'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

// 保留抬高起点；环绕在入焦期间平滑加速，靠近结束后仍持续运镜。
export const FOCUS_INITIAL_PHASE = 0.9
export const FOCUS_ORBIT_START_SPEED = 0.006
export const FOCUS_ORBIT_SPEED = 0.012
export const FOCUS_ORBIT_RAMP_DURATION = 3
// 注视点略向恒星前移，为持续抬升后的远侧附件保留上缘余量。
export const FOCUS_LOOK_AHEAD = 1.05

/** 跟随点沿公转方向稍慢：渐入差速，软限制累计落后角，避免目标持续出画。 */
export const FOCUS_FOLLOW = { speedGap: 0.00225, ramp: 3, maxLag: 0.08 } as const

export function focusFollowLag(elapsed: number) {
  const t = Math.max(0, elapsed)
  const u = Math.min(1, t / FOCUS_FOLLOW.ramp)
  const travel = FOCUS_FOLLOW.ramp * (u ** 3 - 0.5 * u ** 4) + Math.max(0, t - FOCUS_FOLLOW.ramp)
  return FOCUS_FOLLOW.maxLag * Math.tanh(FOCUS_FOLLOW.speedGap * travel / FOCUS_FOLLOW.maxLag)
}

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

/** 相机与轨道调相器共用目标姿态，围绕略滞后的跟随点保留距离与侧向偏移。 */
export function createFocusPoseCalculator() {
  const star = new Vector3(0, -1, SCENE_CENTER_Z)
  const up = new Vector3(0, 1, 0)
  const inward = new Vector3()
  const side = new Vector3()
  const offset = new Vector3()
  const rotation = new Quaternion()
  const anchor = new Vector3()
  return (planet: Vector3, elapsed: number, distanceScale: number, position: Vector3, lookAt: Vector3) => {
    const phase = focusOrbitPhase(elapsed)
    const radius = Math.hypot(planet.x - star.x, planet.z - star.z)
    const radialDistance = radius + 2.5 * distanceScale
    // 轴向抬升会缩短水平侧移，改变相机绕恒星的方位角。
    // 补偿这部分角差，确保最终相机（而非仅跟随点）的公转角速度略慢。
    const initialBearing = Math.atan2(2.2 * distanceScale * Math.cos(FOCUS_INITIAL_PHASE), radialDistance)
    const bearing = Math.atan2(2.2 * distanceScale * Math.cos(phase), radialDistance)
    const lag = focusFollowLag(elapsed) + initialBearing - bearing
    // 当前行星绕 XZ 平面的负极角方向运行；Y 轴负旋转让跟随点落在其后方。
    anchor.copy(planet).sub(star).applyAxisAngle(up, -lag).add(star)
    inward.subVectors(star, anchor).normalize()
    side.crossVectors(up, inward).normalize()
    // 注视点也随滞后点运动，否则重新对准真实行星会抵消画面中的相对公转。
    lookAt.copy(anchor).addScaledVector(inward, FOCUS_LOOK_AHEAD)
    offset.copy(inward).multiplyScalar(-2.5 * distanceScale - FOCUS_LOOK_AHEAD)
      .addScaledVector(side, 2.2 * distanceScale)
    rotation.setFromAxisAngle(inward, phase)
    position.copy(lookAt).add(offset.applyQuaternion(rotation))
  }
}
