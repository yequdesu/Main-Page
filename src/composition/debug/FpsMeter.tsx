import { useEffect, useRef } from 'react'
import { getDomLayer } from '../layerRegistry'
import './FpsMeter.css'

const SAMPLE_INTERVAL_MS = 250

export default function FpsMeter() {
  const rafValueRef = useRef<HTMLSpanElement | null>(null)
  const glValueRef = useRef<HTMLSpanElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let raf = 0
    let rafFrames = 0
    let lastGlFrames = (window as any).__WEBGL_FRAME_COUNT__ ?? 0
    let lastSample = performance.now()

    const tick = (now: number) => {
      rafFrames += 1
      const elapsed = now - lastSample
      if (elapsed >= SAMPLE_INTERVAL_MS) {
        const currentGlFrames = (window as any).__WEBGL_FRAME_COUNT__ ?? 0
        const rafFps = Math.round((rafFrames * 1000) / elapsed)
        const glFps = Math.round(((currentGlFrames - lastGlFrames) * 1000) / elapsed)
        const fps = Math.min(rafFps, glFps)
        if (rafValueRef.current) rafValueRef.current.textContent = String(rafFps)
        if (glValueRef.current) glValueRef.current.textContent = String(glFps)
        if (rootRef.current) {
          rootRef.current.dataset.level = fps >= 55 ? 'good' : fps >= 30 ? 'warn' : 'bad'
        }
        rafFrames = 0
        lastGlFrames = currentGlFrames
        lastSample = now
      }
      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  const layer = getDomLayer('dom.debugPanel')

  return (
    <div
      ref={rootRef}
      className="fps-meter"
      data-level="good"
      style={{ position: layer.position, zIndex: layer.zIndex + 1 }}
      aria-label="Frames per second"
    >
      <div className="fps-meter__row">
        <small>RAF</small>
        <span ref={rafValueRef}>--</span>
      </div>
      <div className="fps-meter__row">
        <small>GL</small>
        <span ref={glValueRef}>--</span>
      </div>
    </div>
  )
}
