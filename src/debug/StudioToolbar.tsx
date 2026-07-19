import { useCallback, useState } from 'react'
import { MODEL_REGISTRY } from '../models'
import type { ViewportMode } from './StudioShell'

interface StudioToolbarProps {
  modelKey: string
  onModelChange: (key: string) => void
  viewportMode: ViewportMode
  onViewportModeChange: (mode: ViewportMode) => void
}

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)

export default function StudioToolbar({
  modelKey, onModelChange, viewportMode, onViewportModeChange,
}: StudioToolbarProps) {
  const [capturing, setCapturing] = useState(false)

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(e.target.value)
  }, [onModelChange])

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('.studio-viewport canvas') as HTMLCanvasElement | null
    if (!canvas) return
    setCapturing(true)
    try {
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `model-preview-${modelKey}-${Date.now()}.png`
      a.click()
    } finally {
      setCapturing(false)
    }
  }, [modelKey])

  return (
    <div className="studio-toolbar">
      <select value={modelKey} onChange={handleSelect}>
        {MODEL_KEYS.map((k) => (
          <option key={k} value={k}>{MODEL_REGISTRY[k].label}</option>
        ))}
      </select>

      <div className="toolbar-buttons">
        <button
          className={`toolbar-btn ${viewportMode === 'single' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('single')}
          title="单视口"
        >☰
        </button>
        <button
          className={`toolbar-btn ${viewportMode === 'split' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('split')}
          title="左右分屏（实体 + 线框）"
        >⛶
        </button>
        <button
          className={`toolbar-btn ${viewportMode === 'quad' ? 'active' : ''}`}
          onClick={() => onViewportModeChange('quad')}
          title="四宫格（正视+侧视+顶视+透视）"
        >⛋
        </button>
        <button
          className="toolbar-btn"
          onClick={handleScreenshot}
          title="截图导出 PNG"
          disabled={capturing}
        >
          {capturing ? '...' : '📷'}
        </button>
      </div>
    </div>
  )
}
