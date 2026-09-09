import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { LevaPanel, useCreateStore } from 'leva'
import { MODEL_REGISTRY, type EnvPreset } from '../models'
import StudioToolbar from './StudioToolbar'
import SceneExplorer from './SceneExplorer'
import StudioViewport, { type ModelReady } from './StudioViewport'
import { CameraPanel, ObjectInspector } from './PropertyPanel'
import StatusBar from './StatusBar'
import CapturePanel from './CapturePanel'
import { useModelPreviewControls, type ModelPreviewConfig } from './ModelPreviewControls'
import {
  VIEW_LABELS,
  type AnimationState,
  type CameraPose,
  type HelperState,
  type ViewHandle,
  type ViewId,
  type ViewportMode,
} from './studioTypes'
import { LEVA_THEME, downloadCanvas } from './studioUI'
import { createPreviewPlayback } from './previewPlayback'
import './StudioLayout.css'

function ResizeHandle({
  side,
  onResize,
  value,
}: {
  side: 'left' | 'right'
  onResize: (width: number) => void
  value: number
}) {
  const drag = useRef<{ start: number; width: number } | null>(null)
  const move = (event: ReactPointerEvent) => {
    if (drag.current)
      onResize(
        Math.max(
          180,
          Math.min(
            380,
            drag.current.width + (event.clientX - drag.current.start) * (side === 'left' ? 1 : -1),
          ),
        ),
      )
  }
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`调整${side === 'left' ? '对象' : '参数'}栏宽度`}
      aria-orientation="vertical"
      aria-valuemin={180}
      aria-valuemax={380}
      aria-valuenow={value}
      className="panel-resizer"
      onPointerDown={(e) => {
        drag.current = { start: e.clientX, width: value }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          onResize(
            Math.max(
              180,
              Math.min(380, value + (e.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1)),
            ),
          )
        }
      }}
    />
  )
}
const CONFIG_CACHE = new Map<string, ModelPreviewConfig>()
interface SessionSnapshot {
  env: EnvPreset
  helpers: HelperState
  selectedId: string | null
  hiddenIds: string[]
  isolatedId: string | null
  poses: Partial<Record<ViewId, CameraPose>>
}
const SESSION_CACHE = new Map<string, SessionSnapshot>()
const WORKSPACE = {
  mode: 'single' as ViewportMode,
  linked: true,
  leftOpen: window.innerWidth > 720,
  rightOpen: window.innerWidth > 720,
  leftWidth: 220,
  rightWidth: 310,
}

function Session({ modelKey, onModelChange }: { modelKey: string; onModelChange: (key: string) => void }) {
  const entry = MODEL_REGISTRY[modelKey]
  const remembered = useRef(SESSION_CACHE.get(modelKey)).current
  const store = useCreateStore()
  const config = useModelPreviewControls(store, CONFIG_CACHE.get(modelKey))
  useEffect(() => {
    CONFIG_CACHE.set(modelKey, config)
  }, [modelKey, config])
  const [env, setEnv] = useState<EnvPreset>(remembered?.env ?? entry.environment ?? 'studio')
  const [helpers, setHelpers] = useState<HelperState>(
    remembered?.helpers ?? { grid: true, axes: false, bbox: false, wireframe: false },
  )
  const [mode, setMode] = useState<ViewportMode>(WORKSPACE.mode)
  const [model, setModel] = useState<ModelReady>({ tree: [], objects: new Map(), clips: [] })
  const [selectedId, setSelectedId] = useState<string | null>(remembered?.selectedId ?? null)
  const [hiddenIds, setHiddenIds] = useState<string[]>(remembered?.hiddenIds ?? [])
  const [isolatedId, setIsolatedId] = useState<string | null>(remembered?.isolatedId ?? null)
  const [activeView, setActiveView] = useState<ViewId>('perspective')
  const [poses, setPoses] = useState<Partial<Record<ViewId, CameraPose>>>(remembered?.poses ?? {})
  const [linked, setLinked] = useState(WORKSPACE.linked)
  const [animation, setAnimation] = useState<AnimationState>({ clip: entry.previewAnimation ?? '', playing: false, speed: 1 })
  const [previewPlayback] = useState(() => createPreviewPlayback())
  const views = useRef(new Map<ViewId, ViewHandle>())
  const [readyVersion, setReadyVersion] = useState(0)
  const [tab, setTab] = useState('scene')
  const [leftOpen, setLeftOpen] = useState(WORKSPACE.leftOpen)
  const [rightOpen, setRightOpen] = useState(WORKSPACE.rightOpen)
  const [leftWidth, setLeftWidth] = useState(WORKSPACE.leftWidth)
  const [rightWidth, setRightWidth] = useState(WORKSPACE.rightWidth)
  const [message, setMessage] = useState('正在加载模型…')
  const [exportScope, setExportScope] = useState('active')
  const [resolution, setResolution] = useState(1280)
  const [transparent, setTransparent] = useState(false)
  const [exportHelpers, setExportHelpers] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportPreview, setExportPreview] = useState<string | null>(null)
  const snapshot = useRef<SessionSnapshot>({ env, helpers, selectedId, hiddenIds, isolatedId, poses })
  snapshot.current = { env, helpers, selectedId, hiddenIds, isolatedId, poses }
  useEffect(
    () => () => {
      SESSION_CACHE.set(modelKey, snapshot.current)
    },
    [modelKey],
  )
  useEffect(() => {
    Object.assign(WORKSPACE, { mode, linked, leftOpen, rightOpen, leftWidth, rightWidth })
  }, [mode, linked, leftOpen, rightOpen, leftWidth, rightWidth])

  const register = useCallback((id: ViewId, handle: ViewHandle | null) => {
    if (handle) views.current.set(id, handle)
    else views.current.delete(id)
    setReadyVersion((v) => v + 1)
  }, [])
  const onModelReady = useCallback((next: ModelReady) => {
    setModel(next)
    setMessage('模型已加载')
  }, [])
  const onCameraChange = useCallback(
    (id: ViewId, pose: CameraPose, user: boolean) => {
      setPoses((previous) => ({ ...previous, [id]: pose }))
      if (user && linked && (id === 'perspective' || id === 'wireframe'))
        views.current.get(id === 'perspective' ? 'wireframe' : 'perspective')?.setPose(pose)
    },
    [linked],
  )
  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) setTab('object')
  }, [])
  const fitAll = useCallback((reset = false) => views.current.forEach((view) => view.fit(false, reset)), [])
  const focus = () => views.current.forEach((view) => view.fit(true))
  const changeMode = (next: ViewportMode) => {
    setActiveView('perspective')
    setMode(next)
  }
  const exportPNG = async () => {
    setExporting(true)
    try {
      // 让按钮先显示忙碌状态；渲染和合成在此后的一个任务执行。
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const selected =
        exportScope === 'all'
          ? [...views.current.entries()]
          : [[activeView, views.current.get(activeView)] as const]
      if (!selected.length || selected.some(([, handle]) => !handle))
        throw new Error('请等待所有视口加载完成')
      const ids: ViewId[] =
        mode === 'quad'
          ? ['front', 'side', 'top', 'perspective']
          : mode === 'split'
            ? ['perspective', 'wireframe']
            : ['perspective']
      const ordered = exportScope === 'all' ? ids.map((id) => [id, views.current.get(id)] as const) : selected
      if (ordered.some(([, handle]) => !handle)) throw new Error('请等待所有视口加载完成')
      const columns = exportScope === 'all' && mode !== 'single' ? 2 : 1
      const rows = exportScope === 'all' && mode === 'quad' ? 2 : 1
      const width = resolution
      const height = Math.round(resolution * 0.625)
      const output = document.createElement('canvas')
      output.width = width
      output.height = height
      const ctx = output.getContext('2d')!
      const cellW = Math.floor(width / columns),
        cellH = Math.floor(height / rows)
      ordered.forEach(([, handle], i) =>
        ctx.drawImage(
          handle!.capture({ width: cellW, height: cellH, transparent, helpers: exportHelpers }),
          (i % columns) * cellW,
          Math.floor(i / columns) * cellH,
        ),
      )
      const image = output.toDataURL('image/png')
      setExportPreview(image)
      downloadCanvas(image, `${modelKey}-${exportScope}-${width}x${height}.png`)
      setMessage(`已导出 ${width} × ${height} PNG`)
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setExporting(false)
    }
  }
  const tabs = [
    ['scene', '场景'],
    ['object', '对象'],
    ...(entry.debugControls === 'lighthouse-capture' ? [['capture', '灯塔图标']] : []),
    ['export', '导出'],
  ]
  return (
    <div className="studio-shell">
      <StudioToolbar
        modelKey={modelKey}
        onModelChange={(next) => {
          snapshot.current.poses = Object.fromEntries([...views.current].map(([id, view]) => [id, view.pose()]))
          onModelChange(next)
        }}
        viewportMode={mode}
        onViewportModeChange={changeMode}
        onFit={() => fitAll()}
        onReset={() => fitAll(true)}
        onExport={() => {
          setTab('export')
          setRightOpen(true)
        }}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => {
          setLeftOpen((v) => !v)
          if (!leftOpen && window.innerWidth <= 720) setRightOpen(false)
        }}
        onToggleRight={() => {
          setRightOpen((v) => !v)
          if (!rightOpen && window.innerWidth <= 720) setLeftOpen(false)
        }}
      />
      <main
        className="studio-layout"
        style={
          {
            '--left-width': `${leftOpen ? leftWidth : 0}px`,
            '--right-width': `${rightOpen ? rightWidth : 0}px`,
            '--left-handle': leftOpen ? '5px' : '0px',
            '--right-handle': rightOpen ? '5px' : '0px',
          } as CSSProperties
        }
      >
        <div className="panel-slot" hidden={!leftOpen}>
          <SceneExplorer
            tree={model.tree}
            selectedId={selectedId}
            hiddenIds={hiddenIds}
            isolatedId={isolatedId}
            onSelect={select}
            onFocus={focus}
            onHide={() => {
              if (selectedId)
                setHiddenIds((ids) =>
                  ids.includes(selectedId) ? ids.filter((id) => id !== selectedId) : [...ids, selectedId],
                )
            }}
            onIsolate={() => setIsolatedId((id) => (id === selectedId ? null : selectedId))}
            onShowAll={() => {
              setHiddenIds([])
              setIsolatedId(null)
            }}
          />
        </div>
        <div hidden={!leftOpen}>
          <ResizeHandle side="left" value={leftWidth} onResize={setLeftWidth} />
        </div>
        <StudioViewport
          modelKey={modelKey}
          viewportMode={mode}
          config={config}
          env={env}
          helpers={helpers}
          selectedId={selectedId}
          hiddenIds={hiddenIds}
          isolatedId={isolatedId}
          activeView={activeView}
          animation={animation}
          previewTime={previewPlayback.time}
          initialPoses={remembered?.poses}
          onActiveView={setActiveView}
          onSelect={select}
          onModelReady={onModelReady}
          onCameraChange={onCameraChange}
          register={register}
        />
        <div hidden={!rightOpen}>
          <ResizeHandle side="right" value={rightWidth} onResize={setRightWidth} />
        </div>
        <aside className="property-panel" hidden={!rightOpen} aria-label="参数与属性">
          <div className="panel-tabs" role="tablist" aria-label="属性分类">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                id={`tab-${key}`}
                role="tab"
                tabIndex={tab === key ? 0 : -1}
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault()
                    const index = tabs.findIndex(([id]) => id === key)
                    const next =
                      tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0]
                    setTab(next)
                    document.getElementById(`tab-${next}`)?.focus()
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="panel-scene" aria-labelledby="tab-scene" hidden={tab !== 'scene'}>
            <section className="panel-section">
              <h2>环境与辅助</h2>
              <div className="env-presets">
                {(['studio', 'night', 'dawn', 'sunset'] as const).map((key, i) => (
                  <button key={key} aria-pressed={env === key} onClick={() => setEnv(key)}>
                    {['摄影棚', '夜间', '清晨', '日落'][i]}
                  </button>
                ))}
              </div>
              <div className="helper-grid">
                {(
                  [
                    ['grid', '网格'],
                    ['axes', '坐标轴'],
                    ['bbox', '包围盒'],
                    ['wireframe', '线框'],
                  ] as const
                ).map(([key, label]) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={helpers[key]}
                      onChange={(e) => setHelpers({ ...helpers, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>
            <CameraPanel
              id={activeView}
              pose={poses[activeView] ?? null}
              disabled={config.autoRotate}
              onPose={(pose) => {
                views.current.get(activeView)?.setPose(pose)
                if (linked)
                  views.current.get(activeView === 'perspective' ? 'wireframe' : 'perspective')?.setPose(pose)
              }}
              linked={linked}
              onLinked={setLinked}
            />
            <LevaPanel store={store} fill flat titleBar={false} theme={LEVA_THEME} />
          </div>
          <div role="tabpanel" id="panel-object" aria-labelledby="tab-object" hidden={tab !== 'object'}>
            <ObjectInspector
              entry={entry}
              node={selectedId ? (model.objects.get(selectedId) ?? null) : null}
              clips={entry.previewAnimation ? [entry.previewAnimation] : model.clips}
              animation={animation}
              onAnimation={(next) => {
                previewPlayback.configure(next)
                setAnimation(next)
              }}
            />
          </div>
          {entry.debugControls === 'lighthouse-capture' && (
            <div role="tabpanel" id="panel-capture" aria-labelledby="tab-capture" hidden={tab !== 'capture'}>
              <CapturePanel
                active={tab === 'capture' && rightOpen}
                handle={views.current.get('perspective') ?? null}
                readyVersion={readyVersion}
              />
            </div>
          )}
          <div role="tabpanel" id="panel-export" aria-labelledby="tab-export" hidden={tab !== 'export'}>
            <section className="panel-section">
              <h2>导出视口</h2>
              <label>
                范围
                <select
                  aria-label="导出范围"
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value)}
                >
                  <option value="active">当前视口 · {VIEW_LABELS[activeView]}</option>
                  <option value="all">全部视口拼图</option>
                </select>
              </label>
              <label>
                分辨率
                <select
                  aria-label="导出分辨率"
                  value={resolution}
                  onChange={(e) => setResolution(Number(e.target.value))}
                >
                  {[1280, 1920, 2560].map((width) => (
                    <option key={width} value={width}>
                      {width} × {Math.round(width * 0.625)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(e) => setTransparent(e.target.checked)}
                />
                透明背景
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={exportHelpers}
                  onChange={(e) => setExportHelpers(e.target.checked)}
                />
                包含辅助线框
              </label>
              <button className="primary wide" disabled={exporting || !model.tree.length} onClick={exportPNG}>
                {exporting ? '正在导出…' : '下载 PNG'}
              </button>
              {exportPreview && (
                <img
                  className="capture-preview export-preview"
                  src={exportPreview}
                  alt="已导出的视口 PNG 预览"
                />
              )}
              <p className="muted">导出保留当前观察方向。拼图按屏幕视口顺序排列。</p>
            </section>
          </div>
        </aside>
      </main>
      <StatusBar views={views} activeView={activeView} message={message} />
    </div>
  )
}
export default function StudioShell() {
  const [modelKey, setModelKey] = useState(Object.keys(MODEL_REGISTRY)[0])
  return <Session key={modelKey} modelKey={modelKey} onModelChange={setModelKey} />
}
