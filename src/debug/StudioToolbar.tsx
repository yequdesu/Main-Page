import { MODEL_REGISTRY } from '../models'
import type { ViewportMode } from './studioTypes'
interface Props {
  modelKey: string
  onModelChange: (key: string) => void
  viewportMode: ViewportMode
  onViewportModeChange: (mode: ViewportMode) => void
  onFit: () => void
  onReset: () => void
  onExport: () => void
  onToggleLeft: () => void
  onToggleRight: () => void
  leftOpen: boolean
  rightOpen: boolean
}
export default function StudioToolbar(props: Props) {
  return (
    <header className="studio-toolbar">
      <div className="toolbar-brand">
        <strong>
          YeQuDesu <span>Studio</span>
        </strong>
        <select
          aria-label="选择模型"
          value={props.modelKey}
          onChange={(e) => props.onModelChange(e.target.value)}
        >
          {Object.entries(MODEL_REGISTRY).map(([key, entry]) => (
            <option key={key} value={key}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      <div className="toolbar-buttons" aria-label="视图操作">
        <div className="segmented" aria-label="视口布局">
          {(
            [
              ['single', '单视图'],
              ['split', '对比'],
              ['quad', '四视图'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              aria-pressed={props.viewportMode === mode}
              onClick={() => props.onViewportModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={props.onFit}>适配全部</button>
        <button onClick={props.onReset}>重置视角</button>
        <button aria-expanded={props.leftOpen} onClick={props.onToggleLeft}>
          对象栏
        </button>
        <button aria-expanded={props.rightOpen} onClick={props.onToggleRight}>
          参数栏
        </button>
        <button className="primary" onClick={props.onExport}>
          导出 PNG
        </button>
      </div>
    </header>
  )
}
