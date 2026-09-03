import type { Act3ContourTarget, ScreenPolyline } from '../composition/coreAnchors'
import { TIMELINE, clamp01, progress, smoothProgress } from '../composition/timeline'
import { SQUARE_WAVE_SPACING, type SquareWaveSprite } from './squareWaveTransition'

export const SQUARE_TITLE = 'Ēarendel'
export const SQUARE_WAVE_HANDOFF_RADIUS_RATIO = 0.38
export const SQUARE_CONTOUR_SETTLE_GENERATIONS = 2
export const SQUARE_CONTOUR_MIN_FREEZE_PX = 3.5
export const SQUARE_CONTOUR_MAX_FREEZE_PX = 6

export interface ContourPoint {
  x: number
  y: number
  opacity: number
  source: 'central' | 'planet' | 'orbit'
}

export interface SquareContourLayout {
  centralX: number
  centralY: number
  initialCenterX: number
  initialCenterY: number
  zoomStart: number
  localSquareSize: number
  terminalPitch: number
  centralSquares: ContourPoint[]
  peripheralSquares: ContourPoint[]
}

export interface SquareContourTransform {
  focusX: number
  focusY: number
  zoom: number
  squareSize: number
  titleScale: number
}

export interface SquareContourTransitionFrame {
  active: boolean
  typedText: string
  titleFontPx: number
  titleAlpha: number
  contourAlpha: number
  zoomProgress: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function expLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / Math.max(0.0001, a), t)
}

export function smootherstep01(value: number): number {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function getSquareTypedText(scrollProgress: number): string {
  const p = progress('squareTitleTyping', scrollProgress)
  if (p <= 0) return '*'
  const count = Math.min(SQUARE_TITLE.length, Math.max(1, Math.ceil(p * SQUARE_TITLE.length)))
  return SQUARE_TITLE.slice(0, count)
}

export function getSquareContourTransitionFrame(
  scrollProgress: number,
  viewportWidth: number,
  viewportHeight: number,
): SquareContourTransitionFrame {
  const initialFont = Math.max(72, Math.min(240, viewportWidth * 0.16, viewportHeight * 0.22))
  const titleVisible = scrollProgress >= TIMELINE.squareTitleTyping.start &&
    scrollProgress < TIMELINE.squareTitleFade.end
  return {
    active: scrollProgress >= TIMELINE.act2SquareTransition.start &&
      scrollProgress < TIMELINE.act2SquareTransition.end,
    typedText: getSquareTypedText(scrollProgress),
    titleFontPx: initialFont,
    titleAlpha: titleVisible ? 1 - smoothProgress('squareTitleFade', scrollProgress) : 0,
    contourAlpha: 1 - smoothProgress('squareAct3Crossfade', scrollProgress),
    zoomProgress: progress('squareContourZoom', scrollProgress),
  }
}

export function getSquareWaveHandoffGeneration(
  viewportWidth: number,
  viewportHeight: number,
  squareSize: number,
): number {
  const spacing = Math.max(1, squareSize * SQUARE_WAVE_SPACING)
  const radiusPx = Math.min(viewportWidth, viewportHeight) * SQUARE_WAVE_HANDOFF_RADIUS_RATIO
  return Math.max(8, radiusPx / spacing)
}

export function getContourSquareFreezeSize(
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.max(
    SQUARE_CONTOUR_MIN_FREEZE_PX,
    Math.min(SQUARE_CONTOUR_MAX_FREEZE_PX, Math.min(viewportWidth, viewportHeight) * 0.005),
  )
}

function sampleCircle(
  x: number,
  y: number,
  radius: number,
  pitch: number,
): Array<{ x: number; y: number }> {
  const circumference = Math.PI * 2 * Math.max(0, radius)
  const count = Math.max(12, Math.ceil(circumference / Math.max(0.25, pitch)))
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    return { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius }
  })
}

function samplePolyline(polyline: ScreenPolyline, pitch: number): Array<{ x: number; y: number }> {
  if (polyline.points.length < 2) return []
  const lengths: number[] = []
  let totalLength = 0
  for (let index = 1; index < polyline.points.length; index++) {
    const a = polyline.points[index - 1]
    const b = polyline.points[index]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    lengths.push(length)
    totalLength += length
  }
  if (totalLength <= 0) return []

  const count = Math.max(2, Math.ceil(totalLength / Math.max(0.25, pitch)))
  const samples: Array<{ x: number; y: number }> = []
  let segment = 0
  let segmentStart = 0
  for (let index = 0; index < count; index++) {
    const distance = (index / count) * totalLength
    while (segment < lengths.length - 1 && distance > segmentStart + lengths[segment]) {
      segmentStart += lengths[segment]
      segment++
    }
    const a = polyline.points[segment]
    const b = polyline.points[segment + 1]
    const local = lengths[segment] <= 0 ? 0 : (distance - segmentStart) / lengths[segment]
    samples.push({ x: lerp(a.x, b.x, local), y: lerp(a.y, b.y, local) })
  }
  return samples
}

function occupancyKey(x: number, y: number, pitch: number): string {
  const bucket = Math.max(0.5, pitch * 0.72)
  return `${Math.round(x / bucket)}:${Math.round(y / bucket)}`
}

export function buildSquareContourLayout(
  target: Act3ContourTarget,
  frozenWave: readonly SquareWaveSprite[],
  initialCenterX: number,
  initialCenterY: number,
  initialSpacing: number,
  initialSquareSize: number,
): SquareContourLayout {
  const freezeRadius = frozenWave.reduce(
    (max, sprite) => Math.max(max, Math.hypot(sprite.x, sprite.y) * initialSpacing + initialSquareSize * 0.5),
    initialSquareSize,
  )
  const zoomStart = Math.max(1.001, freezeRadius / Math.max(1, target.central.r))
  const localSquareSize = initialSquareSize / zoomStart
  const terminalPitch = initialSpacing / zoomStart

  const centralSquares: ContourPoint[] = frozenWave.map((sprite) => ({
    x: target.central.x + (sprite.x * initialSpacing) / zoomStart,
    y: target.central.y + (sprite.y * initialSpacing) / zoomStart,
    opacity: sprite.opacity,
    source: 'central',
  }))

  const occupied = new Set<string>()
  for (const square of centralSquares) {
    occupied.add(occupancyKey(square.x, square.y, terminalPitch))
  }
  const peripheralSquares: ContourPoint[] = []
  const append = (point: { x: number; y: number }, source: 'planet' | 'orbit') => {
    const key = occupancyKey(point.x, point.y, terminalPitch)
    if (occupied.has(key)) return
    occupied.add(key)
    peripheralSquares.push({ ...point, opacity: 1, source })
  }

  for (const planet of target.planets) {
    for (const point of sampleCircle(planet.x, planet.y, planet.r, terminalPitch)) append(point, 'planet')
  }
  for (const orbit of target.orbits) {
    for (const point of samplePolyline(orbit, terminalPitch)) append(point, 'orbit')
  }

  return {
    centralX: target.central.x,
    centralY: target.central.y,
    initialCenterX,
    initialCenterY,
    zoomStart,
    localSquareSize,
    terminalPitch,
    centralSquares,
    peripheralSquares,
  }
}

export function getSquareContourTransform(
  layout: SquareContourLayout,
  zoomProgress: number,
): SquareContourTransform {
  const t = smootherstep01(zoomProgress)
  const zoom = expLerp(layout.zoomStart, 1, t)
  return {
    focusX: lerp(layout.initialCenterX, layout.centralX, t),
    focusY: lerp(layout.initialCenterY, layout.centralY, t),
    zoom,
    squareSize: layout.localSquareSize * zoom,
    titleScale: zoom / layout.zoomStart,
  }
}

export function getSquareContourFreezeProgress(
  layout: SquareContourLayout,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const threshold = Math.max(
    layout.localSquareSize,
    getContourSquareFreezeSize(viewportWidth, viewportHeight),
  )
  if (getSquareContourTransform(layout, 0).squareSize <= threshold) return 0
  if (getSquareContourTransform(layout, 1).squareSize >= threshold) return 1

  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 24; iteration++) {
    const mid = (low + high) * 0.5
    if (getSquareContourTransform(layout, mid).squareSize > threshold) low = mid
    else high = mid
  }
  return high
}

export function projectContourPoint(
  point: Pick<ContourPoint, 'x' | 'y'>,
  layout: SquareContourLayout,
  transform: SquareContourTransform,
): { x: number; y: number } {
  return {
    x: transform.focusX + (point.x - layout.centralX) * transform.zoom,
    y: transform.focusY + (point.y - layout.centralY) * transform.zoom,
  }
}
