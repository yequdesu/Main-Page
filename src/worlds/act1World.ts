import { create } from 'zustand'
import { MINIATURE_CUBE_HALF_SIZE, MINIATURE_PIVOT } from '../behaviors/miniatureUniverse'

export type Act1SceneId = 'lighthouse' | 'sunset-wheat'
export const ACT1_WORLD_OPTIONS = [
  { id: 'lighthouse', label: '海浪灯塔' },
  { id: 'sunset-wheat', label: '夕阳麦浪' },
] as const
export const ACT1_LOCAL_BOUNDS = Object.freeze({ halfSize: MINIATURE_CUBE_HALF_SIZE })
export const LEGACY_WORLD_OFFSET = MINIATURE_PIVOT.map(v => -v) as [number, number, number]
export interface Act1WorldProps {
  bounds: typeof ACT1_LOCAL_BOUNDS
  sceneProgress: number
  active: boolean
}
// Deliberately not persisted: reload always restores the production lighthouse.
export const useAct1WorldStore = create<{
  sceneId: Act1SceneId
  selectScene: (id: Act1SceneId) => void
}>()(set => ({ sceneId: 'lighthouse', selectScene: sceneId => set({ sceneId }) }))
