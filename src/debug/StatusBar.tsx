import { useRef, useEffect } from 'react'

const _fpsHistory = new Float32Array(60)
let _fpsIdx = 0

/**
 * StatusBar — 底部性能监控条。
 *
 * FPS 通过独立 requestAnimationFrame 采样（与 R3F useFrame 解耦）。
 * Draw Calls / Triangles 由 StudioViewport 中的 RendererStats
 * 写入 canvas dataset，这里通过轮询读取。
 *
 * 援引：Stats.js FPS 计数算法
 */
export default function StatusBar() {
  const fpsRef = useRef<HTMLSpanElement>(null)
  const dcRef = useRef<HTMLSpanElement>(null)
  const triRef = useRef<HTMLSpanElement>(null)
  const lastTime = useRef(performance.now())
  const frameCount = useRef(0)

  // FPS 独立采样（requestAnimationFrame，500ms 更新一次）
  useEffect(() => {
    let raf = 0
    const tick = () => {
      frameCount.current++
      const now = performance.now()
      const elapsed = now - lastTime.current
      if (elapsed >= 500) {
        const fps = Math.round((frameCount.current / elapsed) * 1000)
        frameCount.current = 0
        lastTime.current = now
        _fpsHistory[_fpsIdx % 60] = fps
        _fpsIdx++
        let sum = 0; let count = 0
        for (let i = 0; i < 60; i++) {
          if (_fpsHistory[i] > 0) { sum += _fpsHistory[i]; count++ }
        }
        const avgFps = count > 0 ? Math.round(sum / count) : fps
        if (fpsRef.current) fpsRef.current.textContent = String(avgFps)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Draw calls / triangles — 从 canvas dataset 定时轮询
  useEffect(() => {
    const interval = setInterval(() => {
      const canvas = document.querySelector('.studio-viewport canvas') as HTMLCanvasElement | null
      const dc = canvas?.getAttribute('data-drawcalls') ?? '—'
      const tris = canvas?.getAttribute('data-triangles') ?? '—'
      if (dcRef.current) dcRef.current.textContent = String(dc)
      if (triRef.current) triRef.current.textContent = String(tris)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="studio-status-bar">
      <span>
        <span className="status-indicator live" />
        FPS <span ref={fpsRef}>—</span>
      </span>
      <span>Draw Calls: <span ref={dcRef}>—</span></span>
      <span>Tris: <span ref={triRef}>—</span></span>
    </div>
  )
}
