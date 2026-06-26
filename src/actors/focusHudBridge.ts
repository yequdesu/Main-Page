import type { DayNight } from '../stores/scrollStore'
import type { ScreenCircle } from '../types'

export interface FocusHudCameraData {
  pos: { x: number; y: number; z: number }
}

export interface FocusHudFrame {
  focused: boolean
  alpha: number
  focusedPlanetIdx: number
  dayNight: DayNight
  camera: FocusHudCameraData
  star?: ScreenCircle
  planet?: ScreenCircle
}

type FocusHudRenderer = (frame: FocusHudFrame) => void

let renderer: FocusHudRenderer | null = null

export function registerFocusHudRenderer(nextRenderer: FocusHudRenderer): () => void {
  renderer = nextRenderer
  return () => {
    if (renderer === nextRenderer) renderer = null
  }
}

export function renderFocusHudFrame(frame: FocusHudFrame): void {
  renderer?.(frame)
}
