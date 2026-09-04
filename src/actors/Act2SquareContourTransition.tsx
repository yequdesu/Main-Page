import { useCallback, useEffect, useRef } from 'react'
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
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'
import { useActorRuntime } from '../composition/actorRuntime'

const FONT_STACK = "'Cascadia Mono','SF Mono','Fira Code','Consolas',monospace"

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
): void {
  const circles = [...frame.trail, frame.main]
  for (let index = 1; index < circles.length; index += 1) {
    const connector = getCircleConnector(circles[index - 1], circles[index])
    if (!connector) continue
    ctx.beginPath()
    ctx.moveTo(connector.firstPositive.x, connector.firstPositive.y)
    ctx.lineTo(connector.secondPositive.x, connector.secondPositive.y)
    ctx.lineTo(connector.secondNegative.x, connector.secondNegative.y)
    ctx.lineTo(connector.firstNegative.x, connector.firstNegative.y)
    ctx.closePath()
    ctx.fill()
  }

  for (const circle of circles) {
    if (circle.radius <= 0.01) continue
    ctx.beginPath()
    ctx.arc(circle.point.x, circle.point.y, circle.radius, 0, Math.PI * 2)
    ctx.fill()
  }
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
    drawSmoothFlight(ctx, frames.tracer)
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
  ctx.beginPath()
  ctx.moveTo(samples[0].point.x, samples[0].point.y)
  for (let index = 1; index <= stroke.endSampleIndex; index += 1) {
    ctx.lineTo(samples[index].point.x, samples[index].point.y)
  }
  const lastPoint = samples[stroke.endSampleIndex]?.point
  if (!lastPoint || Math.hypot(
    lastPoint.x - stroke.endPoint.x,
    lastPoint.y - stroke.endPoint.y,
  ) > 0.000001) {
    ctx.lineTo(stroke.endPoint.x, stroke.endPoint.y)
  }
  ctx.stroke()
  ctx.restore()
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
  const drawRef = useRef<() => void>(() => {})
  const layoutCacheRef = useRef<LayoutCache | null>(null)
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

    if (frame.titleAlpha > 0 && scrollProgress >= TIMELINE.squareTitleTyping.start) {
      let titleX = initialCenterX
      let titleY = initialCenterY
      let titleScale = 1
      if (layout) {
        const transform = getSquareContourTransform(layout, frame.zoomProgress)
        titleX = transform.focusX
        titleY = transform.focusY
        titleScale = transform.titleScale
      }
      ctx.globalAlpha = frame.titleAlpha
      ctx.font = `800 ${Math.max(1, frame.titleFontPx * titleScale)}px ${FONT_STACK}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`[ ${frame.typedText} ]`, titleX, titleY)
    }
    ctx.globalAlpha = 1
  }, [active, faceRectAnchor, scrollProgress, targetAnchor])

  drawRef.current = draw

  useEffect(() => {
    draw()
  }, [draw])

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
