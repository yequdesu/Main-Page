import { GRID_START } from '../constants.js'

export const act1 = {
  name: 'OceanVoyage',
  start: 0.00,
  end: GRID_START,
  build(ctx) {
    // 共享层已在 LighthouseScene.vue onMounted 中统一 build
  },
  exit(ctx) {
    // 不需要保存状态快照——ctx 的值由动画管线独立计算
  },
  animate(time, tSp, sp, ctx) {
    if (ctx.beamPivot && !ctx.beamPivot.visible && sp < 0.55) {
      ctx.beamPivot.visible = true
    }
    if (ctx._ptLightRef && ctx._ptLightRef.intensity === 0) {
      ctx._ptLightRef.intensity = 3.0
    }
  },
  dispose(ctx) {}
}
