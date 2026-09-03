import type { Act3ContourTarget } from '../composition/coreAnchors'
import { TIMELINE, clamp01, progress, smoothProgress } from '../composition/timeline'
import { SQUARE_WAVE_SPACING, type SquareWaveSprite } from './squareWaveTransition'
import {
  createMotionPath,
  getMotionTrailFrame,
  type MotionPath,
  type MotionTrailConfig,
  type MotionTrailFrame,
} from './motionTrail'

export const SQUARE_TITLE = 'Ēarendel'
export const SQUARE_TITLE_FONT_SCALE = 0.85
export const SQUARE_WAVE_HANDOFF_RADIUS_RATIO = 0.38
export const SQUARE_WAVE_HANDOFF_RADIUS_CELLS = 400
export const PLANET_FLIGHT_TIMINGS = [
  { start: 0.700, end: 0.784, seed: 0xea7e1001 },
  { start: 0.708, end: 0.792, seed: 0xea7e1002 },
  { start: 0.716, end: 0.800, seed: 0xea7e1003 },
] as const

export interface ContourPoint {
  /** Position in the fixed square-wave logical coordinate system. */
  x: number
  y: number
  opacity: number
  source: 'central'
}

export interface PlanetFlightTarget {
  trackIdx: number
  x: number
  y: number
  radius: number
}

export interface PlanetFlightPlan {
  trackIdx: number
  path: MotionPath
  config: MotionTrailConfig
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
  logicalCentralRadius: number
  centralSquares: ContourPoint[]
  planetTargets: PlanetFlightTarget[]
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

/**
 * Integral of a sin² velocity profile. Velocity is zero at both ends, peaks
 * once at the midpoint, then converges continuously to the handoff radius.
 */
export function getSquareWaveExpansionProgress(value: number): number {
  const t = clamp01(value)
  return t - Math.sin(Math.PI * 2 * t) / (Math.PI * 2)
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
  const initialFont = Math.max(72, Math.min(240, viewportWidth * 0.16, viewportHeight * 0.22)) *
    SQUARE_TITLE_FONT_SCALE
  const titleVisible = scrollProgress >= TIMELINE.squareTitleTyping.start &&
    scrollProgress < TIMELINE.squareTitleFade.end
  const contourAlpha = 1 - smoothProgress('squareAct3Crossfade', scrollProgress)
  return {
    active: scrollProgress >= TIMELINE.act2SquareTransition.start &&
      scrollProgress < TIMELINE.act2SquareTransition.end,
    typedText: getSquareTypedText(scrollProgress),
    titleFontPx: initialFont,
    titleAlpha: titleVisible ? 1 - smoothProgress('squareTitleFade', scrollProgress) : 0,
    contourAlpha,
    zoomProgress: progress('squareContourZoom', scrollProgress),
  }
}

export function getSquareWaveHandoffGeneration(): number {
  return SQUARE_WAVE_HANDOFF_RADIUS_CELLS
}

/**
 * Squares and their 1.1-cell spacing stay fixed in logical coordinates. Only
 * the view zoom changes while the front grows from radius 0 to radius 400.
 */
export function getSquareWaveCanvasTransform(
  waveProgress: number,
  viewportWidth: number,
  viewportHeight: number,
  logicalSquareSize: number,
): SquareWaveCanvasTransform {
  const t = getSquareWaveExpansionProgress(waveProgress)
  const generation = SQUARE_WAVE_HANDOFF_RADIUS_CELLS * t
  const logicalSpacing = logicalSquareSize * SQUARE_WAVE_SPACING
  const handoffLogicalRadius =
    SQUARE_WAVE_HANDOFF_RADIUS_CELLS * logicalSpacing + logicalSquareSize * 0.5
  const targetScreenRadius =
    Math.min(viewportWidth, viewportHeight) * SQUARE_WAVE_HANDOFF_RADIUS_RATIO
  const handoffZoom = Math.min(1, targetScreenRadius / Math.max(1, handoffLogicalRadius))

  // Reciprocal interpolation keeps the visible radius monotonic while the view
  // continuously pulls back, landing exactly on handoffZoom at generation 400.
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

  const planetTargets = target.planets.flatMap((planet, trackIdx) => {
    if (!planet.visible) return []
    return [{
      trackIdx,
      x: (planet.x - target.central.x) / terminalZoom,
      y: (planet.y - target.central.y) / terminalZoom,
      radius: planet.r / terminalZoom,
    }]
  })

  return {
    centralX: target.central.x,
    centralY: target.central.y,
    initialCenterX,
    initialCenterY,
    handoffZoom,
    terminalZoom,
    logicalSquareSize,
    logicalSpacing,
    logicalCentralRadius,
    centralSquares,
    planetTargets,
  }
}

export function buildPlanetFlightPlans(layout: SquareContourLayout): PlanetFlightPlan[] {
  const padding = layout.logicalCentralRadius * 0.8
  const allX = [0, ...layout.planetTargets.map((target) => target.x)]
  const allY = [0, ...layout.planetTargets.map((target) => target.y)]
  const bounds = {
    minX: Math.min(...allX) - padding,
    maxX: Math.max(...allX) + padding,
    minY: Math.min(...allY) - padding,
    maxY: Math.max(...allY) + padding,
  }

  return layout.planetTargets.map((target) => {
    const timing = PLANET_FLIGHT_TIMINGS[target.trackIdx] ?? PLANET_FLIGHT_TIMINGS[0]
    const config: MotionTrailConfig = {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      duration: 1,
      finalRadius: target.radius,
      trailSpacing: Math.max(0.5, target.radius * (8 / 36)),
      shrinkRate: target.radius * (8 / 3),
      waypointCount: 4,
      randomness: 0.52,
      bounds,
    }
    return {
      trackIdx: target.trackIdx,
      path: createMotionPath({ x: 0, y: 0 }, { x: target.x, y: target.y }, config, timing.seed),
      config,
    }
  })
}

export function getPlanetFlightElapsed(scrollProgress: number, trackIdx: number): number {
  const timing = PLANET_FLIGHT_TIMINGS[trackIdx] ?? PLANET_FLIGHT_TIMINGS[0]
  return Math.max(0, (scrollProgress - timing.start) / (timing.end - timing.start))
}

export function getPlanetFlightFrame(
  plan: PlanetFlightPlan,
  scrollProgress: number,
): MotionTrailFrame {
  return getMotionTrailFrame(
    plan.path,
    plan.config,
    getPlanetFlightElapsed(scrollProgress, plan.trackIdx),
  )
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

export function projectPlanetFlightCircle(
  circle: { point: { x: number; y: number }; radius: number },
  transform: SquareContourTransform,
): { x: number; y: number; radius: number } {
  return {
    x: transform.focusX + circle.point.x * transform.zoom,
    y: transform.focusY + circle.point.y * transform.zoom,
    radius: circle.radius * transform.zoom,
  }
}
