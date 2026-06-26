import { useEffect, useRef, type MutableRefObject } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import type { DayNight } from '../stores/scrollStore'
import { PLANET_LINKS, type OverlayData, type ScreenCircle, type TangentLine } from '../types'
import { readPlanetParticleIndex } from '../composition/coreAnchors'
import { getDomLayer, resolvePointerEvents } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'
import { registerFocusHudRenderer, type FocusHudCameraData, type FocusHudFrame } from './focusHudBridge'

interface DrawState {
  overlay: OverlayData
  focusedPlanetIdx: number
  dayNight: DayNight
  camera: FocusHudCameraData
}

const EMPTY_OVERLAY: OverlayData = { focused: false }
const HUD_CANVAS_MAX_DPR = 1.25
const STAR_RING_PADDING = 10
const PLANET_RING_PADDING = 8

interface HudTangentGeometry {
  starA: { x: number; y: number }
  starB: { x: number; y: number }
  planetA: { x: number; y: number }
  planetB: { x: number; y: number }
  starIndexA?: number
  starIndexB?: number
  planetIndexA?: number
  planetIndexB?: number
  angleA?: number
  angleB?: number
  lines: TangentLine[]
}

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

interface DotMatrixCache {
  key: string
  canvas: HTMLCanvasElement
}

function screenRx(circle: ScreenCircle): number {
  return circle.rx ?? circle.r
}

function screenRy(circle: ScreenCircle): number {
  return circle.ry ?? circle.r
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

function computeHudTangentGeometry(
  star: ScreenCircle,
  planet: ScreenCircle,
  width: number,
  height: number,
): HudTangentGeometry | null {
  if (star.contour && planet.contour) {
    return computeContourTangentGeometry(star, planet, width, height)
  }

  const starRX = screenRx(star) + STAR_RING_PADDING
  const starRY = screenRy(star) + STAR_RING_PADDING
  const planetRX = screenRx(planet) + PLANET_RING_PADDING
  const planetRY = screenRy(planet) + PLANET_RING_PADDING
  const dx = planet.x - star.x
  const dy = planet.y - star.y
  const dist = Math.hypot(dx, dy)
  if (dist <= Math.abs(starRX - planetRX) + 1 || !Number.isFinite(dist)) return null

  const theta = Math.atan2(dy, dx)
  const phi = Math.asin(Math.max(-1, Math.min(1, (starRX - planetRX) / dist)))
  const angleA = theta + Math.PI / 2 - phi
  const angleB = theta - Math.PI / 2 + phi
  const extLen = Math.hypot(width, height) + dist + starRX + planetRX

  const starA = { x: star.x + starRX * Math.cos(angleA), y: star.y + starRY * Math.sin(angleA) }
  const starB = { x: star.x + starRX * Math.cos(angleB), y: star.y + starRY * Math.sin(angleB) }
  const planetA = { x: planet.x + planetRX * Math.cos(angleA), y: planet.y + planetRY * Math.sin(angleA) }
  const planetB = { x: planet.x + planetRX * Math.cos(angleB), y: planet.y + planetRY * Math.sin(angleB) }

  const makeLine = (from: typeof starA, to: typeof planetA): TangentLine => {
    const tx = to.x - from.x
    const ty = to.y - from.y
    const len = Math.hypot(tx, ty) || 1
    return {
      x1: from.x - (tx / len) * extLen,
      y1: from.y - (ty / len) * extLen,
      x2: to.x + (tx / len) * extLen,
      y2: to.y + (ty / len) * extLen,
    }
  }

  return {
    starA,
    starB,
    planetA,
    planetB,
    angleA,
    angleB,
    lines: [makeLine(starA, planetA), makeLine(starB, planetB)],
  }
}

function computeContourTangentGeometry(
  star: ScreenCircle,
  planet: ScreenCircle,
  width: number,
  height: number,
): HudTangentGeometry | null {
  const starContour = star.contour
  const planetContour = planet.contour
  if (!starContour || !planetContour || starContour.length < 3 || planetContour.length < 3) return null

  const dx = planet.x - star.x
  const dy = planet.y - star.y
  const dist = Math.hypot(dx, dy)
  const starRX = Math.max(screenRx(star), screenRy(star))
  const planetRX = Math.max(screenRx(planet), screenRy(planet))
  if (dist <= Math.abs(starRX - planetRX) + 1 || !Number.isFinite(dist)) return null

  const theta = Math.atan2(dy, dx)
  const phi = Math.asin(Math.max(-1, Math.min(1, (starRX - planetRX) / dist)))
  const angleA = theta + Math.PI / 2 - phi
  const angleB = theta - Math.PI / 2 + phi

  const supportAtAngle = (
    contour: NonNullable<ScreenCircle['contour']>,
    center: { x: number; y: number },
    angle: number,
  ) => {
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    let bestIndex = 0
    let bestScore = (contour[0].x - center.x) * nx + (contour[0].y - center.y) * ny
    for (let idx = 1; idx < contour.length; idx++) {
      const score = (contour[idx].x - center.x) * nx + (contour[idx].y - center.y) * ny
      if (score > bestScore) {
        bestScore = score
        bestIndex = idx
      }
    }
    return { index: bestIndex, point: contour[bestIndex] }
  }

  const starA = supportAtAngle(starContour, star, angleA)
  const starB = supportAtAngle(starContour, star, angleB)
  const planetA = supportAtAngle(planetContour, planet, angleA)
  const planetB = supportAtAngle(planetContour, planet, angleB)
  const extLen = Math.hypot(width, height) + dist

  const makeLine = (from: { x: number; y: number }, to: { x: number; y: number }): TangentLine => {
    const tx = to.x - from.x
    const ty = to.y - from.y
    const len = Math.hypot(tx, ty) || 1
    return {
      x1: from.x - (tx / len) * extLen,
      y1: from.y - (ty / len) * extLen,
      x2: to.x + (tx / len) * extLen,
      y2: to.y + (ty / len) * extLen,
    }
  }

  return {
    starA: starA.point,
    starB: starB.point,
    planetA: planetA.point,
    planetB: planetB.point,
    starIndexA: starA.index,
    starIndexB: starB.index,
    planetIndexA: planetA.index,
    planetIndexB: planetB.index,
    angleA,
    angleB,
    lines: [makeLine(starA.point, planetA.point), makeLine(starB.point, planetB.point)],
  }
}

function contourArc(
  contour: NonNullable<ScreenCircle['contour']>,
  startIndex: number,
  endIndex: number,
  reference: { x: number; y: number },
): NonNullable<ScreenCircle['contour']> {
  const walk = (forward: boolean) => {
    const points = []
    let idx = startIndex
    for (let guard = 0; guard <= contour.length; guard++) {
      points.push(contour[idx])
      if (idx === endIndex) break
      idx = forward
        ? (idx + 1) % contour.length
        : (idx - 1 + contour.length) % contour.length
    }
    return points
  }
  const a = walk(true)
  const b = walk(false)
  const score = (points: NonNullable<ScreenCircle['contour']>) =>
    points.reduce((sum, point) => sum + Math.hypot(point.x - reference.x, point.y - reference.y), 0) / points.length
  return score(a) >= score(b) ? a : b
}

function strokeContour(ctx: CanvasRenderingContext2D, contour: NonNullable<ScreenCircle['contour']>): void {
  if (contour.length < 2) return
  ctx.beginPath()
  ctx.moveTo(contour[0].x, contour[0].y)
  for (let idx = 1; idx < contour.length; idx++) {
    ctx.lineTo(contour[idx].x, contour[idx].y)
  }
  ctx.closePath()
  ctx.stroke()
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

function drawCorners(ctx: CanvasRenderingContext2D, width: number, height: number, alpha: number, palette: HudPalette): void {
  const margin = 28
  const size = 26
  ctx.save()
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

function drawDotMatrix(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  star: ScreenCircle,
  planet: ScreenCircle,
  geometry: HudTangentGeometry | null,
  alpha: number,
  palette: HudPalette,
  dayNight: DayNight,
  cacheRef: MutableRefObject<DotMatrixCache | null>,
): void {
  const regions = makeDotMatrixRegion(star, planet, geometry)
  if (regions.length === 0) return
  const dotTexture = ensureDotMatrixCanvas(width, height, palette, dayNight, cacheRef)

  ctx.save()
  ctx.globalAlpha = alpha * 0.34
  for (const region of regions) {
    ctx.save()
    ctx.clip(region)
    ctx.drawImage(dotTexture, 0, 0, width, height)
    ctx.restore()
  }
  ctx.restore()
}

function ensureDotMatrixCanvas(
  width: number,
  height: number,
  palette: HudPalette,
  dayNight: DayNight,
  cacheRef: MutableRefObject<DotMatrixCache | null>,
): HTMLCanvasElement {
  const key = makeDotMatrixCacheKey(width, height, dayNight)
  if (cacheRef.current?.key !== key) {
    cacheRef.current = {
      key,
      canvas: buildDotMatrixCanvas(width, height, palette),
    }
  }
  return cacheRef.current.canvas
}

function makeDotMatrixCacheKey(width: number, height: number, dayNight: DayNight): string {
  return [
    Math.round(width),
    Math.round(height),
    Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR),
    dayNight,
  ].join('|')
}

function buildDotMatrixCanvas(
  width: number,
  height: number,
  palette: HudPalette,
): HTMLCanvasElement {
  const step = 13
  const minRadius = 0.25
  const maxRadius = 3.4
  const centerX = width * 0.5
  const centerY = height * 0.5
  const maxCenterDistance = Math.hypot(centerX, centerY) || 1
  const dpr = Math.min(window.devicePixelRatio || 1, HUD_CANVAS_MAX_DPR)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.save()
  ctx.fillStyle = palette.dotFill
  for (let y = 6; y < height; y += step) {
    for (let x = 6; x < width; x += step) {
      const edgeT = Math.min(1, Math.hypot(x - centerX, y - centerY) / maxCenterDistance)
      const radius = minRadius + Math.pow(edgeT, 1.6) * (maxRadius - minRadius)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
  return canvas
}

function drawTargetGeometry(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  star: ScreenCircle,
  planet: ScreenCircle,
  geometry: HudTangentGeometry | null,
  alpha: number,
  palette: HudPalette,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = palette.geometryStroke
  ctx.lineWidth = 1
  ctx.setLineDash([4, 7])

  if (star.contour) strokeContour(ctx, star.contour)
  else {
    ctx.beginPath()
    ctx.ellipse(star.x, star.y, screenRx(star) + STAR_RING_PADDING, screenRy(star) + STAR_RING_PADDING, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (planet.contour) strokeContour(ctx, planet.contour)
  else {
    ctx.beginPath()
    ctx.ellipse(planet.x, planet.y, screenRx(planet) + PLANET_RING_PADDING, screenRy(planet) + PLANET_RING_PADDING, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (geometry) {
    ctx.setLineDash([4, 7])
    ctx.lineWidth = 0.55
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
  planet: ScreenCircle,
  trackIdx: number,
  camera: { pos: { x: number; y: number; z: number } },
  alpha: number,
  palette: HudPalette,
): void {
  const link = PLANET_LINKS[trackIdx] ?? PLANET_LINKS[0]
  const panelW = 178
  const panelH = 74
  const x = Math.min(width - panelW - 22, Math.max(22, planet.x + 28))
  const y = Math.max(28, planet.y - 42)
  const gateway = link.url.replace(/^https?:\/\//, '').slice(0, 26)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = palette.panelFill
  ctx.strokeStyle = `${link.accent}aa`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, panelW, panelH, 4)
  ctx.fill()
  ctx.stroke()

  ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace'
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
  dotCacheRef: MutableRefObject<DotMatrixCache | null>,
): void {
  ctx.clearRect(0, 0, width, height)
  const { overlay } = state
  const palette = HUD_PALETTES[state.dayNight]
  ensureDotMatrixCanvas(width, height, palette, state.dayNight, dotCacheRef)

  if (!overlay.focused || !overlay.star || !overlay.planet) return

  const alpha = 1

  const trackIdx = getFocusedTrackIndex(state.focusedPlanetIdx)
  const geometry = computeHudTangentGeometry(overlay.star, overlay.planet, width, height)

  drawDotMatrix(ctx, width, height, overlay.star, overlay.planet, geometry, alpha, palette, state.dayNight, dotCacheRef)
  drawTargetGeometry(ctx, width, height, overlay.star, overlay.planet, geometry, alpha, palette)
  drawCorners(ctx, width, height, alpha, palette)
  drawLaunchPanel(ctx, width, overlay.planet, trackIdx, state.camera, alpha, palette)
}

export default function FocusHudOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dotCacheRef = useRef<DotMatrixCache | null>(null)
  const stateRef = useRef<DrawState>({
    overlay: EMPTY_OVERLAY,
    focusedPlanetIdx: -1,
    dayNight: 'night',
    camera: { pos: { x: 0, y: 0, z: 0 } },
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

      canvas.style.opacity = String(frame.focused ? frame.alpha : 0)
      stateRef.current = {
        overlay,
        focusedPlanetIdx: frame.focusedPlanetIdx,
        dayNight: frame.dayNight,
        camera: frame.camera,
      }
      const { width, height } = resizeCanvas(canvas, ctx)
      drawHud(ctx, width, height, stateRef.current, dotCacheRef)
    }

    const handleResize = () => {
      dotCacheRef.current = null
      const { width, height } = resizeCanvas(canvas, ctx)
      drawHud(ctx, width, height, stateRef.current, dotCacheRef)
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
