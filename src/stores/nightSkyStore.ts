import { create } from 'zustand'

export const NIGHT_SKY = {
  seed: 7319, cellDensity: 24, contrast: 0.85,
  palette: ['#0a101c', '#101a29', '#152033'] as [string, string, string],
  darkestColor: '#050811',
  centerBrightness: 0.36, outerBrightness: 1,
  axisX: 0.55, axisY: 0.36,
  rotationRadians: 0.0015, tiltX: 0.28, tiltZ: 0.34,
  deformationAmplitude: 0.018, deformationSpeed: 0.025,
}
export type NightSkyConfig = typeof NIGHT_SKY
export const useNightSkyStore = create<{
  config: NightSkyConfig
  update: (patch: Partial<NightSkyConfig>) => void
  reset: () => void
}>((set) => ({
  config: { ...NIGHT_SKY },
  update: patch => set(state => ({ config: { ...state.config, ...patch } })),
  reset: () => set({ config: { ...NIGHT_SKY } }),
}))
