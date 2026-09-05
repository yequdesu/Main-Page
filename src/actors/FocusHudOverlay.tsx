import { useEffect, useRef } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import type { DayNight } from '../stores/scrollStore'
import { PLANET_LINKS, type OverlayData, type ScreenCircle } from '../types'
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
interface HudPalette {
  geometryStroke: string
  tangentStroke: string
  dotFill: string
  cornerStroke: string
  panelFill: string
  panelStroke: string
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
    panelStroke: 'rgba(203, 213, 225, 0.62)',
    panelText: '#e2e8f0',
    panelMutedText: 'rgba(203, 213, 225, 0.76)',
  },
  day: {
    geometryStroke: 'rgba(30, 41, 59, 0.48)',
    tangentStroke: 'rgba(30, 41, 59, 0.44)',
    dotFill: '#334155',
    cornerStroke: '#475569',
    panelFill: 'rgba(248, 250, 252, 0.76)',
    panelStroke: 'rgba(100, 116, 139, 0.54)',
    panelText: '#1e293b',
    panelMutedText: 'rgba(51, 65, 85, 0.72)',
  },
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

function smoothstepNumber(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
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
  ctx.strokeStyle = palette.panelStroke
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

function drawHud(ctx: CanvasRenderingContext2D, width: number, height: number, state: DrawState): void {
  ctx.clearRect(0, 0, width, height)
  if (!state.overlay.focused || !state.overlay.planet) return
  const alpha = state.phase === 'exit' ? state.overlay.alpha ?? 0 : 1
  drawLaunchPanel(ctx, width, height, state.overlay.planet,
    getFocusedTrackIndex(state.focusedPlanetIdx), state.camera, alpha,
    state.drawProgress, HUD_PALETTES[state.dayNight])
}

export default function FocusHudOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
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
      drawHud(ctx, width, height, stateRef.current)
    }

    const handleResize = () => {
      const { width, height } = resizeCanvas(canvas, ctx)
      drawHud(ctx, width, height, stateRef.current)
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
