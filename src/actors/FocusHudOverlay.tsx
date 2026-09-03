import { useEffect, useRef, type MutableRefObject } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import type { DayNight } from '../stores/scrollStore'
import { PLANET_LINKS, type OverlayData, type ScreenCircle } from '../types'
import { contourArc, computeFocusInversionCircleGeometry, computeFocusRingGeometry, computeHudTangentGeometry, focusExitDuration, focusLayerProgress, reverseFocusLayerProgress, screenRx, screenRy, type FocusInversionCircleGeometry, type HudTangentGeometry } from '../composition/focusCorridorGeometry'
import { readPlanetParticleIndex } from '../composition/coreAnchors'
import { getDomLayer, resolvePointerEvents } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'
import { registerFocusHudRenderer, type FocusHudCameraData, type FocusHudFrame } from './focusHudBridge'

interface DrawState {
  overlay: OverlayData
  focusedPlanetIdx: number
  dayNight: DayNight
  camera: FocusHudCameraData
  drawProgress: number
  exitProgress: number
  exitStartFocusAge: number
  focusAge: number
  phase: FocusHudFrame['phase']
}

const EMPTY_OVERLAY: OverlayData = { focused: false }
const HUD_CANVAS_MAX_DPR = 1.25
const STAR_RING_PADDING = 10
const PLANET_RING_PADDING = 8
const HUD_NOISE_INTENSITY = 3.0
const STAR_RADIANT_RAY_COUNT = 18
const STAR_RADIANT_RAY_WIDTH = 3.6
const STAR_RADIANT_NOISE_SIZE = 512
const STAR_RADIANT_ROTATION_SPEED = 0.024
const FOCUS_ELLIPSE_GROUP_START_DELAY = 0.32
const FOCUS_ELLIPSE_GROUP_COUNT_MIN = 6
const FOCUS_ELLIPSE_GROUP_COUNT_MAX = 12
const FOCUS_ELLIPSE_GROUP_ROTATION_MIN = 2
const FOCUS_ELLIPSE_GROUP_ROTATION_MAX = 6
const FOCUS_ELLIPSE_GROUP_ITEM_INTERVAL_MIN = 0.2
const FOCUS_ELLIPSE_GROUP_ITEM_INTERVAL_MAX = 0.6
const FOCUS_ELLIPSE_GROUP_GAP_MIN = 2
const FOCUS_ELLIPSE_GROUP_GAP_MAX = 4
const FOCUS_ELLIPSE_LIFETIME_MIN = 0.8
const FOCUS_ELLIPSE_LIFETIME_MAX = 1.6
const FOCUS_ELLIPSE_FLICKER_PROBABILITY = 0.15
const FOCUS_ELLIPSE_DISAPPEAR_PROBABILITY = 0.035

interface FocusEllipseGroup {
  start: number
  count: number
  rotationStep: number
  startAngle: number
  itemInterval: number
  ellipseLifetime: number
}

let radiantNoiseCanvas: HTMLCanvasElement | null = null
const radiantNoisePatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>()
let radiantRingCanvas: HTMLCanvasElement | null = null

interface HudPalette {
  geometryStroke: string
  tangentStroke: string
  dotFill: string
  cornerStroke: string
  panelFill: string
  panelText: string
  panelMutedText: string
}

const HUD_PALETTES: Record<DayNight, HudPalette> = {
  night: {
    geometryStroke: 'rgba(226, 232, 240, 0.62)',
    tangentStroke: 'rgba(226, 232, 240, 0.62)',
    dotFill: '#e8f1ff',
    cornerStroke: '#dbeafe',
    panelFill: 'rgba(7, 13, 27, 0.72)',
    panelText: '#e2e8f0',
    panelMutedText: 'rgba(203, 213, 225, 0.76)',
  },
  day: {
    geometryStroke: 'rgba(30, 41, 59, 0.48)',
    tangentStroke: 'rgba(30, 41, 59, 0.44)',
    dotFill: '#334155',
    cornerStroke: '#475569',
    panelFill: 'rgba(248, 250, 252, 0.76)',
    panelText: '#1e293b',
    panelMutedText: 'rgba(51, 65, 85, 0.72)',
  },
}

interface ColorGradientCache {
  key: string
  canvas: HTMLCanvasElement
  ready: boolean
}

function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR)
  const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth)
  const height = Math.max(1, document.documentElement.clientHeight || window.innerHeight)
  const targetWidth = Math.round(width * dpr)
  const targetHeight = Math.round(height * dpr)
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { width, height }
}

function getFocusedTrackIndex(particleIdx: number): number {
  for (let trackIdx = 0; trackIdx < PLANET_LINKS.length; trackIdx++) {
    if (readPlanetParticleIndex(trackIdx) === particleIdx) return trackIdx
  }
  return Math.max(0, Math.min(PLANET_LINKS.length - 1, particleIdx))
}

function makeDotMatrixRegion(
  star: ScreenCircle,
  planet: ScreenCircle,
  geometry: HudTangentGeometry | null,
): Path2D[] {
  if (!geometry) return []

  if (
    star.contour && planet.contour &&
    geometry.starIndexA !== undefined &&
    geometry.starIndexB !== undefined &&
    geometry.planetIndexA !== undefined &&
    geometry.planetIndexB !== undefined
  ) {
    const starArc = contourArc(star.contour, geometry.starIndexA, geometry.starIndexB, planet)
    const planetArc = contourArc(planet.contour, geometry.planetIndexA, geometry.planetIndexB, star)
    const starPath = new Path2D()
    starPath.moveTo(geometry.lines[0].x1, geometry.lines[0].y1)
    starPath.lineTo(geometry.starA.x, geometry.starA.y)
    for (const point of starArc) starPath.lineTo(point.x, point.y)
    starPath.lineTo(geometry.starB.x, geometry.starB.y)
    starPath.lineTo(geometry.lines[1].x1, geometry.lines[1].y1)
    starPath.closePath()

    const planetPath = new Path2D()
    planetPath.moveTo(geometry.lines[0].x2, geometry.lines[0].y2)
    planetPath.lineTo(geometry.planetA.x, geometry.planetA.y)
    for (const point of planetArc) planetPath.lineTo(point.x, point.y)
    planetPath.lineTo(geometry.planetB.x, geometry.planetB.y)
    planetPath.lineTo(geometry.lines[1].x2, geometry.lines[1].y2)
    planetPath.closePath()
    return [starPath, planetPath]
  }

  const starRX = screenRx(star) + STAR_RING_PADDING
  const starRY = screenRy(star) + STAR_RING_PADDING
  const planetRX = screenRx(planet) + PLANET_RING_PADDING
  const planetRY = screenRy(planet) + PLANET_RING_PADDING
  const starPath = new Path2D()
  starPath.moveTo(geometry.lines[0].x1, geometry.lines[0].y1)
  starPath.lineTo(geometry.starA.x, geometry.starA.y)
  starPath.ellipse(
    star.x,
    star.y,
    starRX,
    starRY,
    0,
    geometry.angleA ?? 0,
    geometry.angleB ?? Math.PI,
    false,
  )
  starPath.lineTo(geometry.lines[1].x1, geometry.lines[1].y1)
  starPath.closePath()

  const planetPath = new Path2D()
  planetPath.moveTo(geometry.lines[1].x2, geometry.lines[1].y2)
  planetPath.lineTo(geometry.planetB.x, geometry.planetB.y)
  planetPath.ellipse(
    planet.x,
    planet.y,
    planetRX,
    planetRY,
    0,
    geometry.angleB ?? Math.PI,
    geometry.angleA ?? 0,
    false,
  )
  planetPath.lineTo(geometry.lines[0].x2, geometry.lines[0].y2)
  planetPath.closePath()

  return [starPath, planetPath]
}

function drawCorners(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
  drawProgress: number,
  palette: HudPalette,
): void {
  const margin = 28
  const size = 26
  ctx.save()
  const lineProgress = smoothstepNumber(0, 1, drawProgress)
  ctx.beginPath()
  ctx.rect(0, 0, width * lineProgress, height)
  ctx.clip()
  ctx.globalAlpha = alpha * 0.45
  ctx.strokeStyle = palette.cornerStroke
  ctx.lineWidth = 1

  const corners = [
    [margin, margin, 1, 1],
    [width - margin, margin, -1, 1],
    [width - margin, height - margin, -1, -1],
    [margin, height - margin, 1, -1],
  ] as const

  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * size)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * size, y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawColorGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  star: ScreenCircle,
  planet: ScreenCircle,
  geometry: HudTangentGeometry | null,
  alpha: number,
  drawProgress: number,
  palette: HudPalette,
  cacheRef: MutableRefObject<ColorGradientCache | null>,
): void {
  const regions = makeDotMatrixRegion(star, planet, geometry)
  if (regions.length === 0) return
  const colorGradientTexture = ensureColorGradientCanvas(
    width,
    height,
    palette,
    cacheRef,
  )

  ctx.save()
  ctx.globalAlpha = alpha * smoothstepNumber(0.08, 0.78, drawProgress)
  drawGradientRegion(
    ctx,
    regions[0],
    colorGradientTexture,
    width,
    height,
    star,
    planet,
  )
  if (regions[1]) {
    drawGradientRegion(
      ctx,
      regions[1],
      colorGradientTexture,
      width,
      height,
      planet,
      star,
    )
  }
  ctx.restore()
}

function drawGradientRegion(
  ctx: CanvasRenderingContext2D,
  region: Path2D,
  texture: HTMLCanvasElement,
  width: number,
  height: number,
  body: ScreenCircle,
  otherBody: ScreenCircle,
): void {
  ctx.save()
  ctx.clip(region)
  ctx.drawImage(texture, 0, 0, width, height)
  ctx.globalCompositeOperation = 'destination-in'
  const dx = otherBody.x - body.x
  const dy = otherBody.y - body.y
  const axisLength = Math.hypot(dx, dy) || 1
  const outwardX = (body.x - otherBody.x) / axisLength
  const outwardY = (body.y - otherBody.y) / axisLength
  const extent = Math.max(240, Math.hypot(width, height) * 0.72)
  // Preserve the radial meaning of the old mask, but flatten its arc into a
  // straight distance field that travels away from the body center.
  const fade = ctx.createLinearGradient(
    body.x,
    body.y,
    body.x + outwardX * extent,
    body.y + outwardY * extent,
  )
  // Near the body center is clear; the straight gradient restores the ray
  // color only as the field travels outward.
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  fade.addColorStop(0.08, 'rgba(0, 0, 0, 0.02)')
  fade.addColorStop(0.24, 'rgba(0, 0, 0, 0.12)')
  fade.addColorStop(0.46, 'rgba(0, 0, 0, 0.38)')
  fade.addColorStop(0.70, 'rgba(0, 0, 0, 0.72)')
  fade.addColorStop(0.90, 'rgba(0, 0, 0, 0.92)')
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function ensureColorGradientCanvas(
  width: number,
  height: number,
  palette: HudPalette,
  cacheRef: MutableRefObject<ColorGradientCache | null>,
): HTMLCanvasElement {
  const key = makeColorGradientCacheKey(width, height, palette)
  if (cacheRef.current?.key !== key) {
    cacheRef.current = {
      key,
      canvas: document.createElement('canvas'),
      ready: false,
    }
    const dpr = Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR)
    cacheRef.current.canvas.width = Math.max(1, Math.round(width * dpr))
    cacheRef.current.canvas.height = Math.max(1, Math.round(height * dpr))
  }
  buildColorGradientCanvas(cacheRef.current, width, height, palette)
  return cacheRef.current.canvas
}

function makeColorGradientCacheKey(
  width: number,
  height: number,
  palette: HudPalette,
): string {
  return [
    Math.round(width),
    Math.round(height),
    Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR),
    palette.tangentStroke,
  ].join('|')
}

function buildColorGradientCanvas(
  cache: ColorGradientCache,
  width: number,
  height: number,
  palette: HudPalette,
): void {
  if (cache.ready) return
  const dpr = Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR)
  const ctx = cache.canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = opaqueColor(palette.tangentStroke)
  ctx.fillRect(0, 0, width, height)

  // Keep the same hue as the HUD rays while varying only opacity, so the
  // gradient remains visible without depending on WebGL pixel readback.
  ctx.globalCompositeOperation = 'destination-in'
  const edgeRadius = Math.max(1, Math.min(width, height) * 0.5)
  const gradient = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    0,
    width * 0.5,
    height * 0.5,
    edgeRadius,
  )
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.66)')
  gradient.addColorStop(0.38, 'rgba(0, 0, 0, 0.72)')
  gradient.addColorStop(0.72, 'rgba(0, 0, 0, 0.81)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.88)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'

  applyHudNoise(cache.canvas, HUD_NOISE_INTENSITY)
  cache.ready = true
}

function applyHudNoise(canvas: HTMLCanvasElement, noiseIntensity: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  const darkenScale = (noiseIntensity / 15) * 255

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4
      if (pixels[index + 3] === 0) continue
      const noise = hashNoise(x, y)
      const darken = noise * darkenScale
      pixels[index] = Math.max(0, pixels[index] - darken)
      pixels[index + 1] = Math.max(0, pixels[index + 1] - darken)
      pixels[index + 2] = Math.max(0, pixels[index + 2] - darken)
    }
  }

  ctx.putImageData(image, 0, 0)
}

function hashNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123
  return value - Math.floor(value)
}

function opaqueColor(color: string): string {
  const rgba = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  return rgba ? `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})` : color
}

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function hudHashNoise(value: number): number {
  const result = Math.sin(value * 12.9898) * 43758.5453123
  return result - Math.floor(result)
}

function clipOutsideRayCorridor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  geometry: HudTangentGeometry | null,
): void {
  if (!geometry) return
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.moveTo(geometry.lines[0].x1, geometry.lines[0].y1)
  ctx.lineTo(geometry.lines[0].x2, geometry.lines[0].y2)
  ctx.lineTo(geometry.lines[1].x2, geometry.lines[1].y2)
  ctx.lineTo(geometry.lines[1].x1, geometry.lines[1].y1)
  ctx.closePath()
  ctx.clip('evenodd')
}

function drawStarRadiantGeometry(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  star: ScreenCircle,
  geometry: HudTangentGeometry | null,
  alpha: number,
  drawProgress: number,
  focusAge: number,
  phase: DrawState['phase'],
  exitProgress: number,
  exitStartFocusAge: number,
  palette: HudPalette,
): void {
  const resolveLayerProgress = (layerOrder: number): number => {
    if (phase === 'exit') {
      return reverseFocusLayerProgress(
        focusLayerProgress(exitStartFocusAge, layerOrder),
        exitProgress,
        layerOrder,
        focusExitDuration(exitStartFocusAge),
      )
    }
    return focusLayerProgress(focusAge, layerOrder)
  }
  const ringProgresses = Array.from({ length: 6 }, (_, index) => resolveLayerProgress(index))
  const ringGeometry = computeFocusRingGeometry(star, width, height)
  const {
    radius,
    ringWidth,
    outerRingWidth,
    outerRingRadius,
    secondRadiantLength,
    fourthRingRadius,
  } = ringGeometry
  const rotation = Math.max(0, focusAge) * STAR_RADIANT_ROTATION_SPEED
  const ringStartAngle = -Math.PI / 2 + rotation
  const circleProgresses = [ringProgresses[1], ringProgresses[3], ringProgresses[5]]
  const circleGeometry = computeFocusInversionCircleGeometry(star, width, height, focusAge, circleProgresses)
  const inversionCircles = circleGeometry.filter((_, index) => circleProgresses[index] > 0.55)
  const starEdge = Math.max(screenRx(star), screenRy(star))
  const expandRadius = (target: number, progress: number) => starEdge + (target - starEdge) * progress

  ctx.save()
  clipOutsideRayCorridor(ctx, width, height, geometry)
  const shortRadius = Math.min(screenRx(star), screenRy(star))
  const longRadius = (outerRingRadius + fourthRingRadius) * 0.5
  drawFocusEllipseSequence(
    ctx,
    star,
    shortRadius,
    longRadius,
    focusAge,
    alpha,
    phase,
    exitProgress,
    exitStartFocusAge,
  )
  drawNoisyRadiantRing(
    ctx,
    width,
    height,
    star.x,
    star.y,
    expandRadius(radius + ringWidth * 0.5, ringProgresses[0]),
    Math.max(0.5, expandRadius(radius - ringWidth * 0.5, ringProgresses[0])),
    ringStartAngle,
    ringStartAngle + Math.PI * 2,
    alpha * ringProgresses[0] * 0.82,
    palette.tangentStroke,
    inversionCircles,
  )
  drawSolidRadiantRing(
    ctx,
    width,
    height,
    star.x,
    star.y,
    expandRadius(outerRingRadius + outerRingWidth * 0.5, ringProgresses[1]),
    Math.max(0.5, expandRadius(outerRingRadius - outerRingWidth * 0.5, ringProgresses[1])),
    ringStartAngle,
    ringStartAngle + Math.PI * 2,
    alpha * ringProgresses[1] * 0.82,
    inversionCircles,
  )
  const ringDefinitions = [
    {
      startRadius: radius + 14,
      length: Math.max(34, Math.min(width, height) * 0.105),
      phase: rotation,
      seed: 31.7,
      step: 1,
      scale: 1,
      outwardTipScale: 1,
      useNoise: true,
      progress: ringProgresses[0],
    },
    {
      startRadius: radius + 70,
      length: secondRadiantLength * 2,
      phase: Math.PI / STAR_RADIANT_RAY_COUNT + rotation,
      seed: 83.4,
      step: 2,
      scale: 2,
      outwardTipScale: 1.4,
      useNoise: false,
      progress: ringProgresses[4],
    },
  ]

  for (const ring of ringDefinitions) {
    for (let rayIndex = 0; rayIndex < STAR_RADIANT_RAY_COUNT; rayIndex += ring.step) {
      const rayT = rayIndex / STAR_RADIANT_RAY_COUNT
      const rayReveal = ring.progress
      if (rayReveal <= 0.01) continue

      const angle = -Math.PI / 2 + ring.phase + rayT * Math.PI * 2
      const radialJitter = (hudHashNoise(ring.seed + rayIndex * 17.31) - 0.5) * 7
      const lengthJitter = (hudHashNoise(ring.seed + rayIndex * 9.17 + 4.6) - 0.5) * 10
      const targetStartRadius = ring.startRadius + radialJitter
      const targetLength = Math.max(18, ring.length + lengthJitter)
      const startRadius = starEdge + (targetStartRadius - starEdge) * ring.progress
      const length = Math.max(2, targetLength * ring.progress)
      const centerRadius = startRadius + length * 0.5
      const centerX = star.x + Math.cos(angle) * centerRadius
      const centerY = star.y + Math.sin(angle) * centerRadius

      drawNoisyRadiantSpark(
        ctx,
        centerX,
        centerY,
        length,
        STAR_RADIANT_RAY_WIDTH * ring.scale,
        angle,
        alpha * rayReveal * 0.84,
        ring.seed + rayIndex * 101.7,
        ring.outwardTipScale,
        ring.useNoise,
      )
    }
  }
  ctx.restore()
}

function drawNoisyRadiantRing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
  alpha: number,
  color: string,
  exclusionCircles: FocusInversionCircleGeometry[] = [],
  useNoise = true,
): void {
  if (useNoise && !ensureRadiantNoiseCanvas()) return
  if (endAngle <= startAngle) return

  const dpr = Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR)
  if (!radiantRingCanvas) radiantRingCanvas = document.createElement('canvas')
  const ringCanvas = radiantRingCanvas
  const targetWidth = Math.max(1, Math.round(width * dpr))
  const targetHeight = Math.max(1, Math.round(height * dpr))
  if (ringCanvas.width !== targetWidth || ringCanvas.height !== targetHeight) {
    ringCanvas.width = targetWidth
    ringCanvas.height = targetHeight
  }
  const ringCtx = ringCanvas.getContext('2d')
  if (!ringCtx) return
  ringCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ringCtx.clearRect(0, 0, width, height)
  const noisePattern = useNoise ? ensureRadiantNoisePattern(ringCtx) : null
  if (useNoise && !noisePattern) return

  ringCtx.save()
  ringCtx.beginPath()
  if (endAngle - startAngle >= Math.PI * 2 - 0.001) {
    ringCtx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2)
    ringCtx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true)
  } else {
    ringCtx.arc(centerX, centerY, outerRadius, startAngle, endAngle)
    ringCtx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true)
  }
  ringCtx.closePath()
  ringCtx.clip('evenodd')

  ringCtx.globalAlpha = alpha
  ringCtx.fillStyle = color
  ringCtx.fillRect(0, 0, width, height)
  if (noisePattern) {
    ringCtx.globalCompositeOperation = 'destination-in'
    ringCtx.globalAlpha = 1
    ringCtx.fillStyle = noisePattern
    ringCtx.fillRect(0, 0, width, height)
  }
  if (exclusionCircles.length > 0) {
    ringCtx.globalCompositeOperation = 'destination-out'
    ringCtx.globalAlpha = 1
    ringCtx.beginPath()
    for (const circle of exclusionCircles) {
      ringCtx.moveTo(circle.x + circle.radius, circle.y)
      ringCtx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
    }
    ringCtx.fill()
  }
  ringCtx.restore()
  ctx.save()
  clipOutsideCircles(ctx, width, height, exclusionCircles)
  ctx.drawImage(ringCanvas, 0, 0, width, height)
  ctx.restore()
}

function clipOutsideCircles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  circles: FocusInversionCircleGeometry[],
): void {
  if (circles.length === 0) return
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  for (const circle of circles) {
    ctx.moveTo(circle.x + circle.radius, circle.y)
    ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
  }
  ctx.clip('evenodd')
}

function drawSolidRadiantRing(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
  alpha: number,
  exclusionCircles: FocusInversionCircleGeometry[] = [],
): void {
  if (endAngle <= startAngle) return

  ctx.save()
  clipOutsideCircles(ctx, width, height, exclusionCircles)
  ctx.globalAlpha = alpha
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 0.9
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.arc(centerX, centerY, (outerRadius + innerRadius) * 0.5, startAngle, endAngle)
  ctx.stroke()
  ctx.restore()
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

function makeFocusEllipseGroup(groupIndex: number, start: number): FocusEllipseGroup {
  const seed = groupIndex * 101.73
  const count = FOCUS_ELLIPSE_GROUP_COUNT_MIN + Math.floor(
    hudHashNoise(seed + 1.2) * (FOCUS_ELLIPSE_GROUP_COUNT_MAX - FOCUS_ELLIPSE_GROUP_COUNT_MIN + 1),
  )
  const rotationStep = degreesToRadians(
    FOCUS_ELLIPSE_GROUP_ROTATION_MIN + hudHashNoise(seed + 3.4) * (FOCUS_ELLIPSE_GROUP_ROTATION_MAX - FOCUS_ELLIPSE_GROUP_ROTATION_MIN),
  )
  const startAngle = degreesToRadians(
    hudHashNoise(seed + 5.6) * 360,
  )
  const itemInterval = FOCUS_ELLIPSE_GROUP_ITEM_INTERVAL_MIN + hudHashNoise(seed + 7.8) * (FOCUS_ELLIPSE_GROUP_ITEM_INTERVAL_MAX - FOCUS_ELLIPSE_GROUP_ITEM_INTERVAL_MIN)
  const ellipseLifetime = FOCUS_ELLIPSE_LIFETIME_MIN + hudHashNoise(seed + 9.0) * (FOCUS_ELLIPSE_LIFETIME_MAX - FOCUS_ELLIPSE_LIFETIME_MIN)
  return { start, count, rotationStep, startAngle, itemInterval, ellipseLifetime }
}

function drawFocusEllipseSequence(
  ctx: CanvasRenderingContext2D,
  star: ScreenCircle,
  shortRadius: number,
  longRadius: number,
  age: number,
  alpha: number,
  phase: DrawState['phase'],
  exitProgress: number,
  exitStartFocusAge: number,
): void {
  const timelineAge = phase === 'exit' ? exitStartFocusAge : age
  const exitScale = phase === 'exit'
    ? 1 - smoothstepNumber(0, 1, exitProgress)
    : 1
  let groupStart = FOCUS_ELLIPSE_GROUP_START_DELAY
  let groupIndex = 0

  while (groupStart <= timelineAge && groupIndex < 128) {
    const group = makeFocusEllipseGroup(groupIndex, groupStart)
    for (let ellipseIndex = 0; ellipseIndex < group.count; ellipseIndex += 1) {
      const ellipseStart = group.start + ellipseIndex * group.itemInterval
      if (ellipseStart > timelineAge) break

      const seed = groupIndex * 1009.1 + ellipseIndex * 37.17
      const elapsed = timelineAge - ellipseStart
      if (elapsed < 0 || elapsed >= group.ellipseLifetime) continue

      // Individual lifecycle events remain binary. Only the global exit
      // reverses the currently visible ellipses through a scale transition.
      if (exitScale <= 0.001) continue

      const flickerRoll = hudHashNoise(seed + 13.6)
      const flickerStart = group.ellipseLifetime * (0.25 + hudHashNoise(seed + 15.8) * 0.5)
      const flickerDuration = 0.04 + hudHashNoise(seed + 18.0) * 0.10
      const flickering = flickerRoll < FOCUS_ELLIPSE_FLICKER_PROBABILITY &&
        elapsed >= flickerStart && elapsed < flickerStart + flickerDuration

      const disappearRoll = hudHashNoise(seed + 20.2)
      const disappearStart = group.ellipseLifetime * (0.2 + hudHashNoise(seed + 22.4) * 0.45)
      const unexpectedlyGone = disappearRoll < FOCUS_ELLIPSE_DISAPPEAR_PROBABILITY && elapsed >= disappearStart
      if (flickering || unexpectedlyGone) continue

      ctx.save()
      ctx.globalAlpha = alpha * 0.4
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 0.9
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.ellipse(
        star.x,
        star.y,
        longRadius * exitScale,
        shortRadius * exitScale,
        group.startAngle + ellipseIndex * group.rotationStep,
        0,
        Math.PI * 2,
        false,
      )
      ctx.stroke()
      ctx.restore()
    }

    const groupGap = FOCUS_ELLIPSE_GROUP_GAP_MIN + hudHashNoise(groupIndex * 211.7 + 29.6) * (FOCUS_ELLIPSE_GROUP_GAP_MAX - FOCUS_ELLIPSE_GROUP_GAP_MIN)
    groupStart += groupGap
    groupIndex += 1
  }
}

function drawNoisyRadiantSpark(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  length: number,
  width: number,
  angle: number,
  alpha: number,
  seed: number,
  outwardTipScale = 1,
  useNoise = true,
): void {
  const noisePattern = useNoise ? ensureRadiantNoisePattern(ctx) : null
  if (useNoise && !noisePattern) return
  const radialTip = length * 0.5
  const outwardRadialTip = radialTip * outwardTipScale
  const tangentialTip = Math.max(width * 1.8, 3.4)
  const innerRadial = Math.max(0.8, radialTip * 0.16)
  const innerTangential = Math.max(0.55, tangentialTip * 0.20)

  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(outwardRadialTip, 0)
  ctx.lineTo(innerRadial, innerTangential)
  ctx.lineTo(0, tangentialTip)
  ctx.lineTo(-innerRadial, innerTangential)
  ctx.lineTo(-radialTip, 0)
  ctx.lineTo(-innerRadial, -innerTangential)
  ctx.lineTo(0, -tangentialTip)
  ctx.lineTo(innerRadial, -innerTangential)
  ctx.closePath()
  ctx.clip()
  ctx.globalAlpha = alpha
  ctx.fillStyle = noisePattern ?? '#fff'
  ctx.fillRect(-radialTip, -tangentialTip, radialTip + outwardRadialTip, tangentialTip * 2)
  ctx.restore()
}

function ensureRadiantNoiseCanvas(): HTMLCanvasElement | null {
  if (!radiantNoiseCanvas) {
    radiantNoiseCanvas = document.createElement('canvas')
    radiantNoiseCanvas.width = STAR_RADIANT_NOISE_SIZE
    radiantNoiseCanvas.height = STAR_RADIANT_NOISE_SIZE
    const noiseCtx = radiantNoiseCanvas.getContext('2d')
    if (!noiseCtx) return null

    const image = noiseCtx.createImageData(STAR_RADIANT_NOISE_SIZE, STAR_RADIANT_NOISE_SIZE)
    for (let y = 0; y < STAR_RADIANT_NOISE_SIZE; y++) {
      for (let x = 0; x < STAR_RADIANT_NOISE_SIZE; x++) {
        const index = (y * STAR_RADIANT_NOISE_SIZE + x) * 4
        const noise = hudHashNoise(x * 1.17 + y * 79.31 + 41.7)
        const alpha = Math.round(72 + noise * 183)
        image.data[index] = 255
        image.data[index + 1] = 255
        image.data[index + 2] = 255
        image.data[index + 3] = alpha
      }
    }
    noiseCtx.putImageData(image, 0, 0)
  }
  return radiantNoiseCanvas
}

function ensureRadiantNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const cached = radiantNoisePatterns.get(ctx)
  if (cached) return cached
  const noiseCanvas = ensureRadiantNoiseCanvas()
  if (!noiseCanvas) return null
  const pattern = ctx.createPattern(noiseCanvas, 'repeat')
  if (pattern) radiantNoisePatterns.set(ctx, pattern)
  return pattern
}

function drawTargetGeometry(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  geometry: HudTangentGeometry | null,
  alpha: number,
  drawProgress: number,
  palette: HudPalette,
): void {
  ctx.save()
  const lineProgress = smoothstepNumber(0.02, 0.98, drawProgress)
  ctx.globalAlpha = alpha
  if (geometry) {
    ctx.beginPath()
    ctx.rect(0, 0, width * lineProgress, height)
    ctx.clip()
    ctx.setLineDash([])
    ctx.lineWidth = 0.7
    ctx.strokeStyle = palette.tangentStroke
    for (const line of geometry.lines) {
      ctx.beginPath()
      ctx.moveTo(line.x1, line.y1)
      ctx.lineTo(line.x2, line.y2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawLaunchPanel(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  planet: ScreenCircle,
  trackIdx: number,
  camera: { pos: { x: number; y: number; z: number } },
  alpha: number,
  drawProgress: number,
  palette: HudPalette,
): void {
  const link = PLANET_LINKS[trackIdx] ?? PLANET_LINKS[0]
  const panelW = 178
  const panelH = 74
  const x = Math.min(width - panelW - 22, Math.max(22, planet.x + 28))
  const y = Math.max(28, planet.y - 42)
  const gateway = link.url.replace(/^https?:\/\//, '').slice(0, 26)
  const fillProgress = smoothstepNumber(0.22, 0.78, drawProgress)
  const lineProgress = smoothstepNumber(0.08, 0.92, drawProgress)
  const textProgress = smoothstepNumber(0.52, 0.98, drawProgress)

  ctx.save()
  ctx.globalAlpha = alpha * fillProgress
  ctx.fillStyle = palette.panelFill
  ctx.beginPath()
  ctx.roundRect(x, y, panelW, panelH, 4)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, x + panelW * lineProgress, height)
  ctx.clip()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = `${link.accent}aa`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, panelW, panelH, 4)
  ctx.stroke()

  ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace'
  ctx.globalAlpha = alpha * textProgress
  ctx.fillStyle = palette.panelText
  ctx.fillText(`LAUNCH > ${link.label}`, x + 12, y + 22)

  ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace'
  ctx.fillStyle = palette.panelMutedText
  ctx.fillText(
    `CAM ${camera.pos.x.toFixed(1)} ${camera.pos.y.toFixed(1)} ${camera.pos.z.toFixed(1)}`,
    x + 12,
    y + 44,
  )
  ctx.fillText(gateway, x + 12, y + 61)
  ctx.restore()
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DrawState,
  colorGradientRef: MutableRefObject<ColorGradientCache | null>,
): void {
  ctx.clearRect(0, 0, width, height)
  const { overlay } = state
  const palette = HUD_PALETTES[state.dayNight]

  if (!overlay.focused || !overlay.star || !overlay.planet) return

  const alpha = state.phase === 'exit' ? state.overlay.alpha ?? 0 : 1
  const drawProgress = state.drawProgress

  const trackIdx = getFocusedTrackIndex(state.focusedPlanetIdx)
  const geometry = computeHudTangentGeometry(overlay.star, overlay.planet, width, height)

  drawColorGradient(ctx, width, height, overlay.star, overlay.planet, geometry, alpha, drawProgress, palette, colorGradientRef)
  drawStarRadiantGeometry(
    ctx,
    width,
    height,
    overlay.star,
    geometry,
    alpha,
    drawProgress,
    state.focusAge,
    state.phase,
    state.exitProgress,
    state.exitStartFocusAge,
    palette,
  )
  drawTargetGeometry(ctx, width, height, geometry, alpha, drawProgress, palette)
  drawCorners(ctx, width, height, alpha, drawProgress, palette)
  drawLaunchPanel(ctx, width, height, overlay.planet, trackIdx, state.camera, alpha, drawProgress, palette)
}

export default function FocusHudOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const colorGradientRef = useRef<ColorGradientCache | null>(null)
  const stateRef = useRef<DrawState>({
    overlay: EMPTY_OVERLAY,
    focusedPlanetIdx: -1,
    dayNight: 'night',
    camera: { pos: { x: 0, y: 0, z: 0 } },
    drawProgress: 0,
    focusAge: 0,
    exitProgress: 0,
    exitStartFocusAge: 0,
    phase: 'hidden',
  })
  const focusedPlanetIdx = useScrollStore((state) => state.focusedPlanetIdx)
  const layer = getDomLayer('svg.focusOverlay')

  useActorRuntime('focusOverlay', focusedPlanetIdx >= 0)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let disposed = false

    const render = (frame: FocusHudFrame) => {
      if (disposed) return
      const overlay: OverlayData = frame.focused && frame.star && frame.planet
        ? {
            focused: true,
            alpha: frame.alpha,
            star: frame.star,
            planet: frame.planet,
          }
        : { focused: false }

      canvas.style.opacity = String(frame.focused ? 1 : 0)
      const previous = stateRef.current
      const enteredExit = frame.phase === 'exit' && previous.phase !== 'exit'
      const exitStartFocusAge = frame.phase === 'exit'
        ? (enteredExit ? frame.focusAge : previous.exitStartFocusAge)
        : frame.focusAge
      stateRef.current = {
        overlay,
        focusedPlanetIdx: frame.focusedPlanetIdx,
        dayNight: frame.dayNight,
        camera: frame.camera,
        drawProgress: frame.drawProgress,
        focusAge: frame.focusAge,
        exitProgress: frame.exitProgress,
        exitStartFocusAge,
        phase: frame.phase,
      }
      const { width, height } = resizeCanvas(canvas, ctx)
      drawHud(ctx, width, height, stateRef.current, colorGradientRef)
    }

    const handleResize = () => {
      colorGradientRef.current = null
      const { width, height } = resizeCanvas(canvas, ctx)
      drawHud(ctx, width, height, stateRef.current, colorGradientRef)
    }

    const unregister = registerFocusHudRenderer(render)
    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResize)
      unregister()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="focus-overlay focus-hud-overlay"
      aria-hidden="true"
      style={{
        position: layer.position,
        inset: 0,
        zIndex: layer.zIndex,
        pointerEvents: resolvePointerEvents(layer.pointerEvents, focusedPlanetIdx >= 0),
      }}
    />
  )
}
