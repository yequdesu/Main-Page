import { useState } from 'react'
import { useNightSkyStore, type NightSkyConfig } from '../../stores/nightSkyStore'
import { getDomLayer } from '../layerRegistry'
import './NightSkyDebugPanel.css'

type NumericKey = { [K in keyof NightSkyConfig]: NightSkyConfig[K] extends number ? K : never }[keyof NightSkyConfig]
const sliders: [NumericKey, string, number, number, number][] = [
  ['centerBrightness', '中心亮度', 0, 1, 0.01],
  ['outerBrightness', '外围亮度', 0, 1, 0.01],
  ['axisX', '横向渐变范围（弧度）', 0.05, 2, 0.01],
  ['axisY', '纵向渐变范围（弧度）', 0.05, 2, 0.01],
  ['contrast', '切面随机色差', 0, 3, 0.01],
  ['cellDensity', '网格细分', 4, 48, 1],
  ['seed', '纹理随机种子', 0, 10000, 1],
  ['rotationRadians', '旋转速度（弧度/秒）', -0.02, 0.02, 0.0001],
  ['tiltX', '旋转轴 X 倾斜', -2, 2, 0.01],
  ['tiltZ', '旋转轴 Z 倾斜', -2, 2, 0.01],
  ['deformationAmplitude', '形变幅度', 0, 0.08, 0.001],
  ['deformationSpeed', '形变速度', 0, 0.2, 0.001],
]

export default function NightSkyDebugPanel() {
  const { config, update, reset } = useNightSkyStore()
  const [open, setOpen] = useState(true)
  const [exported, setExported] = useState(false)
  const layer = getDomLayer('dom.debugPanel')
  return <aside className="night-sky-debug" style={{ zIndex: layer.zIndex + 1 }}
    onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
    onWheel={e => e.stopPropagation()}>
    <header><strong>夜空 · Night Sky</strong>
      <button onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button></header>
    {open && <div className="night-sky-debug-body">
      <p>实时生效；本次页面内保留，刷新恢复默认。范围越小，渐变越集中。</p>
      {sliders.map(([key, label, min, max, step]) => <label key={key}>
        <span>{label}</span>
        <input aria-label={label + '数值'} type="number" value={config[key]}
          min={min} max={max} step={step} onChange={e => {
            if (e.target.value === '') return
            const value = e.target.valueAsNumber
            if (Number.isFinite(value)) update({ [key]: Math.max(min, Math.min(max,
              step === 1 ? Math.round(value) : value)) })
          }} />
        <input aria-label={label} type="range" min={min} max={max} step={step}
          value={config[key]} onChange={e => update({ [key]: Number(e.target.value) })} />
      </label>)}
      {config.palette.map((color, i) => <label key={i}>
        <span>切面配色 {i + 1}</span><input aria-label={'切面配色 ' + (i + 1)}
          type="color" value={color} onChange={e => {
            const palette: NightSkyConfig['palette'] = [...config.palette]
            palette[i] = e.target.value
            update({ palette })
          }} />
      </label>)}
      <label><span>暗部基础色</span><input aria-label="暗部基础色" type="color"
        value={config.darkestColor} onChange={e => update({ darkestColor: e.target.value })} /></label>
      <div><button onClick={reset}>恢复默认</button>{' '}
        <button onClick={() => setExported(!exported)}>导出参数</button></div>
      {exported && <textarea aria-label="夜空参数 JSON" readOnly
        value={JSON.stringify(config, null, 2)} onFocus={e => e.target.select()} />}
    </div>}
  </aside>
}
