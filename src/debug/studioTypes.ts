import type { Object3D, Group } from 'three'

export type ViewportMode = 'single' | 'split' | 'quad'
export type ViewId = 'perspective' | 'wireframe' | 'front' | 'side' | 'top'
export interface HelperState {
  grid: boolean
  axes: boolean
  bbox: boolean
  wireframe: boolean
}
export interface SceneTreeNode {
  id: string
  name: string
  type: string
  children: SceneTreeNode[]
}
export interface CameraPose {
  distance: number
  azimuth: number
  elevation: number
  target?: [number, number, number]
  zoom?: number
}
export interface ViewStats {
  frames: number
  calls: number
  triangles: number
  lastRender: number
}
export interface ExportOptions {
  width: number
  height: number
  transparent: boolean
  helpers: boolean
}
export interface ViewHandle {
  fit: (selected?: boolean, reset?: boolean) => void
  pose: () => CameraPose
  setPose: (pose: CameraPose) => void
  capture: (options: ExportOptions) => HTMLCanvasElement
  stats: ViewStats
  root: Object3D
  lighthouse: Group | null
}
export interface AnimationState {
  clip: string
  playing: boolean
  speed: number
}
export const VIEW_LABELS: Record<ViewId, string> = {
  perspective: '透视',
  wireframe: '线框',
  front: '正视',
  side: '侧视',
  top: '顶视',
}
