export interface LusionAtmosphereFrame {
  active: boolean
  alpha: number
  time: number
  occluderWeights?: [number, number, number]
}

type LusionAtmosphereRenderer = (frame: LusionAtmosphereFrame) => void

let renderer: LusionAtmosphereRenderer | null = null

export function registerLusionAtmosphereRenderer(nextRenderer: LusionAtmosphereRenderer): () => void {
  renderer = nextRenderer
  return () => {
    if (renderer === nextRenderer) renderer = null
  }
}

export function renderLusionAtmosphereFrame(frame: LusionAtmosphereFrame): void {
  renderer?.(frame)
}
