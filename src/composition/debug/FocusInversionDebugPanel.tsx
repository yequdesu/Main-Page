import { useState, useSyncExternalStore } from 'react'
import { getDomLayer } from '../layerRegistry'
import {
  getFocusInversionConfig,
  resetFocusInversionConfig,
  subscribeFocusInversionConfig,
  updateFocusInversionConfig,
  type FocusInversionConfig,
} from '../../actors/focusInversionConfig'
import './FocusInversionDebugPanel.css'

interface SliderSpec<K extends keyof FocusInversionConfig> {
  key: K
  label: string
  min: number
  max: number
  step: number
  format?: (value: FocusInversionConfig[K]) => string
}

const SLIDERS: SliderSpec<keyof FocusInversionConfig>[] = [
  { key: 'blockCount', label: '数量', min: 10, max: 180, step: 1 },
  { key: 'minBlockSize', label: '最小边长', min: 1, max: 16, step: 1 },
  { key: 'maxBlockSize', label: '最大边长', min: 40, max: 360, step: 1 },
  { key: 'edgeUniformMix', label: '边缘分布', min: 0, max: 1, step: 0.01 },
  { key: 'horizontalSpread', label: '横向方差', min: 0.08, max: 0.5, step: 0.01 },
  { key: 'centerSizeSigma', label: '中心尺寸范围', min: 0.08, max: 0.5, step: 0.01 },
  { key: 'reverseSizeScale', label: '小块密度', min: 0.05, max: 0.5, step: 0.01 },
  { key: 'edgeSizeCapacity', label: '边缘尺寸上限', min: 0, max: 0.5, step: 0.01 },
  { key: 'axisJitter', label: '中轴扰动', min: 0, max: 0.05, step: 0.001 },
  { key: 'frameBaseProbability', label: '线框概率', min: 0, max: 1, step: 0.01 },
  { key: 'frameSizeSigma', label: '线框尺寸倾向', min: 0.08, max: 0.7, step: 0.01 },
  { key: 'restEventRate', label: '静息不稳定度', min: 0, max: 3, step: 0.05 },
]

function formatValue(spec: SliderSpec<keyof FocusInversionConfig>, value: number): string {
  if (spec.step < 1) return value.toFixed(spec.step < 0.01 ? 3 : 2)
  return String(Math.round(value))
}

export default function FocusInversionDebugPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const config = useSyncExternalStore(
    subscribeFocusInversionConfig,
    getFocusInversionConfig,
    getFocusInversionConfig,
  )
  const layer = getDomLayer('dom.debugPanel')

  if (collapsed) {
    return (
      <button
        type="button"
        className="focus-inversion-debug-toggle"
        style={{
          position: layer.position,
          zIndex: layer.zIndex,
          pointerEvents: 'auto',
        }}
        onClick={(event) => {
          event.stopPropagation()
          setCollapsed(false)
        }}
      >
        Focus Blocks
      </button>
    )
  }

  return (
    <aside
      className="focus-inversion-debug"
      style={{
        position: layer.position,
        zIndex: layer.zIndex,
        pointerEvents: 'auto',
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="focus-inversion-debug__header">
        <strong>Focus Blocks</strong>
        <div className="focus-inversion-debug__actions">
          <button type="button" onClick={resetFocusInversionConfig}>Reset</button>
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse Focus Blocks panel">-</button>
        </div>
      </header>
      <div className="focus-inversion-debug__body">
        {SLIDERS.map((spec) => {
          const value = config[spec.key] as number
          return (
            <label className="focus-inversion-debug__control" key={String(spec.key)}>
              <span>
                <span>{spec.label}</span>
                <output>{formatValue(spec, value)}</output>
              </span>
              <input
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                onChange={(event) => updateFocusInversionConfig(spec.key, Number(event.target.value))}
              />
            </label>
          )
        })}
      </div>
    </aside>
  )
}
