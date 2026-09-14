import { Vector3 } from 'three'
import { gsap } from 'gsap'
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
  activity: [0.04, 0.32],
  activityDetail: [0.25, 0.45],
  radiation: [0.78, 0.94],
  overlay: [0.92, 1],
} as const

export function createStellarTransitionState() {
  return { progress: 0, zoom: 0, reframe: 0, closeup: 0, orbitOpacity: 1, activity: 0, activityDetail: 0, radiation: 0, overlay: 0, planets: [0, 0, 0] }
}
export type StellarTransitionState = ReturnType<typeof createStellarTransitionState>

const range = (p: number, start: number, end: number) => clamp01((p - start) / (end - start))

/** 欠阻尼弹簧的解析阶跃：较高初速、轻微越位，末段平滑归零；反向 seek 无积分历史。 */
export function stellarArrival(t: number) {
  t = clamp01(t)
  const omega = 9, damping = 0.82, velocity = 4
  const wd = omega * Math.sqrt(1 - damping * damping)
  const residual = Math.exp(-damping * omega * t)
    * (Math.cos(wd * t) + (damping * omega - velocity) / wd * Math.sin(wd * t))
  return 1 - residual * (1 - smoothstep01(range(t, 0.8, 1)))
}

/** 转场的全部阶段由真实 GSAP Timeline 编排；唯一输入是页面映射后的播放位置。 */
export function createStellarTransitionTimeline(out: StellarTransitionState) {
  const duration = STELLAR_TRANSITION.duration
  // GSAP 的目标缓存留在内部，公开通道只包含数值；新实例的初值不依赖旧播放位置。
  const values = createStellarTransitionState()
  const keys = ['progress', 'zoom', 'reframe', 'closeup', 'orbitOpacity', 'activity', 'activityDetail', 'radiation', 'overlay'] as const
  const timeline = gsap.timeline({ paused: true, defaults: { lazy: false, immediateRender: false } })
  let disposed = false
  timeline.fromTo(values, { progress: 0 }, { progress: 1, duration, ease: 'none' }, 0)
  const channel = (key: Exclude<keyof StellarTransitionState, 'progress' | 'planets'>,
    bounds: readonly [number, number], label: string, from = 0, to = 1) => {
    const start = bounds[0] * duration
    timeline.addLabel(label, start)
      .fromTo(values, { [key]: from }, { [key]: to, duration: (bounds[1] - bounds[0]) * duration, ease: smoothstep01 }, label)
  }
  channel('zoom', STELLAR_TRANSITION.zoom, 'stellar:approach')
  channel('reframe', STELLAR_TRANSITION.reframe, 'stellar:reframe')
  channel('closeup', STELLAR_TRANSITION.closeup, 'stellar:closeup')
  channel('orbitOpacity', STELLAR_TRANSITION.orbitExit, 'orbits:exit', 1, 0)
  channel('activity', STELLAR_TRANSITION.activity, 'activity:reveal')
  channel('activityDetail', STELLAR_TRANSITION.activityDetail, 'activity:resolve')
  channel('radiation', STELLAR_TRANSITION.radiation, 'radiation:reveal')
  channel('overlay', STELLAR_TRANSITION.overlay, 'menu:reveal')
  STELLAR_TRANSITION.planetStarts.forEach((start, i) => {
    const label = `menu:planet:${i}`
    timeline.addLabel(label, start * duration)
      .fromTo(values.planets, { [i]: 0 }, { [i]: 1, duration: STELLAR_TRANSITION.planetDuration * duration, ease: stellarArrival }, label)
  })
  timeline.addLabel('menu:ready', duration)
  return {
    timeline,
    seek(progress: number) {
      // 不通过回调发业务事件；反向/跳转只改变通道，不重启日珥与 CME。
      if (!disposed) {
        timeline.totalTime(clamp01(progress) * duration, true)
        for (const key of keys) out[key] = values[key]
        for (let i = 0; i < 3; i++) out.planets[i] = values.planets[i]
      }
      return out
    },
    dispose() { disposed = true; timeline.kill() },
  }
}

/** 一次性离线取样入口；运行时持有 Timeline，不逐帧重建。 */
export function sampleStellarTransition(progress: number, out: StellarTransitionState) {
  const controller = createStellarTransitionTimeline(out)
  try { return controller.seek(progress) } finally { controller.dispose() }
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
