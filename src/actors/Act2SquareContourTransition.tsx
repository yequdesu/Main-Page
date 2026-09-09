import { useCallback, useEffect, useRef } from 'react'
import { chargeGates, getOrbitHoldPhase, subscribeChargeGates } from '../behaviors/chargeGates'
import { useScrollStore } from '../stores/scrollStore'
import { useAnchorStore, type Anchor } from '../composition/anchorStore'
import {
  act3ContourTargetAnchorId,
  miniatureFaceRectAnchorId,
  type Act3ContourTarget,
} from '../composition/coreAnchors'
import type { LayoutBox } from '../composition/coordinate'
import { getDomLayer } from '../composition/layerRegistry'
import {
  getSquareWaveBandFrame,
  SQUARE_WAVE_FADE_GENERATIONS,
  SQUARE_WAVE_FADE_START,
  SQUARE_WAVE_SEED_SCALE,
  type SquareWaveSprite,
} from '../behaviors/squareWaveTransition'
import {
  PLANET_FLIGHT_TIMINGS,
  ORBIT_TRACE_TIMINGS,
  SQUARE_TITLE_TEXT,
  buildOrbitTracePlans,
  buildPlanetFlightPlans,
  buildSquareContourLayout,
  getPlanetFlightRenderFrame,
  getOrbitTraceRenderFrames,
  getSquareContourTransform,
  getSquareContourTransitionFrame,
  getSquareWaveCanvasTransform,
  getSquareWaveHandoffGeneration,
  type OrbitTracePlan,
  type OrbitStrokeFrame,
  type PlanetFlightPlan,
  type SquareContourLayout,
} from '../behaviors/act2SquareContourTransition'
import { getCircleConnector, type MotionTrailFrame } from '../behaviors/motionTrail'
import {
  buildGlyphDfsPlan,
  getGlyphDfsFrame,
  type GlyphDfsPlan,
  type RasterCell,
} from '../behaviors/handwrittenTitle'
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'
import { useActorRuntime } from '../composition/actorRuntime'
import { createPixelOrbitRevealRenderer } from '../behaviors/pixelOrbitReveal'

const TITLE_FONT_FAMILY = "'Allura',cursive"
const TITLE_RASTER_CELL_SIZE = 2
const TITLE_REVEAL_CHUNK_SIZE = 96

function drawScreenSquare(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  opacity: number,
  dpr: number,
): void {
  if (opacity <= 0 || size <= 0) return
  const snappedSize = Math.max(1 / dpr, Math.round(size * dpr) / dpr)
  const x = Math.round((centerX - snappedSize * 0.5) * dpr) / dpr
  const y = Math.round((centerY - snappedSize * 0.5) * dpr) / dpr
  ctx.globalAlpha = opacity
  ctx.fillRect(x, y, snappedSize, snappedSize)
}

function drawLogicalWave(
  ctx: CanvasRenderingContext2D,
  sprites: readonly SquareWaveSprite[],
  focusX: number,
  focusY: number,
  zoom: number,
  logicalSpacing: number,
  logicalSquareSize: number,
  opacityMultiplier = 1,
): void {
  const half = logicalSquareSize * 0.5
  ctx.save()
  ctx.translate(focusX, focusY)
  ctx.scale(zoom, zoom)
  let hasBatchedSquares = false
  const flushBatchedSquares = () => {
    if (!hasBatchedSquares) return
    ctx.globalAlpha = 1
    ctx.fill()
    hasBatchedSquares = false
  }
  for (const sprite of sprites) {
    const opacity = sprite.opacity * opacityMultiplier
    if (opacity <= 0) continue
    const isSettledOpaqueSquare = opacity === 1 &&
      Number.isInteger(sprite.x) && Number.isInteger(sprite.y)
    if (isSettledOpaqueSquare) {
      if (!hasBatchedSquares) ctx.beginPath()
      ctx.rect(
        sprite.x * logicalSpacing - half,
        sprite.y * logicalSpacing - half,
        logicalSquareSize,
        logicalSquareSize,
      )
      hasBatchedSquares = true
      continue
    }
    flushBatchedSquares()
    ctx.globalAlpha = opacity
    ctx.fillRect(
      sprite.x * logicalSpacing - half,
      sprite.y * logicalSpacing - half,
      logicalSquareSize,
      logicalSquareSize,
    )
  }
  flushBatchedSquares()
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawStrictCircleRing(
  ctx: CanvasRenderingContext2D,
  focusX: number,
  focusY: number,
  zoom: number,
  logicalOuterRadius: number,
  logicalSpacing: number,
  logicalSquareSize: number,
  fadingGenerations: number,
  opacity: number,
): void {
  if (opacity <= 0 || zoom <= 0 || logicalOuterRadius <= 0) return
  const fadeWidth = Math.max(0, fadingGenerations) * logicalSpacing
  const solidWidth = SQUARE_WAVE_FADE_START * logicalSpacing + logicalSquareSize
  const outerRadius = logicalOuterRadius * zoom
  const bandWidth = Math.min(
    outerRadius,
    (solidWidth + fadeWidth) * zoom,
  )
  const innerRadius = Math.max(0, outerRadius - bandWidth)
  const centerRadius = (outerRadius + innerRadius) * 0.5
  const fadeRatio = bandWidth > 0 ? Math.min(1, fadeWidth * zoom / bandWidth) : 0

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.lineWidth = Math.max(0.0001, bandWidth)
  if (fadeRatio > 0.0001) {
    const gradient = ctx.createRadialGradient(
      focusX,
      focusY,
      innerRadius,
      focusX,
      focusY,
      outerRadius,
    )
    gradient.addColorStop(0, 'rgba(255,255,255,0)')
    gradient.addColorStop(fadeRatio, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.strokeStyle = gradient
  } else {
    ctx.strokeStyle = '#ffffff'
  }
  ctx.beginPath()
  ctx.arc(focusX, focusY, centerRadius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawSmoothFlight(
  ctx: CanvasRenderingContext2D,
  frame: MotionTrailFrame,
  batchOpaque: boolean,
): void {
  const circles = [...frame.trail, frame.main]
  if (batchOpaque) ctx.beginPath()
  for (let index = 1; index < circles.length; index += 1) {
    const connector = getCircleConnector(circles[index - 1], circles[index])
    if (!connector) continue
    const a = connector.firstPositive
    const b = connector.secondPositive
    const c = connector.secondNegative
    const d = connector.firstNegative
    const signedArea =
      a.x * b.y - b.x * a.y +
      b.x * c.y - c.x * b.y +
      c.x * d.y - d.x * c.y +
      d.x * a.y - a.x * d.y
    if (!batchOpaque) ctx.beginPath()
    if (signedArea >= 0) {
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(c.x, c.y)
      ctx.lineTo(d.x, d.y)
    } else {
      ctx.moveTo(d.x, d.y)
      ctx.lineTo(c.x, c.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(a.x, a.y)
    }
    ctx.closePath()
    if (!batchOpaque) ctx.fill()
  }
  if (batchOpaque) ctx.fill()

  if (batchOpaque) ctx.beginPath()
  for (const circle of circles) {
    if (circle.radius <= 0.01) continue
    if (!batchOpaque) ctx.beginPath()
    // A moveTo is required before every arc in a compound path. Without it,
    // Canvas joins consecutive circles with long chords (the lancet artifact).
    if (batchOpaque) ctx.moveTo(circle.point.x + circle.radius, circle.point.y)
    ctx.arc(circle.point.x, circle.point.y, circle.radius, 0, Math.PI * 2)
    if (!batchOpaque) ctx.fill()
  }
  if (batchOpaque) ctx.fill()
}

interface HandwrittenGlyphRenderPlan {
  dfs: GlyphDfsPlan
  revealChunks: Path2D[]
}

interface HandwrittenTitleRenderPlan {
  fontPx: number
  width: number
  height: number
  cellSize: number
  glyphs: HandwrittenGlyphRenderPlan[]
}

function buildHandwrittenTitleRenderPlan(fontPx: number): HandwrittenTitleRenderPlan | null {
  const probe = document.createElement('canvas')
  const probeContext = probe.getContext('2d')
  if (!probeContext) return null

  const safeFontPx = Math.max(1, fontPx)
  const font = `400 ${safeFontPx}px ${TITLE_FONT_FAMILY}`
  probeContext.font = font
  const probeMetrics = probeContext.measureText(SQUARE_TITLE_TEXT)
  const ascent = Math.ceil(probeMetrics.actualBoundingBoxAscent || safeFontPx)
  const descent = Math.ceil(probeMetrics.actualBoundingBoxDescent || safeFontPx * 0.32)
  const padding = Math.max(4, Math.ceil(safeFontPx * 0.1))
  const width = Math.max(1, Math.ceil(probeMetrics.width) + padding * 2)
  const height = Math.max(1, ascent + descent + padding * 2)

  probe.width = width
  probe.height = height
  probeContext.font = font
  probeContext.textAlign = 'left'
  probeContext.textBaseline = 'alphabetic'
  probeContext.fillStyle = '#ffffff'
  probeContext.fillText(SQUARE_TITLE_TEXT, padding, padding + ascent)

  const glyphBands: Array<{ index: number; center: number }> = []
  let prefix = ''
  for (const character of Array.from(SQUARE_TITLE_TEXT)) {
    const start = probeContext.measureText(prefix).width
    prefix += character
    const end = probeContext.measureText(prefix).width
    if (character.trim().length > 0) {
      glyphBands.push({ index: glyphBands.length, center: padding + (start + end) * 0.5 })
    }
  }
  const glyphCells = glyphBands.map(() => [] as RasterCell[])
  const pixels = probeContext.getImageData(0, 0, width, height).data
  const cellSize = TITLE_RASTER_CELL_SIZE
  const columns = Math.ceil(width / cellSize)
  const rows = Math.ceil(height / cellSize)

  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      let coverage = 0
      const startX = cellX * cellSize
      const startY = cellY * cellSize
      for (let y = startY; y < Math.min(height, startY + cellSize); y += 1) {
        for (let x = startX; x < Math.min(width, startX + cellSize); x += 1) {
          coverage = Math.max(coverage, pixels[(y * width + x) * 4 + 3])
        }
      }
      if (coverage < 24 || glyphBands.length === 0) continue

      const sampleX = startX + cellSize * 0.5
      let nearestBand = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      for (let bandIndex = 0; bandIndex < glyphBands.length; bandIndex += 1) {
        const distance = Math.abs(sampleX - glyphBands[bandIndex].center)
        if (distance < nearestDistance) {
          nearestBand = bandIndex
          nearestDistance = distance
        }
      }
      glyphCells[nearestBand].push({ x: cellX, y: cellY })
    }
  }

  const glyphs = glyphCells.map((cells) => {
    const dfs = buildGlyphDfsPlan(cells)
    const revealChunks: Path2D[] = []
    for (let offset = 0; offset < dfs.cellsByVisit.length; offset += TITLE_REVEAL_CHUNK_SIZE) {
      const path = new Path2D()
      const end = Math.min(dfs.cellsByVisit.length, offset + TITLE_REVEAL_CHUNK_SIZE)
      for (let index = offset; index < end; index += 1) {
        const cell = dfs.cellsByVisit[index].cell
        path.rect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize)
      }
      revealChunks.push(path)
    }
    return { dfs, revealChunks }
  })

  return { fontPx: safeFontPx, width, height, cellSize, glyphs }
}

function drawHandwrittenTitle(
  ctx: CanvasRenderingContext2D,
  plan: HandwrittenTitleRenderPlan,
  writeProgress: number,
  centerX: number,
  centerY: number,
  scale: number,
  opacity: number,
): void {
  if (opacity <= 0 || scale <= 0) return
  ctx.save()
  ctx.translate(centerX, centerY)
  ctx.scale(scale, scale)
  ctx.translate(-plan.width * 0.5, -plan.height * 0.5)
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = opacity

  for (const glyph of plan.glyphs) {
    const frame = getGlyphDfsFrame(glyph.dfs, writeProgress, plan.cellSize)
    const completeChunks = Math.floor(frame.visibleCellCount / TITLE_REVEAL_CHUNK_SIZE)
    for (let index = 0; index < completeChunks; index += 1) {
      ctx.fill(glyph.revealChunks[index])
    }
    const partialStart = completeChunks * TITLE_REVEAL_CHUNK_SIZE
    for (let index = partialStart; index < frame.visibleCellCount; index += 1) {
      const cell = glyph.dfs.cellsByVisit[index].cell
      ctx.fillRect(
        cell.x * plan.cellSize,
        cell.y * plan.cellSize,
        plan.cellSize,
        plan.cellSize,
      )
    }

    if (frame.main) {
      drawSmoothFlight(ctx, {
        progress: writeProgress,
        distanceProgress: writeProgress,
        speed: 0,
        main: frame.main,
        trail: frame.trail.map((circle, index) => ({
          id: index,
          point: circle.point,
          radius: circle.radius,
          emittedRadius: circle.radius,
          birthTime: 0,
        })),
      }, opacity === 1)
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawPlanetFlights(
  ctx: CanvasRenderingContext2D,
  plans: readonly PlanetFlightPlan[],
  scrollProgress: number,
  focusX: number,
  focusY: number,
  zoom: number,
  terminalZoom: number,
  clipRadius: number,
  opacity: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (opacity <= 0 || scrollProgress < TIMELINE.squarePlanetFlights.start) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, viewportWidth, viewportHeight)
  ctx.arc(focusX, focusY, Math.max(0, clipRadius * zoom), 0, Math.PI * 2)
  ctx.clip('evenodd')
  ctx.translate(focusX, focusY)
  ctx.scale(zoom, zoom)
  ctx.globalAlpha = opacity

  for (const plan of plans) {
    const timing = PLANET_FLIGHT_TIMINGS[plan.trackIdx] ?? PLANET_FLIGHT_TIMINGS[0]
    if (scrollProgress < timing.start) continue
    drawSmoothFlight(
      ctx,
      getPlanetFlightRenderFrame(plan, scrollProgress, zoom, terminalZoom),
      opacity === 1,
    )
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawOrbitTraces(
  ctx: CanvasRenderingContext2D,
  plans: readonly OrbitTracePlan[],
  scrollProgress: number,
  focusX: number,
  focusY: number,
  zoom: number,
  clipRadius: number,
  opacity: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (opacity <= 0 || scrollProgress < ORBIT_TRACE_TIMINGS[0].start) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, viewportWidth, viewportHeight)
  ctx.arc(focusX, focusY, Math.max(0, clipRadius * zoom), 0, Math.PI * 2)
  ctx.clip('evenodd')
  ctx.translate(focusX, focusY)
  ctx.scale(zoom, zoom)
  ctx.globalAlpha = opacity

  for (const plan of plans) {
    const timing = ORBIT_TRACE_TIMINGS[plan.orbitIdx] ?? ORBIT_TRACE_TIMINGS[0]
    if (scrollProgress < timing.start) continue
    const frames = getOrbitTraceRenderFrames(
      plan,
      scrollProgress,
      zoom,
    )
    if (frames.stroke) drawOrbitStroke(ctx, frames.stroke)
    drawSmoothFlight(ctx, frames.tracer, opacity === 1)
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawOrbitStroke(
  ctx: CanvasRenderingContext2D,
  stroke: OrbitStrokeFrame,
): void {
  const samples = stroke.path.samples
  if (samples.length === 0 || stroke.progress <= 0) return

  ctx.save()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(0.0001, stroke.lineRadius * 2)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const path = getCachedOrbitPath(stroke)
  const visibleLength = stroke.path.totalLength * stroke.progress
  ctx.setLineDash([visibleLength, stroke.path.totalLength + 1])
  ctx.stroke(path)
  ctx.restore()
}

const orbitPathCache = new WeakMap<OrbitStrokeFrame['path'], Path2D>()

function getCachedOrbitPath(stroke: OrbitStrokeFrame): Path2D {
  const cached = orbitPathCache.get(stroke.path)
  if (cached) return cached
  const path = new Path2D()
  const samples = stroke.path.samples
  if (samples.length > 0) {
    path.moveTo(samples[0].point.x, samples[0].point.y)
    for (let index = 1; index < samples.length; index += 1) {
      path.lineTo(samples[index].point.x, samples[index].point.y)
    }
  }
  orbitPathCache.set(stroke.path, path)
  return path
}

interface LayoutCache {
  target: Act3ContourTarget
  logicalSquareSize: number
  handoffZoom: number
  centerX: number
  centerY: number
  layout: SquareContourLayout
  flightPlans: PlanetFlightPlan[]
  orbitTracePlans: OrbitTracePlan[]
}

export default function Act2SquareContourTransition() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pixelOrbitRef = useRef<ReturnType<typeof createPixelOrbitRevealRenderer> | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const layoutCacheRef = useRef<LayoutCache | null>(null)
  const titleRenderPlanRef = useRef<HandwrittenTitleRenderPlan | null>(null)
  const titleFontReadyRef = useRef(false)
  const scrollProgress = useScrollStore((state) => state.scrollProgress)
  const faceRectAnchor = useAnchorStore(
    (state) => state.anchors[miniatureFaceRectAnchorId],
  ) as Anchor<LayoutBox> | undefined
  const targetAnchor = useAnchorStore(
    (state) => state.anchors[act3ContourTargetAnchorId],
  ) as Anchor<Act3ContourTarget> | undefined
  const layer = getDomLayer('dom.act2SquareContourTransition')
  const active = scrollProgress >= TIMELINE.squareSeedShrink.start &&
    scrollProgress < TIMELINE.squareAct3Crossfade.end
  useActorRuntime('act2SquareContourTransition', active)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const targetWidth = Math.max(1, Math.round(width * dpr))
    const targetHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      layoutCacheRef.current = null
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const faceRect = faceRectAnchor?.value
    const frame = getSquareContourTransitionFrame(scrollProgress, width, height)
    if (!active || !frame.active || !faceRect || faceRect.width <= 0) {
      canvas.style.opacity = '0'
      return
    }

    canvas.style.opacity = '1'
    ctx.fillStyle = '#ffffff'
    const initialCenterX = faceRect.x + faceRect.width * 0.5
    const initialCenterY = faceRect.y + faceRect.height * 0.5
    const logicalSquareSize = faceRect.width * SQUARE_WAVE_SEED_SCALE

    if (scrollProgress <= TIMELINE.squareSeedShrink.end) {
      const shrink = smoothstep01(progress('squareSeedShrink', scrollProgress))
      const scale = 1 + (SQUARE_WAVE_SEED_SCALE - 1) * shrink
      drawScreenSquare(ctx, initialCenterX, initialCenterY, faceRect.width * scale, 1, dpr)
      ctx.globalAlpha = 1
      return
    }

    const wavePhase = progress('squareBfsWave', scrollProgress)
    const waveView = getSquareWaveCanvasTransform(
      wavePhase,
      width,
      height,
      logicalSquareSize,
    )
    const handoffView = getSquareWaveCanvasTransform(1, width, height, logicalSquareSize)
    const handoffGeneration = getSquareWaveHandoffGeneration()
    const circleMorph = smoothstep01(progress('squareCircleMorph', scrollProgress))

    if (scrollProgress <= TIMELINE.squareBfsWave.end) {
      if (circleMorph < 1) {
        drawLogicalWave(
          ctx,
          getSquareWaveBandFrame(waveView.generation),
          initialCenterX,
          initialCenterY,
          waveView.zoom,
          waveView.logicalSpacing,
          waveView.logicalSquareSize,
          1 - circleMorph,
        )
      }
      if (circleMorph > 0) {
        const logicalOuterRadius = waveView.screenRadius / Math.max(0.000001, waveView.zoom)
        drawStrictCircleRing(
          ctx,
          initialCenterX,
          initialCenterY,
          waveView.zoom,
          logicalOuterRadius,
          waveView.logicalSpacing,
          waveView.logicalSquareSize,
          SQUARE_WAVE_FADE_GENERATIONS,
          circleMorph,
        )
      }
    }

    const target = targetAnchor?.value
    let layout: SquareContourLayout | undefined
    if (scrollProgress > TIMELINE.squareBfsWave.end && target) {
      const cached = layoutCacheRef.current
      if (
        !cached || cached.target !== target ||
        cached.logicalSquareSize !== logicalSquareSize ||
        cached.handoffZoom !== handoffView.zoom ||
        cached.centerX !== initialCenterX || cached.centerY !== initialCenterY
      ) {
        const strictRadiusProbe: SquareWaveSprite[] = [{
          x: handoffGeneration,
          y: 0,
          opacity: 1,
        }]
        const layout = buildSquareContourLayout(
          target,
          strictRadiusProbe,
          initialCenterX,
          initialCenterY,
          handoffView.logicalSpacing,
          logicalSquareSize,
          handoffView.zoom,
        )
        layoutCacheRef.current = {
          target,
          logicalSquareSize,
          handoffZoom: handoffView.zoom,
          centerX: initialCenterX,
          centerY: initialCenterY,
          layout,
          flightPlans: buildPlanetFlightPlans(layout),
          orbitTracePlans: buildOrbitTracePlans(layout),
        }
      }
      layout = layoutCacheRef.current!.layout
      const transform = getSquareContourTransform(layout, frame.zoomProgress)
      drawPlanetFlights(
        ctx,
        layoutCacheRef.current!.flightPlans,
        scrollProgress,
        transform.focusX,
        transform.focusY,
        transform.zoom,
        layout.terminalZoom,
        Math.max(0, layout.logicalCentralRadius - layout.logicalSquareSize),
        frame.contourAlpha,
        width,
        height,
      )
      drawOrbitTraces(
        ctx,
        layoutCacheRef.current!.orbitTracePlans,
        scrollProgress,
        transform.focusX,
        transform.focusY,
        transform.zoom,
        Math.max(0, layout.logicalCentralRadius - layout.logicalSquareSize),
        frame.contourAlpha,
        width,
        height,
      )
      drawStrictCircleRing(
        ctx,
        transform.focusX,
        transform.focusY,
        transform.zoom,
        layout.logicalCentralRadius,
        layout.logicalSpacing,
        layout.logicalSquareSize,
        SQUARE_WAVE_FADE_GENERATIONS * (1 - frame.zoomProgress),
        frame.contourAlpha,
      )
    } else if (scrollProgress > TIMELINE.squareBfsWave.end) {
      const logicalOuterRadius = handoffView.screenRadius / Math.max(0.000001, handoffView.zoom)
      drawStrictCircleRing(
        ctx,
        initialCenterX,
        initialCenterY,
        handoffView.zoom,
        logicalOuterRadius,
        handoffView.logicalSpacing,
        handoffView.logicalSquareSize,
        SQUARE_WAVE_FADE_GENERATIONS,
        frame.contourAlpha,
      )
    }

    if (scrollProgress > TIMELINE.geometricOrbitExpand.start && scrollProgress < TIMELINE.geometricOrbitRetract.end) {
      pixelOrbitRef.current ??= createPixelOrbitRevealRenderer()
      // Retraction now overlaps the start of the contour zoom. Follow the same
      // center and scale as the central ring, rather than the frozen wave view.
      const orbitTransform = layout ? getSquareContourTransform(layout, frame.zoomProgress) : undefined
      const zoom = orbitTransform?.zoom ?? waveView.zoom
      pixelOrbitRef.current(
        ctx, width, height,
        orbitTransform?.focusX ?? initialCenterX,
        orbitTransform?.focusY ?? initialCenterY,
        layout ? layout.logicalCentralRadius * zoom : waveView.screenRadius,
        (layout?.logicalSpacing ?? waveView.logicalSpacing) * zoom,
        (layout?.logicalSquareSize ?? waveView.logicalSquareSize) * zoom,
        scrollProgress, circleMorph, getOrbitHoldPhase(scrollProgress),
      )
    }

    if (
      frame.titleAlpha > 0 &&
      scrollProgress >= TIMELINE.squareTitleTyping.start &&
      titleFontReadyRef.current
    ) {
      let titleX = initialCenterX
      let titleY = initialCenterY
      let titleScale = 1
      if (layout) {
        const transform = getSquareContourTransform(layout, frame.zoomProgress)
        titleX = transform.focusX
        titleY = transform.focusY
        titleScale = transform.titleScale
      }
      const fontPx = Math.max(1, Math.round(frame.titleFontPx * 2) / 2)
      if (!titleRenderPlanRef.current || titleRenderPlanRef.current.fontPx !== fontPx) {
        titleRenderPlanRef.current = buildHandwrittenTitleRenderPlan(fontPx)
      }
      if (titleRenderPlanRef.current) {
        drawHandwrittenTitle(
          ctx,
          titleRenderPlanRef.current,
          frame.titleWriteProgress,
          titleX,
          titleY,
          titleScale,
          frame.titleAlpha,
        )
      }
    }
    ctx.globalAlpha = 1
  }, [active, faceRectAnchor, scrollProgress, targetAnchor])

  drawRef.current = draw

  useEffect(() => subscribeChargeGates(() => {
    if (chargeGates.active === 1) drawRef.current()
  }), [])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    let cancelled = false
    const load = document.fonts?.load(
      `400 96px ${TITLE_FONT_FAMILY}`,
      SQUARE_TITLE_TEXT,
    ) ?? Promise.resolve([])
    void load.then(() => {
      if (cancelled) return
      titleFontReadyRef.current = true
      titleRenderPlanRef.current = null
      drawRef.current()
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleResize = () => drawRef.current()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: layer.position,
        inset: 0,
        zIndex: layer.zIndex,
        width: '100%',
        height: '100%',
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
