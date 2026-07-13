import { useEffect, useRef } from 'react'
import { getDomLayer } from '../composition/layerRegistry'
import {
  computeFocusInversionCircleGeometry,
  computeHudTangentGeometry,
  FOCUS_EFFECT_EXIT_DURATION,
  focusExitDuration,
  focusLayerProgress,
  reverseFocusLayerProgress,
} from '../composition/focusCorridorGeometry'
import { registerFocusHudRenderer, type FocusHudFrame } from './focusHudBridge'
import { getFocusInversionConfig } from './focusInversionConfig'
import type { ScreenCircle } from '../types'

interface InversionBlock {
  x: number
  yJitter: number
  size: number
  sizeRatio: number
  opacity: number
  seed: number
  appearProgress: number
  appearFlashProgress: number
  exitFlashDuration: number
  exitDelay: number
  isFrame: boolean
  instability: number
  event: BlockEvent | null
  visibleAtExit: boolean
}

interface BlockEvent {
  type: 'teleport' | 'flicker'
  startedAt: number
  duration: number
  offsetX: number
  offsetY: number
}

interface BlockSequence {
  id: number
  focusedPlanetIdx: number
  blocks: InversionBlock[]
  axis: FocusAxis
  focusAge: number
  drawProgress: number
  restAt: number
  lastEventAge: number
  exitStartedAt: number | null
  exitProgress: number
  exitStartFocusAge: number | null
}

interface BodySnapshot {
  x: number
  y: number
  r: number
}

interface FocusAxis {
  originX: number
  originY: number
  dirX: number
  dirY: number
  normalX: number
  normalY: number
  star: BodySnapshot
  planet: BodySnapshot
  starCircle: ScreenCircle
  planetCircle: ScreenCircle
}

const EXIT_DURATION = FOCUS_EFFECT_EXIT_DURATION

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalRandom(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

function axisFromFrame(frame: FocusHudFrame): FocusAxis {
  const star = frame.star
  const planet = frame.planet
  if (!star || !planet) {
    return {
      originX: 0,
      originY: 0,
      dirX: Math.SQRT1_2,
      dirY: Math.SQRT1_2,
      normalX: -Math.SQRT1_2,
      normalY: Math.SQRT1_2,
      star: { x: 0, y: 0, r: 1 },
      planet: { x: 0, y: 0, r: 1 },
      starCircle: { x: 0, y: 0, r: 1 },
      planetCircle: { x: 0, y: 0, r: 1 },
    }
  }

  const dx = planet.x - star.x
  const dy = planet.y - star.y
  const baseAngle = Math.atan2(dy, dx)
  const angle = baseAngle + Math.PI / 6
  return {
    originX: (star.x + planet.x) * 0.5,
    originY: (star.y + planet.y) * 0.5,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    normalX: -Math.sin(angle),
    normalY: Math.cos(angle),
    star: { x: star.x, y: star.y, r: star.r },
    planet: { x: planet.x, y: planet.y, r: planet.r },
    starCircle: star,
    planetCircle: planet,
  }
}

function randomBlock(): InversionBlock {
  const config = getFocusInversionConfig()
  // Use a broad horizontal mixture: the uniform component supplies enough
  // edge samples, while the normal component keeps the center visually rich.
  const x = Math.random() < config.edgeUniformMix
    ? Math.random()
    : clamp(0.5 + normalRandom() * config.horizontalSpread, 0.012, 0.988)
  const horizontalDistance = Math.abs(x - 0.5)
  const centerWeight = Math.exp(-0.5 * Math.pow(horizontalDistance / config.centerSizeSigma, 2))

  // Size frequency is reverse half-normal and independent from x. The
  // horizontal center weight only caps the size envelope, preventing large
  // blocks from appearing in the edge tails without overpopulating center.
  const reverseNormalSize = clamp(Math.abs(normalRandom()) * config.reverseSizeScale, 0.005, 0.86)
  const edgeCapacity = config.edgeSizeCapacity + centerWeight * (1 - config.edgeSizeCapacity)
  const sizeRatio = clamp(reverseNormalSize * edgeCapacity, 0.005, 0.92)
  const size = config.minBlockSize + (config.maxBlockSize - config.minBlockSize) * sizeRatio
  const frameProbability = config.frameBaseProbability * Math.exp(-0.5 * Math.pow(sizeRatio / config.frameSizeSigma, 2)) + 0.04
  const isFrame = Math.random() < frameProbability

  // Left-side blocks enter first so their reveal travels with the HUD's
  // left-to-right line drawing.
  const appearProgress = clamp(0.03 + x * 0.94 + (1 - sizeRatio) * 0.02 + Math.random() * 0.018, 0.02, 0.99)

  // Edge samples are pulled tightly onto the horizontal axis; center samples
  // retain the wider vertical jitter that makes the axis feel organic.
  const axisSpread = 0.003 + centerWeight * config.axisJitter

  return {
    x,
    yJitter: clamp(normalRandom() * axisSpread, -0.05, 0.05),
    size,
    sizeRatio,
    opacity: 0.62 + Math.random() * 0.38,
    seed: Math.random() * 1000,
    appearProgress,
    appearFlashProgress: 0.035 + Math.random() * 0.045,
    exitFlashDuration: 0.16 + Math.random() * 0.18,
    // Small blocks begin the exit flicker first; large blocks hold longer.
    exitDelay: 0.04 + sizeRatio * 0.30,
    isFrame,
    instability: clamp(1 - Math.pow(sizeRatio, 0.65), 0.08, 1),
    event: null,
    visibleAtExit: false,
  }
}

function createBlocks(): InversionBlock[] {
  const config = getFocusInversionConfig()
  const blocks = Array.from({ length: Math.max(1, Math.round(config.blockCount)) }, randomBlock)
  const maxX = clamp(0.5 + normalRandom() * 0.04, 0.44, 0.56)
  const minX = Math.random() < 0.5
    ? 0.02 + Math.random() * 0.08
    : 0.90 + Math.random() * 0.08

  // Guarantee the requested size floor and ceiling without allowing the
  // forced large block to appear outside the horizontal center region.
  blocks[0] = {
    ...blocks[0],
    x: maxX,
    sizeRatio: 1,
    size: config.maxBlockSize,
    isFrame: false,
    appearProgress: 0.03 + maxX * 0.94,
    exitDelay: 0.34,
    instability: 0.08,
    event: null,
    visibleAtExit: false,
  }
  blocks[1] = {
    ...blocks[1],
    x: minX,
    sizeRatio: 0,
    size: config.minBlockSize,
    isFrame: true,
    appearProgress: 0.03 + minX * 0.94 + 0.02,
    exitDelay: 0.04,
    instability: 1,
    event: null,
    visibleAtExit: false,
  }
  return blocks
}

function hashNoise(value: number): number {
  const result = Math.sin(value * 12.9898) * 43758.5453123
  return result - Math.floor(result)
}

function flickerEnvelope(age: number, start: number, end: number, seed: number): number {
  if (age < start || age >= end) return 0
  const progress = age - start
  const duration = end - start
  const edge = Math.min(
    smoothstep(0, duration * 0.34, progress),
    1 - smoothstep(duration * 0.66, duration, progress),
  )
  const pulseIndex = Math.floor(progress * 28)
  const pulse = hashNoise(seed + pulseIndex * 1.73)
  const flicker = pulse > 0.42 ? 1 : 0.12 + pulse * 0.28
  return edge * flicker
}

function activeBlockOpacity(block: InversionBlock, drawProgress: number): number {
  if (drawProgress < block.appearProgress) return 0
  if (drawProgress < block.appearProgress + block.appearFlashProgress) {
    return flickerEnvelope(
      drawProgress,
      block.appearProgress,
      block.appearProgress + block.appearFlashProgress,
      block.seed,
    )
  }
  return 1
}

function exitingBlockOpacity(block: InversionBlock, exitAge: number): number {
  if (exitAge < block.exitDelay) return 1
  return flickerEnvelope(
    exitAge,
    block.exitDelay,
    block.exitDelay + block.exitFlashDuration,
    block.seed + 47.3,
  )
}

function createRayRegion(width: number, height: number, axis: FocusAxis): Path2D | null {
  const geometry = computeHudTangentGeometry(axis.starCircle, axis.planetCircle, width, height)
  if (!geometry || geometry.lines.length < 2) return null
  const [lineA, lineB] = geometry.lines
  const region = new Path2D()
  region.moveTo(lineA.x1, lineA.y1)
  region.lineTo(lineA.x2, lineA.y2)
  region.lineTo(lineB.x2, lineB.y2)
  region.lineTo(lineB.x1, lineB.y1)
  region.closePath()
  return region
}

function getInversionCircleCenters(
  sequence: BlockSequence,
  width: number,
  height: number,
  progress: number[],
): ReturnType<typeof computeFocusInversionCircleGeometry> {
  return computeFocusInversionCircleGeometry(
    sequence.axis.starCircle,
    width,
    height,
    sequence.focusAge,
    progress,
  )
}

function getSequenceLayerProgress(sequence: BlockSequence, layerOrder: number): number {
  if (sequence.exitStartedAt === null) return focusLayerProgress(sequence.focusAge, layerOrder)
  return reverseFocusLayerProgress(
    focusLayerProgress(sequence.exitStartFocusAge ?? sequence.focusAge, layerOrder),
    sequence.exitProgress,
    layerOrder,
    focusExitDuration(sequence.exitStartFocusAge ?? sequence.focusAge),
  )
}

function drawCircularInversionRegions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sequence: BlockSequence,
  now: number,
): void {
  const circleProgresses = [
    getSequenceLayerProgress(sequence, 1),
    getSequenceLayerProgress(sequence, 3),
    getSequenceLayerProgress(sequence, 5),
  ]
  const circleCenters = getInversionCircleCenters(sequence, width, height, circleProgresses)

  ctx.save()
  // XOR creates a binary mask: where a circle crosses an existing square
  // inversion, the intersection becomes transparent instead of stacking a
  // second inversion.
  ctx.globalCompositeOperation = 'xor'
  ctx.fillStyle = '#ffffff'
  for (let index = 0; index < circleCenters.length; index += 1) {
    const progress = circleProgresses[index]
    if (progress <= 0.001) continue
    ctx.globalAlpha = progress > 0.55 ? 1 : progress
    const circle = circleCenters[index]
    ctx.beginPath()
    ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function updateRestEvents(sequence: BlockSequence, now: number): void {
  if (sequence.exitStartedAt !== null || sequence.focusAge < sequence.restAt) return
  const deltaAge = Math.max(0, sequence.focusAge - sequence.lastEventAge)
  sequence.lastEventAge = sequence.focusAge

  for (const block of sequence.blocks) {
    if (block.event && now - block.event.startedAt >= block.event.duration) {
      block.event = null
    }
    if (block.event || deltaAge <= 0) continue

    const eventProbability = 1 - Math.exp(-block.instability * getFocusInversionConfig().restEventRate * deltaAge)
    if (Math.random() >= eventProbability) continue

    const teleport = Math.random() < 0.56
    block.event = {
      type: teleport ? 'teleport' : 'flicker',
      startedAt: now,
      duration: teleport ? 0.10 + Math.random() * 0.08 : 0.08 + Math.random() * 0.16,
      offsetX: teleport ? (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2.5) : 0,
      offsetY: teleport ? (Math.random() - 0.5) * 2.5 : 0,
    }
  }
}

function eventVisual(block: InversionBlock, now: number): { opacity: number; offsetX: number; offsetY: number } {
  const event = block.event
  if (!event) return { opacity: 1, offsetX: 0, offsetY: 0 }
  const progress = clamp((now - event.startedAt) / event.duration, 0, 1)
  if (event.type === 'teleport') {
    return {
      opacity: 1,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
    }
  }

  const pulse = hashNoise(block.seed + Math.floor(progress * 36) * 2.11)
  return {
    opacity: pulse > 0.45 ? 1 : 0.08,
    offsetX: 0,
    offsetY: 0,
  }
}

function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
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

function drawSequences(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sequences: BlockSequence[],
  now: number,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffffff'

  for (const sequence of sequences) {
    updateRestEvents(sequence, now)
    const exitAge = sequence.exitStartedAt === null ? 0 : now - sequence.exitStartedAt
    const sequenceAlpha = sequence.exitStartedAt === null
      ? smoothstep(0.02, 0.20, sequence.focusAge)
      : 1 - smoothstep(0, EXIT_DURATION, exitAge)
    if (sequenceAlpha <= 0.001) continue

    for (const block of sequence.blocks) {
      if (sequence.exitStartedAt !== null && !block.visibleAtExit) continue
      const flicker = sequence.exitStartedAt === null
        ? activeBlockOpacity(block, sequence.drawProgress)
        : exitingBlockOpacity(block, exitAge)
      if (flicker < 0.5) continue

      const event = sequence.exitStartedAt === null
        ? eventVisual(block, now)
        : { opacity: 1, offsetX: 0, offsetY: 0 }
      const extent = Math.hypot(width, height) * 0.72
      const along = (block.x - 0.5) * extent * 2
      const normalOffset = height * block.yJitter
      const x = sequence.axis.originX + sequence.axis.dirX * along + sequence.axis.normalX * normalOffset + event.offsetX - block.size * 0.5
      const y = sequence.axis.originY + sequence.axis.dirY * along + sequence.axis.normalY * normalOffset + event.offsetY - block.size * 0.5
      if (x < 0 || x + block.size > width || y < 0 || y + block.size > height) continue
      ctx.globalAlpha = 1
      if (block.isFrame) {
        ctx.lineWidth = Math.min(1.4, Math.max(0.6, block.size * 0.08))
        ctx.strokeStyle = '#ffffff'
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.ceil(block.size), Math.ceil(block.size))
      } else {
        ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(block.size), Math.ceil(block.size))
      }
    }
  }

  for (const sequence of sequences) {
    drawCircularInversionRegions(ctx, width, height, sequence, now)
  }

  // Remove the inverted pixels inside the two-ray corridor. The exclusion is
  // applied after all sequences are composited, so the intersection is never
  // inverted even when multiple focus sequences overlap.
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = 1
  for (const sequence of sequences) {
    const region = createRayRegion(width, height, sequence.axis)
    if (region) ctx.fill(region)
  }
  ctx.restore()
}

export default function FocusInversionBlocks() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sequencesRef = useRef<BlockSequence[]>([])
  const nextSequenceIdRef = useRef(0)
  const activeSequenceIdRef = useRef<number | null>(null)
  const lastFocusAgeRef = useRef(0)
  const layer = getDomLayer('dom.focusInversionBlocks')

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let disposed = false
    let rafId: number | null = null
    const draw = () => {
      if (disposed) return
      const { width, height } = resizeCanvas(canvas, ctx)
      const now = performance.now() / 1000
      sequencesRef.current = sequencesRef.current.filter((sequence) => (
        sequence.exitStartedAt === null || now - sequence.exitStartedAt < EXIT_DURATION
      ))
      canvas.style.opacity = sequencesRef.current.length > 0 ? '1' : '0'
      drawSequences(ctx, width, height, sequencesRef.current, now)
    }

    const tick = () => {
      rafId = null
      draw()
      if (sequencesRef.current.length > 0) rafId = requestAnimationFrame(tick)
    }

    const ensureAnimation = () => {
      if (rafId === null) rafId = requestAnimationFrame(tick)
    }

    const markActiveSequencesExiting = () => {
      const now = performance.now() / 1000
      for (const sequence of sequencesRef.current) {
        if (sequence.exitStartedAt !== null) continue
        sequence.exitStartedAt = now
        sequence.exitProgress = 0
        sequence.exitStartFocusAge = sequence.focusAge
        for (const block of sequence.blocks) {
          const wasVisible = activeBlockOpacity(block, sequence.drawProgress) >= 0.5
          const eventVisible = eventVisual(block, now).opacity >= 0.5
          block.visibleAtExit = wasVisible && eventVisible
        }
      }
    }

    const render = (frame: FocusHudFrame) => {
      if (disposed) return
      const current = sequencesRef.current.find((sequence) => sequence.id === activeSequenceIdRef.current)
      const restarted = frame.focused && frame.focusAge < lastFocusAgeRef.current - 0.25
      const changedTarget = frame.focused && current !== undefined && current.focusedPlanetIdx !== frame.focusedPlanetIdx

      if (!frame.focused || frame.phase === 'exit') {
        markActiveSequencesExiting()
        for (const sequence of sequencesRef.current) {
          if (sequence.exitStartedAt !== null) sequence.exitProgress = frame.exitProgress
        }
        activeSequenceIdRef.current = null
      } else if (!current || restarted || changedTarget) {
        markActiveSequencesExiting()
        const blocks = createBlocks()
        const sequence: BlockSequence = {
          id: nextSequenceIdRef.current++,
          focusedPlanetIdx: frame.focusedPlanetIdx,
          blocks,
          axis: axisFromFrame(frame),
          focusAge: frame.focusAge,
          drawProgress: frame.drawProgress,
          restAt: 2.35,
          lastEventAge: frame.focusAge,
          exitStartedAt: null,
          exitProgress: 0,
          exitStartFocusAge: null,
        }
        sequencesRef.current.push(sequence)
        activeSequenceIdRef.current = sequence.id
      } else {
        current.focusAge = frame.focusAge
        current.drawProgress = frame.drawProgress
        current.axis = axisFromFrame(frame)
      }

      lastFocusAgeRef.current = frame.focusAge
      ensureAnimation()
      draw()
    }

    const handleResize = () => draw()
    const unregister = registerFocusHudRenderer(render)
    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      disposed = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      unregister()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="focus-inversion-blocks"
      aria-hidden="true"
      style={{
        position: layer.position,
        inset: 0,
        zIndex: layer.zIndex,
        pointerEvents: 'none',
        opacity: 0,
        mixBlendMode: 'difference',
        willChange: 'opacity',
      }}
    />
  )
}
