import { useState } from 'react'
import type { SceneTreeNode } from './studioTypes'

interface Props {
  tree: SceneTreeNode[]
  selectedId: string | null
  hiddenIds: string[]
  isolatedId: string | null
  onSelect: (id: string | null) => void
  onHide: () => void
  onIsolate: () => void
  onShowAll: () => void
  onFocus: () => void
}
function matches(node: SceneTreeNode, query: string): boolean {
  return (
    `${node.name} ${node.type}`.toLowerCase().includes(query) ||
    node.children.some((child) => matches(child, query))
  )
}
function TreeNode({
  node,
  props,
  query,
  depth,
}: {
  node: SceneTreeNode
  props: Props
  query: string
  depth: number
}) {
  const [open, setOpen] = useState(depth < 1)
  const ancestor = props.selectedId?.startsWith(`${node.id}.`)
  const expanded = open || !!query || ancestor
  const hidden = props.hiddenIds.some((id) => node.id === id || node.id.startsWith(`${id}.`))
  if (query && !matches(node, query)) return null
  return (
    <li>
      <div
        className={`tree-row ${props.selectedId === node.id ? 'selected' : ''} ${hidden ? 'muted' : ''}`}
        style={{ paddingLeft: depth * 12 }}
      >
        {node.children.length ? (
          <button
            className="tree-toggle"
            aria-label={`${expanded ? '折叠' : '展开'} ${node.name}`}
            aria-expanded={expanded}
            onClick={() => setOpen(!expanded)}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-toggle" />
        )}
        <button
          className="tree-node"
          title={`${node.name} · ${node.type}`}
          aria-pressed={props.selectedId === node.id}
          onClick={() => props.onSelect(node.id)}
        >
          {node.name}
          {hidden ? ' · 隐藏' : ''}
        </button>
      </div>
      {!!node.children.length && expanded && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} props={props} query={query} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
export default function SceneExplorer(props: Props) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const hasResult = props.tree.some((node) => matches(node, normalized))
  return (
    <aside className="scene-explorer" aria-label="场景对象">
      <div className="panel-section">
        <h2>场景对象</h2>
        <input
          className="tree-search"
          aria-label="搜索场景对象"
          placeholder="搜索名称或类型"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="button-row">
          <button disabled={!props.selectedId} onClick={props.onFocus}>
            聚焦
          </button>
          <button disabled={!props.selectedId} onClick={props.onHide}>
            隐藏 / 显示
          </button>
          <button disabled={!props.selectedId} aria-pressed={!!props.isolatedId} onClick={props.onIsolate}>
            隔离
          </button>
        </div>
        {(props.hiddenIds.length > 0 || props.isolatedId) && (
          <button onClick={props.onShowAll}>显示全部对象</button>
        )}
      </div>
      {!props.tree.length ? (
        <p className="panel-empty">模型加载完成后显示对象层级</p>
      ) : !hasResult ? (
        <p className="panel-empty">没有匹配的对象</p>
      ) : (
        <ul className="scene-tree" aria-label="模型对象层级">
          {props.tree.map((node) => (
            <TreeNode key={node.id} node={node} props={props} query={normalized} depth={0} />
          ))}
        </ul>
      )}
    </aside>
  )
}
