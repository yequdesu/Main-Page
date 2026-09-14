import { Vector3 } from 'three'
import { SCROLL_RIG } from '../types'
import { clamp01, smoothstep01 } from '../composition/timeline'
import { CENTRAL_STAR_CORE_RADIUS } from '../actors/assets/centralStar'
import { getStructureLayout, STRUCTURE_LAYOUT } from './structureLayout'

/** Act 4 的局部时间轴，单位为归一化滚动进度；按钮以 6.8 秒播放同一条轴。 */
export const STELLAR_TRANSITION = {
  duration: 6.8,
  zoom: [0, 0.42],
  reframe: [0.42, 0.78],
  closeup: [0.06, 0.42],
  orbitExit: [0, 0.24],
  planetStarts: [0.70, 0.77, 0.84],
  planetDuration: 0.16,
  activity: [0.78, 0.94],
  overlay: [0.92, 1],
} as const

export function createStellarTransitionState() {
  return { progress: 0, zoom: 0, reframe: 0, closeup: 0, orbitOpacity: 1, activity: 0, overlay: 0, planets: [0, 0, 0] }
}
export type StellarTransitionState = ReturnType<typeof createStellarTransitionState>

const range = (p: number, start: number, end: number) => clamp01((p - start) / (end - start))
const eased = (p: number, bounds: readonly [number, number]) => smoothstep01(range(p, ...bounds))

/** 欠阻尼弹簧的解析阶跃：较高初速、轻微越位，末段平滑归零；反向 seek 无积分历史。 */
export function stellarArrival(t: number) {
  t = clamp01(t)
  const omega = 9, damping = 0.82, velocity = 4
  const wd = omega * Math.sqrt(1 - damping * damping)
  const residual = Math.exp(-damping * omega * t)
    * (Math.cos(wd * t) + (damping * omega - velocity) / wd * Math.sin(wd * t))
  return 1 - residual * (1 - smoothstep01(range(t, 0.8, 1)))
}

/** 唯一转场采样器；只覆写 Canvas 内的通道，不写 store、不另起 ticker。 */
export function sampleStellarTransition(progress: number, out: StellarTransitionState) {
  const p = out.progress = clamp01(progress)
  out.zoom = eased(p, STELLAR_TRANSITION.zoom)
  out.reframe = eased(p, STELLAR_TRANSITION.reframe)
  out.closeup = eased(p, STELLAR_TRANSITION.closeup)
  out.orbitOpacity = 1 - eased(p, STELLAR_TRANSITION.orbitExit)
  out.activity = eased(p, STELLAR_TRANSITION.activity)
  out.overlay = eased(p, STELLAR_TRANSITION.overlay)
  for (let i = 0; i < 3; i++) {
    out.planets[i] = stellarArrival(range(p, STELLAR_TRANSITION.planetStarts[i], STELLAR_TRANSITION.planetStarts[i] + STELLAR_TRANSITION.planetDuration))
  }
  return out
}

/** 以恒星半径归一化，重构图时共同变换恒星、镜头与活动层，避免换模型或穿过球面。 */
export function createStellarTransitionPose() {
  let aspect = -1, layout = getStructureLayout(1)
  const result = { star: new Vector3(), camera: new Vector3(), target: new Vector3(), scale: 1, structureScale: 1 }
  return (state: StellarTransitionState, nextAspect: number) => {
    if (aspect !== nextAspect) { aspect = nextAspect; layout = getStructureLayout(Math.max(0.01, aspect)) }
    const q = state.reframe
    const finalScale = layout.sunRadius / CENTRAL_STAR_CORE_RADIUS
    const closeDistance = CENTRAL_STAR_CORE_RADIUS / Math.sin(Math.atan(0.56 * Math.min(1, aspect) * Math.tan(STRUCTURE_LAYOUT.fov * Math.PI / 360)))
    const finalDistance = STRUCTURE_LAYOUT.cameraZ - STRUCTURE_LAYOUT.planeZ
    result.scale = Math.exp(Math.log(finalScale) * q)
    result.structureScale = result.scale / finalScale
    const distance = (closeDistance + (finalDistance / finalScale - closeDistance) * q) * result.scale
    const cameraZ = SCROLL_RIG.SCENE_CENTER_Z + closeDistance
    result.camera.set(0, -1 + (STRUCTURE_LAYOUT.centerY + 1) * q, cameraZ + (STRUCTURE_LAYOUT.cameraZ - cameraZ) * q)
    result.star.set(layout.sunX * result.structureScale * q, result.camera.y, result.camera.z - distance)
    result.target.set(0, result.star.y, result.star.z)
    return result
  }
}
