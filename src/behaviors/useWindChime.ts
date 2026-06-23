import { clamped, smoothstep } from '../r3f/ScrollRig'

// ============================================================
// Wind Chime — 共享常量与纯函数（Planets/CentralStar/WindChimeLines 共用）
// ============================================================

export const WC_DROP_START = 0.70
export const WC_DROP_END   = 0.80
export const WC_RETRACT_END = 0.90
export const WC_ANCHOR_Y   = 10.0  // 屏幕上方可见区域边缘

/** 计算风铃下落进度 — 纯函数，可逆 */
export function getWindChimeProgress(sp: number): { smoothP: number; active: boolean } {
  const dropFactor    = clamped(sp, WC_DROP_START, WC_DROP_END)
  const retractFactor = clamped(sp, WC_DROP_END, WC_RETRACT_END)
  const active = sp >= WC_DROP_START && sp < WC_RETRACT_END

  let lineProgress: number
  if (sp < WC_DROP_END) {
    lineProgress = dropFactor          // 0→1 下落
  } else if (sp < WC_RETRACT_END) {
    lineProgress = 1.0 - retractFactor // 1→0 回收
  } else {
    lineProgress = 0
  }
  return { smoothP: smoothstep(lineProgress), active }
}
