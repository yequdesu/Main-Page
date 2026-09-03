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
  getSquareWaveFrame,
  SQUARE_WAVE_FADE_GENERATIONS,
  SQUARE_WAVE_SEED_SCALE,
  splitSquareWaveBandForContour,
  type SquareWaveCell,
  type SquareWaveSprite,
} from '../behaviors/squareWaveTransition'
import {
  buildSquareContourLayout,
  getSquareContourTransform,
  getSquareContourTransitionFrame,
  getSquareWaveCanvasTransform,
  getSquareWaveHandoffGeneration,
  type ContourPoint,
  type SquareContourLayout,
} from '../behaviors/act2SquareContourTransition'
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
  for (const sprite of sprites) {
    const opacity = sprite.opacity * opacityMultiplier
    if (opacity <= 0) continue
    ctx.globalAlpha = opacity
    ctx.fillRect(
      sprite.x * logicalSpacing - half,
      sprite.y * logicalSpacing - half,
      logicalSquareSize,
      logicalSquareSize,
    )
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawLogicalContour(
  ctx: CanvasRenderingContext2D,
  squares: readonly ContourPoint[],
  focusX: number,
  focusY: number,
  zoom: number,
  logicalSquareSize: number,
  opacityMultiplier: number,
): void {
  const half = logicalSquareSize * 0.5
  ctx.save()
  ctx.translate(focusX, focusY)
  ctx.scale(zoom, zoom)
  for (const square of squares) {
    const opacity = square.opacity * opacityMultiplier
    if (opacity <= 0) continue
    ctx.globalAlpha = opacity
    ctx.fillRect(
      square.x - half,
      square.y - half,
      logicalSquareSize,
      logicalSquareSize,
    )
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

interface HandoffCache {
  solidSprites: SquareWaveSprite[]
  fadingCells: SquareWaveCell[]
}

interface LayoutCache {
  target: Act3ContourTarget
  logicalSquareSize: number
  handoffZoom: number
  centerX: number
  centerY: number
  layout: SquareContourLayout
}

export default function Act2SquareContourTransition() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handoffCacheRef = useRef<HandoffCache | null>(null)
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

    if (!handoffCacheRef.current) {
      handoffCacheRef.current = splitSquareWaveBandForContour(handoffGeneration)
    }
    const { solidSprites, fadingCells } = handoffCacheRef.current

    if (scrollProgress <= TIMELINE.squareBfsWave.end) {
      drawLogicalWave(
        ctx,
        getSquareWaveBandFrame(waveView.generation),
        initialCenterX,
        initialCenterY,
        waveView.zoom,
        waveView.logicalSpacing,
        waveView.logicalSquareSize,
      )
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
        layoutCacheRef.current = {
          target,
          logicalSquareSize,
          handoffZoom: handoffView.zoom,
          centerX: initialCenterX,
          centerY: initialCenterY,
          layout: buildSquareContourLayout(
            target,
            solidSprites,
            initialCenterX,
            initialCenterY,
            handoffView.logicalSpacing,
            logicalSquareSize,
            handoffView.zoom,
          ),
        }
      }
      layout = layoutCacheRef.current!.layout
      const transform = getSquareContourTransform(layout, frame.zoomProgress)
      drawLogicalContour(
        ctx,
        layout.peripheralSquares,
        transform.focusX,
        transform.focusY,
        transform.zoom,
        layout.logicalSquareSize,
        frame.contourAlpha,
      )
      drawLogicalContour(
        ctx,
        layout.centralSquares,
        transform.focusX,
        transform.focusY,
        transform.zoom,
        layout.logicalSquareSize,
        frame.contourAlpha,
      )

      const fadingGeneration = handoffGeneration +
        SQUARE_WAVE_FADE_GENERATIONS * frame.zoomProgress
      drawLogicalWave(
        ctx,
        getSquareWaveFrame(fadingCells, fadingGeneration),
        transform.focusX,
        transform.focusY,
        transform.zoom,
        layout.logicalSpacing,
        layout.logicalSquareSize,
        frame.contourAlpha,
      )
    } else if (scrollProgress > TIMELINE.squareBfsWave.end) {
      drawLogicalWave(
        ctx,
        getSquareWaveBandFrame(handoffGeneration),
        initialCenterX,
        initialCenterY,
        handoffView.zoom,
        handoffView.logicalSpacing,
        handoffView.logicalSquareSize,
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

  useEffect(() => {
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [draw])

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
