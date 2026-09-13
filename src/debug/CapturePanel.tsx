import { useEffect, useRef, useState } from 'react'
import { LevaPanel, useCreateStore } from 'leva'
import {
  DEFAULT_CAPTURE_CONFIG,
  offscreenCapture,
  type CaptureConfig,
} from '../actors/LighthouseCaptureTypes'
import { useLevaCaptureConfig } from './useLevaCaptureConfig'
import { pickSavable, savedSignature } from './captureSettings'
import { LEVA_THEME, downloadCanvas } from './studioUI'
import { Mesh, type Group } from 'three'
import { cloneForViewport } from './studioModel'
import type { ViewHandle } from './studioTypes'

let draft: CaptureConfig | null = null
function CaptureEditor({
  initial,
  baseline,
  active,
  handle,
  readyVersion,
  onLoad,
  onDefaults,
  onSaved,
  onDraft,
}: {
  initial: CaptureConfig
  baseline: CaptureConfig
  active: boolean
  handle: ViewHandle | null
  readyVersion: number
  onLoad: () => void
  onDefaults: () => void
  onSaved: (config: CaptureConfig) => void
  onDraft: (config: CaptureConfig) => void
}) {
  const store = useCreateStore()
  const config = useLevaCaptureConfig(store, initial)
  const [image, setImage] = useState<string | null>(null)
  const [theme, setTheme] = useState<'night' | 'day'>('night')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [rendering, setRendering] = useState(false)
  const serialized = JSON.stringify(config)
  const dirty = savedSignature(config) !== savedSignature(baseline)
  const latest = useRef(config)
  latest.current = config
  useEffect(() => {
    draft = config
    onDraft(config)
  }, [serialized, onDraft])
  useEffect(() => {
    if (!active || !handle?.lighthouse) return
    setRendering(true)
    const timer = setTimeout(() => {
      const effective =
        theme === 'day'
          ? { ...latest.current, outlineType: 'none' as const, silhouetteFillColor: '#1e293b' }
          : { ...latest.current, silhouetteFillColor: '#0b101d' }
      const instance = cloneForViewport(handle.lighthouse!)
      let next: string | null = null
      try {
        instance.root.traverse((node) => {
          if (node instanceof Mesh) {
            const materials = Array.isArray(node.material) ? node.material : [node.material]
            materials.forEach((material) => {
              if ('wireframe' in material) material.wireframe = false
            })
          }
        })
        next = offscreenCapture(effective, instance.root as Group)
      } finally {
        instance.dispose()
      }
      setImage(next)
      setRendering(false)
      if (!next) setStatus('预览失败，请重试或检查参数')
    }, 350)
    return () => clearTimeout(timer)
  }, [active, handle, readyVersion, serialized, theme])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  const save = async () => {
    const snapshot = { ...latest.current }
    setBusy(true)
    setStatus('正在保存…')
    try {
      const response = await fetch('/__debug/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickSavable(snapshot)),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error ?? '服务器拒绝了配置')
      onSaved(snapshot)
      setStatus('已保存；已打开的主页会刷新图标')
    } catch (error) {
      setStatus(`保存失败：${error instanceof Error ? error.message : '网络错误'}。调整已保留。`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="panel-section">
        <h2>灯塔图标制作</h2>
        <p className="save-state" role="status">
          {dirty ? '● 有未保存参数' : '✓ 参数与已保存配置一致'}
        </p>
        <div className="button-row">
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? '保存中…' : '保存配置'}
          </button>
          <button disabled={busy} onClick={onLoad}>
            重新加载
          </button>
          <button disabled={busy} onClick={onDefaults}>
            恢复默认
          </button>
        </div>
        {status && (
          <p className={`save-state ${status.includes('失败') ? 'error' : ''}`} role="status">
            {status}
          </p>
        )}
        <p className="muted">恢复默认先修改草稿；点击保存后才写入文件。分辨率和抗锯齿仅用于本次预览。</p>
      </section>
      <section className="panel-section">
        <h2>实际烘焙预览</h2>
        <div className="button-row">
          <button aria-pressed={theme === 'night'} onClick={() => setTheme('night')}>
            夜间图标
          </button>
          <button aria-pressed={theme === 'day'} onClick={() => setTheme('day')}>
            日间图标
          </button>
        </div>
        {image ? (
          <>
            <img className="capture-preview" src={image} alt="灯塔图标透明背景烘焙预览" />
            <div className={`capture-brand ${theme}`}>
              <img src={image} alt="主页品牌图标效果" />
              <span>Personal Site · By YeQuDesu</span>
            </div>
          </>
        ) : (
          <p className="muted">{handle ? '正在生成预览…' : '等待灯塔模型加载…'}</p>
        )}
        {rendering && <p role="status">正在更新预览…</p>}
        <button
          className="wide"
          disabled={!image || rendering}
          onClick={() => image && downloadCanvas(image, `lighthouse-${theme}.png`)}
        >
          下载图标 PNG
        </button>
        <p className="muted">与主页使用相同烘焙函数。日间图标固定取消描边；最终宽度含 400px 基线延伸。</p>
      </section>
      <LevaPanel store={store} fill flat titleBar={false} theme={LEVA_THEME} />
    </>
  )
}
export default function CapturePanel(props: {
  active: boolean
  handle: ViewHandle | null
  readyVersion: number
}) {
  const [initial, setInitial] = useState<CaptureConfig | null>(null)
  const [baseline, setBaseline] = useState(DEFAULT_CAPTURE_CONFIG)
  const [generation, setGeneration] = useState(0)
  const [loadError, setLoadError] = useState('')
  const current = useRef(DEFAULT_CAPTURE_CONFIG)
  const onDraft = useRef((config: CaptureConfig) => {
    current.current = config
  }).current
  const load = async (keepDraft = false) => {
    try {
      const response = await fetch('/__debug/config')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const saved = response.status === 204 ? {} : pickSavable(await response.json())
      const next = { ...DEFAULT_CAPTURE_CONFIG, ...saved } as CaptureConfig
      setBaseline(next)
      setInitial(keepDraft && draft ? draft : next)
      setGeneration((v) => v + 1)
      setLoadError('')
    } catch (error) {
      setLoadError(`配置加载失败：${error instanceof Error ? error.message : '网络错误'}`)
    }
  }
  useEffect(() => {
    void load(true)
  }, [])
  const defaults = () => {
    setInitial({ ...DEFAULT_CAPTURE_CONFIG })
    setGeneration((v) => v + 1)
  }
  return (
    <>
      {loadError && (
        <div className="panel-section" role="alert">
          <p>{loadError}</p>
          <button onClick={() => load()}>重试读取</button>
        </div>
      )}
      {initial && (
        <CaptureEditor
          key={generation}
          {...props}
          initial={initial}
          baseline={baseline}
          onLoad={() => load()}
          onDefaults={defaults}
          onSaved={setBaseline}
          onDraft={onDraft}
        />
      )}
    </>
  )
}
