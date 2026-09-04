import { Vector3 } from 'three'
import { readAnchor, useAnchorStore, type AnchorInput, type DataRef } from './anchorStore'
import type { CoordinateSpace, LayoutBox } from './coordinate'

export interface WorldPoint {
  x: number
  y: number
  z: number
}

export interface ScreenPoint {
  x: number
  y: number
  visible: boolean
}

export interface ScreenCircle {
  x: number
  y: number
  r: number
  visible: boolean
}

export function planetWorldAnchorId(trackIdx: number): DataRef {
  return `anchor.planet.${trackIdx}.world`
}

export function planetOrbitAnchorId(trackIdx: number): DataRef {
  return `anchor.planet.${trackIdx}.orbitWorld`
}

export function planetScreenAnchorId(trackIdx: number): DataRef {
  return `anchor.planet.${trackIdx}.screen`
}

export function planetScreenRadiusAnchorId(trackIdx: number): DataRef {
  return `anchor.planet.${trackIdx}.screenRadius`
}

export interface ScreenPolyline {
  points: Array<{ x: number; y: number }>
}

export interface Act3ContourTarget {
  width: number
  height: number
  central: ScreenCircle
  planets: ScreenCircle[]
  orbits: ScreenPolyline[]
}

export function planetAtmosphereWorldRadiusAnchorId(trackIdx: number): DataRef {
  return `anchor.planet.${trackIdx}.atmosphereWorldRadius`
}

export function planetParticleIndexAnchorId(trackIdx: number): DataRef {
  return `anchor.planet.${trackIdx}.particleIndex`
}

export const centralStarWorldAnchorId = 'anchor.centralStar.world'
export const centralStarScreenAnchorId = 'anchor.centralStar.screen'
export const beamWorldOriginAnchorId = 'anchor.beam.worldOrigin'
export const beamWorldDirectionAnchorId = 'anchor.beam.worldDirection'
export const miniatureFaceRectAnchorId = 'anchor.miniature.faceRect'
export const miniatureScreenBoundsAnchorId = 'anchor.miniature.screenBounds'
export const act3ContourTargetAnchorId = 'anchor.act3Contour.target'

export function pointFromVector3(v: Vector3): WorldPoint {
  return { x: v.x, y: v.y, z: v.z }
}

export function vector3FromPoint(point: WorldPoint, target = new Vector3()): Vector3 {
  return target.set(point.x, point.y, point.z)
}

export function setCoreAnchor<T>(
  id: DataRef,
  value: T,
  space: CoordinateSpace,
  producer: string,
  visible = true,
): void {
  const store = useAnchorStore.getState()
  store.setAnchor({
    id,
    value,
    space,
    visible,
    producer,
    frameId: store.frameId,
  })
}

export function makeCoreAnchor<T>(
  id: DataRef,
  value: T,
  space: CoordinateSpace,
  producer: string,
  visible = true,
): AnchorInput<T> {
  return {
    id,
    value,
    space,
    visible,
    producer,
    frameId: useAnchorStore.getState().frameId,
  }
}

export function setCoreAnchors(anchors: AnchorInput[]): void {
  useAnchorStore.getState().setAnchors(anchors)
}

export function readAnchorValue<T>(id: DataRef): T | undefined {
  return readAnchor<T>(id)?.value
}

export function readPlanetWorldPoint(trackIdx: number): WorldPoint | undefined {
  return readAnchorValue<WorldPoint>(planetWorldAnchorId(trackIdx))
}

export function readPlanetParticleIndex(trackIdx: number): number | undefined {
  return readAnchorValue<number>(planetParticleIndexAnchorId(trackIdx))
}

export function readPlanetAtmosphereWorldRadius(trackIdx: number): number | undefined {
  return readAnchorValue<number>(planetAtmosphereWorldRadiusAnchorId(trackIdx))
}

export function readPlanetWorldByParticleIndex(particleIdx: number): WorldPoint | undefined {
  for (let trackIdx = 0; trackIdx < 3; trackIdx++) {
    if (readPlanetParticleIndex(trackIdx) === particleIdx) {
      return readPlanetWorldPoint(trackIdx)
    }
  }
  return undefined
}

export function readBeamWorldOrigin(): WorldPoint | undefined {
  return readAnchorValue<WorldPoint>(beamWorldOriginAnchorId)
}

export function readBeamWorldDirection(): WorldPoint | undefined {
  return readAnchorValue<WorldPoint>(beamWorldDirectionAnchorId)
}

export function readMiniatureFaceRect(): LayoutBox | undefined {
  return readAnchorValue<LayoutBox>(miniatureFaceRectAnchorId)
}

export function readMiniatureScreenBounds(): LayoutBox | undefined {
  return readAnchorValue<LayoutBox>(miniatureScreenBoundsAnchorId)
}

export function readAct3ContourTarget(): Act3ContourTarget | undefined {
  return readAnchorValue<Act3ContourTarget>(act3ContourTargetAnchorId)
}
