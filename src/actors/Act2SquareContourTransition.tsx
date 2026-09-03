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
  buildSquareWavePlan,
  getSquareWaveFrame,
  SQUARE_WAVE_FADE_GENERATIONS,
  SQUARE_WAVE_SEED_SCALE,
  SQUARE_WAVE_SPACING,
  splitSquareWaveForContour,
  type SquareWaveCell,
} from '../behaviors/squareWaveTransition'
import {
  buildSquareContourLayout,
  getSquareContourFreezeProgress,
  getSquareContourTransform,
  getSquareContourTransitionFrame,
  getSquareWaveHandoffGeneration,
  projectContourPoint,
  SQUARE_CONTOUR_SETTLE_GENERATIONS,
  type SquareContourLayout,
} from '../behaviors/act2SquareContourTransition'
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'
import { useActorRuntime } from '../composition/actorRuntime'

const FONT_STACK = "'Cascadia Mono','SF Mono','Fira Code','Consolas',monospace"

function drawSquare(
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

interface PlanCache {
  maxGeneration: number
  plan: SquareWaveCell[]
}

interface LayoutCache {
  target: Act3ContourTarget
  squareSize: number
  contourGeneration: number
  centerX: number
  centerY: number
  layout: SquareContourLayout
}

export default function Act2SquareContourTransition() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const planCacheRef = useRef<PlanCache | null>(null)
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
    const initialSquareSize = faceRect.width * SQUARE_WAVE_SEED_SCALE

    if (scrollProgress <= TIMELINE.squareSeedShrink.end) {
      const shrink = smoothstep01(progress('squareSeedShrink', scrollProgress))
      const scale = 1 + (SQUARE_WAVE_SEED_SCALE - 1) * shrink
      drawSquare(ctx, initialCenterX, initialCenterY, faceRect.width * scale, 1, dpr)
      ctx.globalAlpha = 1
      return
    }

    const waveEndGeneration = getSquareWaveHandoffGeneration(width, height, initialSquareSize)
    const contourGeneration = waveEndGeneration + SQUARE_CONTOUR_SETTLE_GENERATIONS
    const maxGeneration = Math.ceil(contourGeneration) + 1
    if (planCacheRef.current?.maxGeneration !== maxGeneration) {
      planCacheRef.current = { maxGeneration, plan: buildSquareWavePlan(maxGeneration) }
      layoutCacheRef.current = null
    }
    const plan = planCacheRef.current.plan
    const initialSpacing = initialSquareSize * SQUARE_WAVE_SPACING
    const waveProgress = progress('squareBfsWave', scrollProgress) * waveEndGeneration

    const { solidSprites: persistentWave, fadingCells } = splitSquareWaveForContour(
      plan,
      contourGeneration,
    )

    if (scrollProgress <= TIMELINE.squareBfsWave.end) {
      const sprites = getSquareWaveFrame(plan, waveProgress)
      for (const sprite of sprites) {
        drawSquare(
          ctx,
          initialCenterX + sprite.x * initialSpacing,
          initialCenterY + sprite.y * initialSpacing,
          initialSquareSize,
          sprite.opacity,
          dpr,
        )
      }
    }

    const target = targetAnchor?.value
    let layout: SquareContourLayout | undefined
    if (scrollProgress > TIMELINE.squareBfsWave.end && target) {
      const cached = layoutCacheRef.current
      if (
        !cached || cached.target !== target || cached.squareSize !== initialSquareSize ||
        cached.contourGeneration !== contourGeneration || cached.centerX !== initialCenterX ||
        cached.centerY !== initialCenterY
      ) {
        layoutCacheRef.current = {
          target,
          squareSize: initialSquareSize,
          contourGeneration,
          centerX: initialCenterX,
          centerY: initialCenterY,
          layout: buildSquareContourLayout(
            target,
            persistentWave,
            initialCenterX,
            initialCenterY,
            initialSpacing,
            initialSquareSize,
          ),
        }
      }
      layout = layoutCacheRef.current?.layout
      if (layout) {
        const transform = getSquareContourTransform(layout, frame.zoomProgress)
        const contourFreezeProgress = getSquareContourFreezeProgress(layout, width, height)
        const drawMappedWave = (sprite: { x: number; y: number; opacity: number }) => {
          const point = projectContourPoint({
            x: layout!.centralX + (sprite.x * initialSpacing) / layout!.zoomStart,
            y: layout!.centralY + (sprite.y * initialSpacing) / layout!.zoomStart,
          }, layout!, transform)
          drawSquare(
            ctx,
            point.x,
            point.y,
            transform.squareSize,
            sprite.opacity * frame.contourAlpha,
            dpr,
          )
        }

        if (frame.zoomProgress < contourFreezeProgress) {
          const settleProgress = contourFreezeProgress <= 0
            ? 1
            : Math.max(0, Math.min(1, frame.zoomProgress / contourFreezeProgress))
          const evolvingGeneration = waveEndGeneration +
            SQUARE_CONTOUR_SETTLE_GENERATIONS * settleProgress
          for (const sprite of getSquareWaveFrame(plan, evolvingGeneration)) drawMappedWave(sprite)
        } else {
          for (const square of [...layout.peripheralSquares, ...layout.centralSquares]) {
            const point = projectContourPoint(square, layout, transform)
            drawSquare(
              ctx,
              point.x,
              point.y,
              transform.squareSize,
              square.opacity * frame.contourAlpha,
              dpr,
            )
          }

          const fadeProgress = contourFreezeProgress >= 1
            ? 1
            : Math.max(0, Math.min(
                1,
                (frame.zoomProgress - contourFreezeProgress) / (1 - contourFreezeProgress),
              ))
          const fadingGeneration = contourGeneration + SQUARE_WAVE_FADE_GENERATIONS * fadeProgress
          for (const sprite of getSquareWaveFrame(fadingCells, fadingGeneration)) drawMappedWave(sprite)
        }
      }
    } else if (scrollProgress > TIMELINE.squareBfsWave.end) {
      for (const sprite of getSquareWaveFrame(plan, waveEndGeneration)) {
        drawSquare(
          ctx,
          initialCenterX + sprite.x * initialSpacing,
          initialCenterY + sprite.y * initialSpacing,
          initialSquareSize,
          sprite.opacity * frame.contourAlpha,
          dpr,
        )
      }
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
