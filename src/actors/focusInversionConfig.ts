export interface FocusInversionConfig {
  blockCount: number
  minBlockSize: number
  maxBlockSize: number
  edgeUniformMix: number
  horizontalSpread: number
  centerSizeSigma: number
  reverseSizeScale: number
  edgeSizeCapacity: number
  axisJitter: number
  frameBaseProbability: number
  frameSizeSigma: number
  restEventRate: number
}

export const DEFAULT_FOCUS_INVERSION_CONFIG: FocusInversionConfig = {
  blockCount: 180,
  minBlockSize: 1,
  maxBlockSize: 200,
  edgeUniformMix: 1,
  horizontalSpread: 0.50,
  centerSizeSigma: 0.18,
  reverseSizeScale: 0.30,
  edgeSizeCapacity: 0.03,
  axisJitter: 0.05,
  frameBaseProbability: 0.30,
  frameSizeSigma: 0.70,
  restEventRate: 0.20,
}

let config: FocusInversionConfig = { ...DEFAULT_FOCUS_INVERSION_CONFIG }
const listeners = new Set<() => void>()

export function getFocusInversionConfig(): FocusInversionConfig {
  return config
}

export function updateFocusInversionConfig<K extends keyof FocusInversionConfig>(
  key: K,
  value: FocusInversionConfig[K],
): void {
  config = { ...config, [key]: value }
  for (const listener of listeners) listener()
}

export function resetFocusInversionConfig(): void {
  config = { ...DEFAULT_FOCUS_INVERSION_CONFIG }
  for (const listener of listeners) listener()
}

export function subscribeFocusInversionConfig(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
