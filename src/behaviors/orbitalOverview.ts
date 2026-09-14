import { SCROLL_RIG } from '../types'
import { smoothProgress } from '../composition/timeline'
import { FOCUS_PLANET_SCALE } from './useFocusTimeline'

/** 随外环扩张按比例拉远全景；前幕相机保持原位。 */
export function orbitalOverviewScale(sp: number) {
  return 1 + (SCROLL_RIG.OUTER_ORBIT_RADII[2] / 11 - 1) * smoothProgress('act3Shift', sp)
}

/** 抵消拉远与原距离缩放共同造成的二次缩小；聚焦时交还既有 0.6 倍外观。 */
export function overviewPlanetCompensation(sp: number, planetScale: number) {
  const globalWeight = Math.max(0, Math.min(1, (planetScale - FOCUS_PLANET_SCALE) / (1 - FOCUS_PLANET_SCALE)))
  return 1 + (orbitalOverviewScale(sp) ** 2 - 1) * globalWeight
}
