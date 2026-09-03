import type { Act3ContourTarget } from '../composition/coreAnchors'
import { TIMELINE, clamp01, progress, smoothProgress } from '../composition/timeline'
import { SQUARE_WAVE_SPACING, type SquareWaveSprite } from './squareWaveTransition'

export const SQUARE_TITLE = 'Ēarendel'
export const SQUARE_WAVE_HANDOFF_RADIUS_RATIO = 0.38
export const SQUARE_WAVE_HANDOFF_RADIUS_CELLS = 100

export interface ContourPoint {
  /** Position in the fixed square-wave logical coordinate system. */
  x: number
  y: number
  opacity: number
  source: 'central' | 'planet'
}

export interface SquareWaveCanvasTransform {
  generation: number
  zoom: number
  logicalSquareSize: number
  logicalSpacing: number
  screenRadius: number
}

export interface SquareContourLayout {
  centralX: number
  centralY: number
  initialCenterX: number
  initialCenterY: number
  handoffZoom: number
  terminalZoom: number
  logicalSquareSize: number
  logicalSpacing: number
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

export function getSquareWaveHandoffGeneration(): number {
  return SQUARE_WAVE_HANDOFF_RADIUS_CELLS
}

/**
 * Squares and their 1.1-cell spacing stay fixed in logical coordinates. Only
 * the view zoom changes while the front grows from radius 0 to radius 100.
 */
export function getSquareWaveCanvasTransform(
  waveProgress: number,
  viewportWidth: number,
  viewportHeight: number,
  logicalSquareSize: number,
): SquareWaveCanvasTransform {
  const t = smootherstep01(waveProgress)
  const generation = SQUARE_WAVE_HANDOFF_RADIUS_CELLS * t
  const logicalSpacing = logicalSquareSize * SQUARE_WAVE_SPACING
  const handoffLogicalRadius =
    SQUARE_WAVE_HANDOFF_RADIUS_CELLS * logicalSpacing + logicalSquareSize * 0.5
  const targetScreenRadius =
    Math.min(viewportWidth, viewportHeight) * SQUARE_WAVE_HANDOFF_RADIUS_RATIO
  const handoffZoom = Math.min(1, targetScreenRadius / Math.max(1, handoffLogicalRadius))

  // Reciprocal interpolation keeps the visible radius monotonic while the view
  // continuously pulls back, landing exactly on handoffZoom at generation 100.
  const zoom = 1 / lerp(1, 1 / Math.max(0.000001, handoffZoom), t)
  const logicalRadius = generation * logicalSpacing + logicalSquareSize * 0.5
  return {
    generation,
    zoom,
    logicalSquareSize,
    logicalSpacing,
    screenRadius: logicalRadius * zoom,
  }
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

function occupancyKey(x: number, y: number, pitch: number): string {
  const bucket = Math.max(0.5, pitch * 0.72)
  return `${Math.round(x / bucket)}:${Math.round(y / bucket)}`
}

export function buildSquareContourLayout(
  target: Act3ContourTarget,
  frozenWave: readonly SquareWaveSprite[],
  initialCenterX: number,
  initialCenterY: number,
  logicalSpacing: number,
  logicalSquareSize: number,
  handoffZoom: number,
): SquareContourLayout {
  const logicalCentralRadius = frozenWave.reduce(
    (max, sprite) => Math.max(
      max,
      Math.hypot(sprite.x, sprite.y) * logicalSpacing + logicalSquareSize * 0.5,
    ),
    logicalSquareSize,
  )
  const terminalZoom = Math.max(0.000001, target.central.r / logicalCentralRadius)

  const centralSquares: ContourPoint[] = frozenWave.map((sprite) => ({
    x: sprite.x * logicalSpacing,
    y: sprite.y * logicalSpacing,
    opacity: sprite.opacity,
    source: 'central',
  }))

  const occupied = new Set<string>()
  for (const square of centralSquares) {
    occupied.add(occupancyKey(square.x, square.y, logicalSpacing))
  }
  const peripheralSquares: ContourPoint[] = []
  const append = (point: { x: number; y: number }) => {
    const key = occupancyKey(point.x, point.y, logicalSpacing)
    if (occupied.has(key)) return
    occupied.add(key)
    peripheralSquares.push({ ...point, opacity: 1, source: 'planet' })
  }

  for (const planet of target.planets) {
    if (!planet.visible) continue
    const logicalX = (planet.x - target.central.x) / terminalZoom
    const logicalY = (planet.y - target.central.y) / terminalZoom
    const logicalRadius = planet.r / terminalZoom
    for (const point of sampleCircle(logicalX, logicalY, logicalRadius, logicalSpacing)) {
      append(point)
    }
  }

  return {
    centralX: target.central.x,
    centralY: target.central.y,
    initialCenterX,
    initialCenterY,
    handoffZoom,
    terminalZoom,
    logicalSquareSize,
    logicalSpacing,
    centralSquares,
    peripheralSquares,
  }
}

export function getSquareContourTransform(
  layout: SquareContourLayout,
  zoomProgress: number,
): SquareContourTransform {
  const t = smootherstep01(zoomProgress)
  const zoom = expLerp(layout.handoffZoom, layout.terminalZoom, t)
  return {
    focusX: lerp(layout.initialCenterX, layout.centralX, t),
    focusY: lerp(layout.initialCenterY, layout.centralY, t),
    zoom,
    squareSize: layout.logicalSquareSize * zoom,
    titleScale: zoom / layout.handoffZoom,
  }
}

export function projectContourPoint(
  point: Pick<ContourPoint, 'x' | 'y'>,
  _layout: SquareContourLayout,
  transform: SquareContourTransform,
): { x: number; y: number } {
  return {
    x: transform.focusX + point.x * transform.zoom,
    y: transform.focusY + point.y * transform.zoom,
  }
}
