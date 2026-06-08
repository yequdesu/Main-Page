import { WHITE_OUT_THRESHOLD, GRID_SHIFT_START } from '../constants.js'

export const act2 = {
  name: 'GridTransition',
  start: WHITE_OUT_THRESHOLD,
  end: GRID_SHIFT_START,
  build(ctx) {
    // grid 对象已由 gridLines layer 创建
  },
  exit(ctx) {},
  animate(time, tSp, sp, ctx) {
    // 所有网格动画已在 animateVerticalGrid 中处理
  },
  dispose(ctx) {}
}
