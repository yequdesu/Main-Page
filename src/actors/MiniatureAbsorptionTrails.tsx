import { useCallback, useEffect, useMemo, useRef } from 'react'
import { getCircleConnector } from '../behaviors/motionTrail'
import {
  buildRandomAbsorptionTrailBatch,
  getAbsorptionTrailFrame,
  type AbsorptionCircle,
} from '../behaviors/miniatureAbsorptionTrails'
import { SQUARE_WAVE_SEED_SCALE } from '../behaviors/squareWaveTransition'
import { useAnchorStore, type Anchor } from '../composition/anchorStore'
import { useActorRuntime } from '../composition/actorRuntime'
import {
  miniatureFaceRectAnchorId,
  miniatureScreenBoundsAnchorId,
} from '../composition/coreAnchors'
import type { LayoutBox } from '../composition/coordinate'
import { getDomLayer } from '../composition/layerRegistry'
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'
import { useScrollStore } from '../stores/scrollStore'

function createRuntimeSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    if (values[0] !== 0) return values[0]
  }
  return Math.max(1, Math.floor(Math.random() * 0xffff_ffff))
}

function drawConnectedCircles(
  ctx: CanvasRenderingContext2D,
  circles: readonly AbsorptionCircle[],
): void {
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
    ctx.beginPath()
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
    ctx.fill()
  }

  ctx.beginPath()
  for (const circle of circles) {
    if (circle.radius <= 0.01) continue
    ctx.moveTo(circle.point.x + circle.radius, circle.point.y)
    ctx.arc(circle.point.x, circle.point.y, circle.radius, 0, Math.PI * 2)
  }
  ctx.fill()
}

export default function MiniatureAbsorptionTrails() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const batch = useMemo(() => buildRandomAbsorptionTrailBatch(createRuntimeSeed()), [])
  const specs = batch.specs
  const scrollProgress = useScrollStore((state) => state.scrollProgress)
  const boundsAnchor = useAnchorStore(
    (state) => state.anchors[miniatureScreenBoundsAnchorId],
  ) as Anchor<LayoutBox> | undefined
  const faceRectAnchor = useAnchorStore(
    (state) => state.anchors[miniatureFaceRectAnchorId],
  ) as Anchor<LayoutBox> | undefined
  const layer = getDomLayer('dom.miniatureAbsorptionTrails')
  const active = scrollProgress >= TIMELINE.cubeAbsorptionTrails.start &&
    scrollProgress < TIMELINE.cubeAbsorptionTrails.end
  useActorRuntime('miniatureAbsorptionTrails', active)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    let bounds = boundsAnchor?.value
    if (scrollProgress > TIMELINE.cubeWhiteFill.end && faceRectAnchor?.value) {
      const faceRect = faceRectAnchor.value
      const seedShrink = smoothstep01(progress('squareSeedShrink', scrollProgress))
      const scale = 1 + (SQUARE_WAVE_SEED_SCALE - 1) * seedShrink
      const centerX = faceRect.x + faceRect.width * 0.5
      const centerY = faceRect.y + faceRect.height * 0.5
      bounds = {
        x: centerX - faceRect.width * scale * 0.5,
        y: centerY - faceRect.height * scale * 0.5,
        width: faceRect.width * scale,
        height: faceRect.height * scale,
      }
    }
    if (!active || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      canvas.style.opacity = '0'
      return
    }

    canvas.style.opacity = '1'
    context.fillStyle = '#f2f6ff'
    for (const spec of specs) {
      const frame = getAbsorptionTrailFrame(spec, scrollProgress, width, height, bounds)
      if (!frame.active) continue
      drawConnectedCircles(context, frame.circles)
    }
  }, [active, boundsAnchor, faceRectAnchor, scrollProgress, specs])

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
