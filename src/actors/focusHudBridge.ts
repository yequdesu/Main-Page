import type { DayNight } from '../stores/scrollStore'
import type { ScreenCircle } from '../types'

export interface FocusHudCameraData {
  pos: { x: number; y: number; z: number }
}

export interface FocusHudFrame {
  focused: boolean
  alpha: number
  drawProgress: number
  phase: 'reveal' | 'steady' | 'exit' | 'hidden'
  focusAge: number
  focusedPlanetIdx: number
  dayNight: DayNight
  camera: FocusHudCameraData
  star?: ScreenCircle
  planet?: ScreenCircle
}

type FocusHudRenderer = (frame: FocusHudFrame) => void

const renderers = new Set<FocusHudRenderer>()

export function registerFocusHudRenderer(nextRenderer: FocusHudRenderer): () => void {
  renderers.add(nextRenderer)
  return () => {
    renderers.delete(nextRenderer)
  }
}

export function renderFocusHudFrame(frame: FocusHudFrame): void {
  for (const renderer of renderers) renderer(frame)
}
