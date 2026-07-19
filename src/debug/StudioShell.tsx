import { useState, useRef, useCallback } from 'react'
import { Leva } from 'leva'
import { MODEL_REGISTRY, type EnvPreset } from '../models'
import StudioToolbar from './StudioToolbar'
import SceneExplorer from './SceneExplorer'
import StudioViewport from './StudioViewport'
import PropertyPanel from './PropertyPanel'
import StatusBar from './StatusBar'
import type { Group, Object3D } from 'three'
import './StudioLayout.css'

// ============================================================
// 共享类型
// ============================================================

export interface HelperState {
  grid: boolean
  axes: boolean
  bbox: boolean
  wireframe: boolean
}

export type ViewportMode = 'single' | 'split' | 'quad'

export interface SceneTreeNode {
  name: string
  uuid: string
  type: string
  children: SceneTreeNode[]
}

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)
const DEFAULT_HELPERS: HelperState = { grid: true, axes: true, bbox: false, wireframe: false }

// ============================================================
// StudioShell
// ============================================================

export default function StudioShell() {
  const firstKey = MODEL_KEYS[0] ?? 'voyager1'
  const [modelKey, setModelKey] = useState(firstKey)
  const entry = MODEL_REGISTRY[modelKey]
  const [env, setEnv] = useState<EnvPreset>(entry?.environment ?? 'studio')
  const [helpers, setHelpers] = useState<HelperState>(DEFAULT_HELPERS)
  const [selectedNode, setSelectedNode] = useState<Object3D | null>(null)
  const [viewportMode, setViewportMode] = useState<ViewportMode>('single')
  const [sceneTree, setSceneTree] = useState<SceneTreeNode[]>([])
  const modelRef = useRef<Group | null>(null)

  // 切换模型时同步默认环境
  const handleModelChange = useCallback((key: string) => {
    setModelKey(key)
    setSelectedNode(null)
    setSceneTree([])
    const e = MODEL_REGISTRY[key]
    if (e?.environment) setEnv(e.environment)
  }, [])

  return (
    <div className="studio-shell">
      <StudioToolbar
        modelKey={modelKey}
        onModelChange={handleModelChange}
        viewportMode={viewportMode}
        onViewportModeChange={setViewportMode}
      />

      <div className="studio-layout">
        <SceneExplorer
          env={env}
          onEnvChange={setEnv}
          helpers={helpers}
          onHelpersChange={setHelpers}
          sceneTree={sceneTree}
          selectedNode={selectedNode}
          onNodeSelect={setSelectedNode}
          modelRef={modelRef}
        />

        <StudioViewport
          modelKey={modelKey}
          env={env}
          helpers={helpers}
          viewportMode={viewportMode}
          selectedNode={selectedNode}
          modelRef={modelRef}
          onSceneTreeUpdate={setSceneTree}
        />

        <PropertyPanel
          entry={entry}
          selectedNode={selectedNode}
          modelRef={modelRef}
        />
      </div>

      <StatusBar />

      <Leva
        flat
        fill
        titleBar={{ title: '属性' }}
        theme={{
          colors: {
            elevation1: '#0f172a', elevation2: '#1e293b', elevation3: '#334155',
            accent1: '#64748b', accent2: '#94a3b8', accent3: '#cbd5e1',
            highlight1: '#475569', highlight2: '#64748b', highlight3: '#94a3b8',
          },
          fontSizes: { root: '11px', toolTip: '11px' },
          fonts: { mono: `'Courier New', 'Consolas', monospace` },
        }}
      />
    </div>
  )
}
