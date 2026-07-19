import { useCallback, useState } from 'react'
import type { Group, Object3D } from 'three'
import type { EnvPreset } from '../models'
import type { HelperState, SceneTreeNode } from './StudioShell'

interface SceneExplorerProps {
  env: EnvPreset
  onEnvChange: (env: EnvPreset) => void
  helpers: HelperState
  onHelpersChange: (helpers: HelperState) => void
  sceneTree: SceneTreeNode[]
  selectedNode: Object3D | null
  onNodeSelect: (node: Object3D | null) => void
  modelRef: React.RefObject<Group | null>
}

// ============================================================
// 环境预设
// ============================================================

const ENV_PRESETS: { key: EnvPreset; label: string }[] = [
  { key: 'studio', label: 'Studio' },
  { key: 'night', label: 'Night' },
  { key: 'dawn', label: 'Dawn' },
  { key: 'sunset', label: 'Sunset' },
]

// ============================================================
// SceneTreeView — 递归场景树
// ============================================================

function SceneTreeView({
  nodes, depth, selectedUuid, onSelect,
}: {
  nodes: SceneTreeNode[]
  depth: number
  selectedUuid: string | null
  onSelect: (uuid: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isCollapsed = collapsed[node.uuid] ?? (depth > 1)
        const isSelected = selectedUuid === node.uuid

        return (
          <div key={node.uuid}>
            <div
              className={`tree-node ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: 4 + depth * 12 }}
              onClick={() => onSelect(node.uuid)}
            >
              {hasChildren ? (
                <span
                  className="toggle"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((p) => ({ ...p, [node.uuid]: !isCollapsed }))
                  }}
                >
                  {isCollapsed ? '▸' : '▾'}
                </span>
              ) : (
                <span className="toggle">{'  '}</span>
              )}
              <span>{node.name || node.type}</span>
            </div>
            {hasChildren && !isCollapsed && (
              <div className="tree-children">
                <SceneTreeView
                  nodes={node.children}
                  depth={depth + 1}
                  selectedUuid={selectedUuid}
                  onSelect={onSelect}
                />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ============================================================
// SceneExplorer
// ============================================================

export default function SceneExplorer({
  env, onEnvChange, helpers, onHelpersChange,
  sceneTree, selectedNode, onNodeSelect, modelRef,
}: SceneExplorerProps) {
  const [envOpen, setEnvOpen] = useState(true)
  const [helperOpen, setHelperOpen] = useState(true)
  const [treeOpen, setTreeOpen] = useState(true)

  const toggleHelper = useCallback((key: keyof HelperState) => {
    onHelpersChange({ ...helpers, [key]: !helpers[key] })
  }, [helpers, onHelpersChange])

  const handleNodeSelect = useCallback((uuid: string) => {
    if (!modelRef.current) return
    // 在场景图中查找对应 Object3D
    let found: Object3D | null = null
    modelRef.current.traverse((child) => {
      if (child.uuid === uuid) found = child
    })
    onNodeSelect(found)
  }, [modelRef, onNodeSelect])

  return (
    <div className="scene-explorer">
      {/* ---- 环境预设 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setEnvOpen((v) => !v)}>
          {envOpen ? '▾' : '▸'} 环境
        </h3>
        {envOpen && (
          <div className="env-preset-list">
            {ENV_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`env-preset-btn ${env === p.key ? 'active' : ''}`}
                onClick={() => onEnvChange(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- 辅助工具 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setHelperOpen((v) => !v)}>
          {helperOpen ? '▾' : '▸'} 辅助
        </h3>
        {helperOpen && (
          <>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.grid} onChange={() => toggleHelper('grid')} />
              Grid 网格
            </label>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.axes} onChange={() => toggleHelper('axes')} />
              Axes 坐标轴
            </label>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.bbox} onChange={() => toggleHelper('bbox')} />
              BBox 包围盒
            </label>
            <label className="helper-toggle">
              <input type="checkbox" checked={helpers.wireframe} onChange={() => toggleHelper('wireframe')} />
              Wireframe 线框
            </label>
          </>
        )}
      </div>

      {/* ---- 场景树 ---- */}
      <div className="panel-section">
        <h3 onClick={() => setTreeOpen((v) => !v)}>
          {treeOpen ? '▾' : '▸'} 场景树
        </h3>
        {treeOpen && (
          <div className="scene-tree">
            {sceneTree.length === 0 ? (
              <div className="panel-empty">加载模型后显示</div>
            ) : (
              <SceneTreeView
                nodes={sceneTree}
                depth={0}
                selectedUuid={selectedNode?.uuid ?? null}
                onSelect={handleNodeSelect}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
