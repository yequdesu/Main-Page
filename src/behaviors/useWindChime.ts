import { clamped, SCENE_CENTER_Z, smoothstep } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import type { WorldPoint } from '../composition/coreAnchors'

export const WC_DROP_START = TIMELINE.windChimeDrop.start
export const WC_DROP_END = TIMELINE.windChimeDrop.end
export const WC_RETRACT_END = TIMELINE.windChimeRetract.end
export const WC_ANCHOR_Y = 10.0
export const WC_TARGET_Y = -1.0
export const WC_CAMERA_PULL_Z = 6
export const WC_LINE_SEGMENTS = 14

const WIND_CHIME_PLANET_COUNT = 3
const WIND_CHIME_PLANET_MIN_DISTANCE = 2.25
const WIND_CHIME_PLANET_MIN_CENTER_DISTANCE = 2.65
const WIND_CHIME_PLANET_MIN_X_GAP = 1.15
const WIND_CHIME_LAYOUT_RETRY = 120
const WIND_CHIME_X_RANGE = [-4.35, 4.35] as const
const WIND_CHIME_Z_OFFSET_RANGE = [-4.85, 2.85] as const

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function distanceXZ(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function isValidWindChimePoint(candidate: WorldPoint, points: WorldPoint[]): boolean {
  const centerDistance = Math.hypot(candidate.x, candidate.z - SCENE_CENTER_Z)
  if (centerDistance < WIND_CHIME_PLANET_MIN_CENTER_DISTANCE) return false

  return points.every((point) => (
    distanceXZ(candidate, point) >= WIND_CHIME_PLANET_MIN_DISTANCE &&
    Math.abs(candidate.x - point.x) >= WIND_CHIME_PLANET_MIN_X_GAP
  ))
}

function createWindChimePlanetBasePoints(): readonly WorldPoint[] {
  const points: WorldPoint[] = []
  for (let i = 0; i < WIND_CHIME_LAYOUT_RETRY && points.length < WIND_CHIME_PLANET_COUNT; i++) {
    const candidate = {
      x: randomBetween(WIND_CHIME_X_RANGE[0], WIND_CHIME_X_RANGE[1]),
      y: WC_TARGET_Y,
      z: SCENE_CENTER_Z + randomBetween(WIND_CHIME_Z_OFFSET_RANGE[0], WIND_CHIME_Z_OFFSET_RANGE[1]),
    }
    if (isValidWindChimePoint(candidate, points)) points.push(candidate)
  }

  if (
    points.length === WIND_CHIME_PLANET_COUNT &&
    points.some((point) => point.z >= SCENE_CENTER_Z + 0.35)
  ) {
    return points
  }

  return [
    { x: -3.05, y: WC_TARGET_Y, z: SCENE_CENTER_Z + 1.15 },
    { x: 1.95, y: WC_TARGET_Y, z: SCENE_CENTER_Z - 3.55 },
    { x: 4.0, y: WC_TARGET_Y, z: SCENE_CENTER_Z + 2.55 },
  ]
}

const WIND_CHIME_PLANET_BASE_POINTS = createWindChimePlanetBasePoints()

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

export function getWindChimePlanetOrbitAngle(trackIdx: number): number {
  const base = WIND_CHIME_PLANET_BASE_POINTS[trackIdx] ?? WIND_CHIME_PLANET_BASE_POINTS[0]
  return Math.atan2(base.z - SCENE_CENTER_Z, base.x)
}

function getWindChimeMotionEnvelope(smoothP: number): number {
  const activeSwing = Math.sin(Math.PI * Math.max(0, Math.min(1, smoothP)))
  const settle = 1 - smoothstep(Math.max(0, Math.min(1, (smoothP - 0.78) / 0.22)))
  return activeSwing * settle
}

export function getWindChimeSway(index: number, smoothP: number, time: number): WorldPoint {
  const envelope = getWindChimeMotionEnvelope(smoothP)
  const phase = index * 1.37
  const amp = 0.28 * envelope

  return {
    x: Math.sin(time * 1.28 + phase) * amp,
    y: 0,
    z: Math.cos(time * 1.08 + phase * 0.7) * amp * 0.42,
  }
}

export function getWindChimePlanetPhysicalPoint(trackIdx: number, smoothP: number, time: number): WorldPoint {
  const point = getWindChimePlanetPoint(trackIdx, smoothP)
  const sway = getWindChimeSway(trackIdx, smoothP, time)
  return {
    x: point.x + sway.x,
    y: point.y + sway.y,
    z: point.z + sway.z,
  }
}

export function getWindChimeCenterPhysicalPoint(smoothP: number, time: number): WorldPoint {
  const point = getWindChimeCenterPoint(smoothP)
  const sway = getWindChimeSway(3, smoothP, time)
  return {
    x: point.x + sway.x * 0.55,
    y: point.y + sway.y * 0.55,
    z: point.z + sway.z * 0.55,
  }
}

export function getWindChimeLinePoint(
  index: number,
  smoothP: number,
  time: number,
  segmentRatio: number,
  anchorPoint: WorldPoint,
  endPoint: WorldPoint,
): WorldPoint {
  const t = Math.max(0, Math.min(1, segmentRatio))
  const sway = getWindChimeSway(index, smoothP, time)
  const bend = Math.sin(Math.PI * t) * getWindChimeMotionEnvelope(smoothP)
  const phase = index * 1.73

  return {
    x: anchorPoint.x + (endPoint.x - anchorPoint.x) * t + sway.x * bend * 0.75 + Math.sin(time * 0.92 + phase) * bend * 0.08,
    y: WC_ANCHOR_Y + (endPoint.y - WC_ANCHOR_Y) * t,
    z: anchorPoint.z + (endPoint.z - anchorPoint.z) * t + sway.z * bend * 0.75 + Math.cos(time * 0.86 + phase) * bend * 0.06,
  }
}
