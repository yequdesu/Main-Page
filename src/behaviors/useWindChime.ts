import { clamped, SCENE_CENTER_Z, smoothstep } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import type { WorldPoint } from '../composition/coreAnchors'

export const WC_DROP_START = TIMELINE.windChimeDrop.start
export const WC_DROP_END = TIMELINE.windChimeDrop.end
export const WC_RETRACT_END = TIMELINE.windChimeRetract.end
export const WC_ANCHOR_Y = 10.0
export const WC_TARGET_Y = -1.0
export const WC_CAMERA_PULL_Z = 6

const WIND_CHIME_PLANET_BASE_POINTS: readonly WorldPoint[] = [
  { x: -2.35, y: WC_TARGET_Y, z: SCENE_CENTER_Z - 2.8 },
  { x: 2.1, y: WC_TARGET_Y, z: SCENE_CENTER_Z - 4.6 },
  { x: 3.8, y: WC_TARGET_Y, z: SCENE_CENTER_Z - 5.25 },
]

export function getWindChimeProgress(sp: number): { smoothP: number; active: boolean } {
  const dropFactor = clamped(sp, WC_DROP_START, WC_DROP_END)
  const retractFactor = clamped(sp, WC_DROP_END, WC_RETRACT_END)
  const active = sp >= WC_DROP_START && sp < WC_RETRACT_END

  let lineProgress: number
  if (sp < WC_DROP_END) {
    lineProgress = dropFactor
  } else if (sp < WC_RETRACT_END) {
    lineProgress = 1.0 - retractFactor
  } else {
    lineProgress = 0
  }

  return { smoothP: smoothstep(lineProgress), active }
}

export function getWindChimeLineEndY(smoothP: number): number {
  return WC_ANCHOR_Y + (WC_TARGET_Y - WC_ANCHOR_Y) * smoothP
}

export function getWindChimeCenterPoint(smoothP: number): WorldPoint {
  return {
    x: 0,
    y: WC_TARGET_Y,
    z: SCENE_CENTER_Z + WC_CAMERA_PULL_Z * smoothP,
  }
}

export function getWindChimePlanetPoint(trackIdx: number, smoothP: number): WorldPoint {
  const base = WIND_CHIME_PLANET_BASE_POINTS[trackIdx] ?? WIND_CHIME_PLANET_BASE_POINTS[0]
  return {
    x: base.x,
    y: base.y,
    z: base.z + WC_CAMERA_PULL_Z * smoothP,
  }
}
