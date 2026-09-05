import { useEffect, useRef } from 'react'
import { getDomLayer } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'

let scanCanvas: HTMLCanvasElement | null = null
export const getParticleScanCanvas = () => scanCanvas

export default function MiniatureParticleScan() {
  const ref = useRef<HTMLCanvasElement>(null)
  useActorRuntime('miniatureParticleScan', true)
  useEffect(() => {
    const canvas = ref.current
    scanCanvas = canvas
    return () => { if (scanCanvas === canvas) scanCanvas = null }
  }, [])
  const layer = getDomLayer('dom.miniatureParticleScan')
  return <canvas ref={ref} aria-hidden="true" style={{
    position: 'fixed', inset: 0, width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: layer.zIndex,
  }} />
}
