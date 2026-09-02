import { useCallback, useEffect, useRef } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import { useAnchorStore, type Anchor } from '../composition/anchorStore'
import { miniatureFaceRectAnchorId } from '../composition/coreAnchors'
import type { LayoutBox } from '../composition/coordinate'
import { getDomLayer } from '../composition/layerRegistry'
import {
  buildSquareWavePlan,
  getRequiredSquareWaveGenerations,
  getSquareWaveFrame,
  SQUARE_WAVE_SEED_SCALE,
  SQUARE_WAVE_SPACING,
  type SquareWaveCell,
} from '../behaviors/squareWaveTransition'
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'
import { useActorRuntime } from '../composition/actorRuntime'

function drawSquare(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  opacity: number,
): void {
  if (opacity <= 0 || size <= 0) return
  ctx.globalAlpha = opacity
  ctx.fillRect(centerX - size * 0.5, centerY - size * 0.5, size, size)
}

export default function SquareWaveTransition() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const planCacheRef = useRef<{ maxGeneration: number; plan: SquareWaveCell[] } | null>(null)
  const scrollProgress = useScrollStore((state) => state.scrollProgress)
  const faceRectAnchor = useAnchorStore(
    (state) => state.anchors[miniatureFaceRectAnchorId],
  ) as Anchor<LayoutBox> | undefined
  const layer = getDomLayer('dom.squareWaveTransition')
  const active = scrollProgress >= TIMELINE.squareSeedShrink.start &&
    scrollProgress < TIMELINE.squareBfsWave.end
  useActorRuntime('squareWaveTransition', active)

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
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const faceRect = faceRectAnchor?.value
    if (!active || !faceRect || faceRect.width <= 0) {
      canvas.style.opacity = '0'
      return
    }

    canvas.style.opacity = '1'
    ctx.fillStyle = '#ffffff'
    const centerX = faceRect.x + faceRect.width * 0.5
    const centerY = faceRect.y + faceRect.height * 0.5

    if (scrollProgress <= TIMELINE.squareSeedShrink.end) {
      const shrink = smoothstep01(progress('squareSeedShrink', scrollProgress))
      const scale = 1 + (SQUARE_WAVE_SEED_SCALE - 1) * shrink
      drawSquare(ctx, centerX, centerY, faceRect.width * scale, 1)
      ctx.globalAlpha = 1
      return
    }

    const squareSize = faceRect.width * SQUARE_WAVE_SEED_SCALE
    const maxGeneration = getRequiredSquareWaveGenerations(width, height, squareSize)
    if (planCacheRef.current?.maxGeneration !== maxGeneration) {
      planCacheRef.current = {
        maxGeneration,
        plan: buildSquareWavePlan(maxGeneration),
      }
    }
    const plan = planCacheRef.current.plan
    const generationProgress = progress('squareBfsWave', scrollProgress) * maxGeneration
    const sprites = getSquareWaveFrame(plan, generationProgress)
    const spacing = squareSize * SQUARE_WAVE_SPACING

    for (const sprite of sprites) {
      drawSquare(
        ctx,
        centerX + sprite.x * spacing,
        centerY + sprite.y * spacing,
        squareSize,
        sprite.opacity,
      )
    }
    ctx.globalAlpha = 1
  }, [faceRectAnchor, scrollProgress])

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
