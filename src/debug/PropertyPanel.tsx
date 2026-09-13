import { Mesh, Sprite, type Object3D, type MeshStandardMaterial } from 'three'
import type { ModelRegistryEntry } from '../models'
import { VIEW_LABELS, type AnimationState, type CameraPose, type ViewId } from './studioTypes'

export function ObjectInspector({
  node,
  entry,
  clips,
  animation,
  onAnimation,
}: {
  node: Object3D | null
  entry: ModelRegistryEntry
  clips: string[]
  animation: AnimationState
  onAnimation: (state: AnimationState) => void
}) {
  const materials =
    node instanceof Mesh || node instanceof Sprite ? (Array.isArray(node.material) ? node.material : [node.material]) : []
  return (
    <>
      <section className="panel-section">
        <h2>模型信息</h2>
        <p>{entry.label}</p>
        <p className="muted">{entry.attribution}</p>
        <p className="muted">{entry.procedural ? '程序化 3D 资产' : entry.glbPath}</p>
      </section>
      <section className="panel-section">
        <h2>选中对象</h2>
        {node ? (
          <>
            <p>{node.name || node.type}</p>
            <p className="muted">
              {node.type} · {node.children.length} 个子节点
            </p>
          </>
        ) : (
          <p className="panel-empty">点击模型或左侧节点进行检查</p>
        )}
      </section>
      {node && (
        <section className="panel-section">
          <h2>
            材质检查 <small>只读</small>
          </h2>
          {materials.length ? (
            materials.map((raw, i) => {
              const material = raw as MeshStandardMaterial
              return (
                <div className="material-block" key={raw.uuid}>
                  <strong>{material.name || `材质 ${i + 1}`}</strong>
                  <dl>
                    <dt>类型</dt>
                    <dd>{material.type}</dd>
                    {material.color && (
                      <>
                        <dt>颜色</dt>
                        <dd>#{material.color.getHexString()}</dd>
                      </>
                    )}
                    {'metalness' in material && (
                      <>
                        <dt>金属度</dt>
                        <dd>{material.metalness.toFixed(2)}</dd>
                      </>
                    )}
                    {'roughness' in material && (
                      <>
                        <dt>粗糙度</dt>
                        <dd>{material.roughness.toFixed(2)}</dd>
                      </>
                    )}
                    <dt>透明度</dt>
                    <dd>{material.opacity.toFixed(2)}</dd>
                    <dt>透明</dt>
                    <dd>{material.transparent ? '是' : '否'}</dd>
                  </dl>
                </div>
              )
            })
          ) : (
            <p className="panel-empty">此节点没有材质，请选择 Mesh 或 Sprite</p>
          )}
        </section>
      )}
      {!!clips.length && (
        <section className="panel-section">
          <h2>{entry.previewAnimation ? '预览动画' : '模型动画'}</h2>
          <label>
            片段
            <select
              aria-label="动画片段"
              value={animation.clip}
              onChange={(e) => onAnimation({ ...animation, clip: e.target.value })}
            >
              <option value="">选择片段</option>
              {clips.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button
              disabled={!animation.clip}
              onClick={() => onAnimation({ ...animation, playing: !animation.playing })}
            >
              {animation.playing ? '暂停' : '播放'}
            </button>
            <button onClick={() => onAnimation({ ...animation, clip: '', playing: false })}>停止</button>
          </div>
          <label>
            播放速度
            <input
              aria-label="播放速度"
              type="number"
              min="0.1"
              max="3"
              step="0.1"
              value={animation.speed}
              onChange={(e) => {
                const speed = e.target.valueAsNumber
                if (Number.isFinite(speed))
                  onAnimation({ ...animation, speed: Math.max(0.1, Math.min(3, speed)) })
              }}
            />
          </label>
        </section>
      )}
    </>
  )
}
export function CameraPanel({
  id,
  pose,
  onPose,
  linked,
  onLinked,
  disabled,
}: {
  id: ViewId
  pose: CameraPose | null
  onPose: (pose: CameraPose) => void
  linked: boolean
  onLinked: (linked: boolean) => void
  disabled: boolean
}) {
  const orthographic = id !== 'perspective' && id !== 'wireframe'
  return (
    <section className="panel-section">
      <h2>相机 · {VIEW_LABELS[id]}</h2>
      {pose && (
        <div className="camera-fields">
          {(
            [
              ['distance', '距离', 0.1, 500],
              ['azimuth', '方位角 °', -360, 360],
              ['elevation', '仰角 °', -89, 89],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step="0.1"
                value={Number(pose[key].toFixed(1))}
                disabled={disabled || orthographic}
                onChange={(e) => {
                  const value = e.target.valueAsNumber
                  if (Number.isFinite(value)) onPose({ ...pose, [key]: Math.min(max, Math.max(min, value)) })
                }}
              />
            </label>
          ))}
        </div>
      )}
      {orthographic && <p className="muted">正交视图使用滚轮缩放，保持固定观察方向。</p>}
      <label className="check">
        <input type="checkbox" checked={linked} onChange={(e) => onLinked(e.target.checked)} />
        对比视口相机联动
      </label>
    </section>
  )
}
