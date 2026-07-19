import { useMemo } from 'react'
import { Mesh, type Group, type Object3D, type MeshStandardMaterial } from 'three'
import { useAnimations } from '@react-three/drei'
import type { ModelRegistryEntry } from '../models'

interface PropertyPanelProps {
  entry: ModelRegistryEntry | undefined
  selectedNode: Object3D | null
  modelRef: React.RefObject<Group | null>
}

// ============================================================
// ModelInfoCard
// ============================================================

function ModelInfoCard({ entry }: { entry: ModelRegistryEntry | undefined }) {
  if (!entry) return <div className="panel-empty">未选择模型</div>
  return (
    <div className="panel-section">
      <h3>模型信息</h3>
      <div className="model-info-card">
        <p><span className="info-label">名称：</span>{entry.label}</p>
        {entry.triCount != null && (
          <p><span className="info-label">三角面：</span>~{entry.triCount.toLocaleString()}</p>
        )}
        {entry.procedural && <p><span className="info-label">类型：</span>程序化几何</p>}
        {entry.glbPath && <p><span className="info-label">路径：</span>{entry.glbPath}</p>}
        {entry.attribution && <p><span className="info-label">来源：</span>{entry.attribution}</p>}
      </div>
    </div>
  )
}

// ============================================================
// MaterialInspector
// ============================================================

function MaterialInspector({ node }: { node: Object3D | null }) {
  const material = useMemo(() => {
    if (!node || !(node instanceof Mesh)) return null
    const mats = Array.isArray(node.material) ? node.material : [node.material]
    return mats[0] as MeshStandardMaterial | undefined
  }, [node])

  if (!node || !(node instanceof Mesh)) {
    return (
      <div className="panel-section">
        <h3>材质属性</h3>
        <div className="panel-empty">选中 Mesh 节点后显示</div>
      </div>
    )
  }

  if (!material) {
    return (
      <div className="panel-section">
        <h3>材质属性</h3>
        <div className="panel-empty">无标准材质信息</div>
      </div>
    )
  }

  return (
    <div className="panel-section">
      <h3>材质属性</h3>
      <div className="material-props">
        <p style={{ fontSize: 11, margin: '4px 0' }}>
          <span className="info-label">节点：</span>{node.name || node.type}
        </p>
        <dl>
          <dt>color</dt>
          <dd>#{material.color?.getHexString?.() ?? '—'}</dd>
          {'metalness' in material && <><dt>metalness</dt><dd>{material.metalness?.toFixed(3) ?? '—'}</dd></>}
          {'roughness' in material && <><dt>roughness</dt><dd>{material.roughness?.toFixed(3) ?? '—'}</dd></>}
          {'transparent' in material && <><dt>transparent</dt><dd>{material.transparent ? '是' : '否'}</dd></>}
          {'opacity' in material && <><dt>opacity</dt><dd>{material.opacity?.toFixed(3) ?? '—'}</dd></>}
          {'wireframe' in material && <><dt>wireframe</dt><dd>{material.wireframe ? '是' : '否'}</dd></>}
        </dl>
      </div>
    </div>
  )
}

// ============================================================
// AnimationControls
// ============================================================

function AnimationControls({ modelRef }: { modelRef: React.RefObject<Group | null> }) {
  const { actions, names, mixer } = useAnimations(modelRef as any)

  if (names.length === 0) return null

  return (
    <div className="panel-section">
      <h3>动画</h3>
      <div className="anim-controls">
        {names.map((name) => {
          const action = actions[name]
          if (!action) return null
          const isPlaying = action.isRunning()
          return (
            <button
              key={name}
              className={isPlaying ? 'active' : ''}
              onClick={() => {
                if (isPlaying) {
                  action.paused = true
                  action.stop()
                } else {
                  action.reset().play()
                }
              }}
            >
              {isPlaying ? '⏸' : '▶'} {name}
            </button>
          )
        })}
        <button onClick={() => { actions[names[0]]?.stop(); mixer?.stopAllAction() }}>
          ⏹ 停止
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 11 }}>
        速度：
        <input
          type="range"
          min={0.1} max={3} step={0.1} defaultValue={1}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            Object.values(actions).forEach((a) => { if (a) a.timeScale = v })
          }}
          style={{ marginLeft: 8, accentColor: '#64748b', width: '60%' }}
        />
      </div>
    </div>
  )
}

// ============================================================
// PropertyPanel
// ============================================================

export default function PropertyPanel({
  entry, selectedNode, modelRef,
}: PropertyPanelProps) {
  return (
    <div className="property-panel">
      <ModelInfoCard entry={entry} />
      <MaterialInspector node={selectedNode} />
      <AnimationControls modelRef={modelRef} />
    </div>
  )
}
