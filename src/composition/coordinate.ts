export type CoordinateSpace = 'world' | 'ndc' | 'screenPx' | 'cssPx' | 'canvasPx' | 'layoutBox'

export interface Point2 {
  x: number
  y: number
}

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface Circle2 extends Point2 {
  r: number
}

export interface LayoutBox extends Point2 {
  width: number
  height: number
}

export interface CoordinateValue<T> {
  space: CoordinateSpace
  value: T
}

export function sameSpace<T>(coord: CoordinateValue<T>, space: CoordinateSpace): boolean {
  return coord.space === space
}

export function assertSpace<T>(coord: CoordinateValue<T>, space: CoordinateSpace, label: string): void {
  if (coord.space !== space) {
    throw new Error(`${label} expected ${space}, got ${coord.space}`)
  }
}
