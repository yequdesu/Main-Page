import { useEffect, useState, type RefObject } from 'react'
import { VIEW_LABELS, type ViewHandle, type ViewId } from './studioTypes'
export default function StatusBar({
  views,
  activeView,
  message,
}: {
  views: RefObject<Map<ViewId, ViewHandle>>
  activeView: ViewId
  message: string
}) {
  const [stats, setStats] = useState({ fps: 0, calls: 0, triangles: 0, rendering: false })
  useEffect(() => {
    let lastFrames = views.current.get(activeView)?.stats.frames ?? 0
    let lastTime = performance.now()
    const timer = setInterval(() => {
      const current = views.current.get(activeView)?.stats
      const now = performance.now()
      if (!current) {
        setStats({ fps: 0, calls: 0, triangles: 0, rendering: false })
        lastFrames = 0
        lastTime = now
        return
      }
      const fps = Math.max(0, Math.round((current.frames - lastFrames) / ((now - lastTime) / 1000)))
      setStats({
        fps,
        calls: current.calls,
        triangles: current.triangles,
        rendering: now - current.lastRender < 600,
      })
      lastFrames = current.frames
      lastTime = now
    }, 500)
    return () => clearInterval(timer)
  }, [views, activeView])
  return (
    <footer className="studio-status-bar">
      <span>
        {VIEW_LABELS[activeView]} · {stats.rendering ? `渲染中 ${stats.fps} FPS` : '空闲 · 按需渲染'}
      </span>
      <span>Draw Calls {stats.calls}</span>
      <span>
        Tris {stats.triangles.toLocaleString()} <span className="muted">含辅助线框</span>
      </span>
      <span className="status-message" role="status">
        {message}
      </span>
    </footer>
  )
}
