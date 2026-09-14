import { useMemo, useState } from 'react'
import { useAnchorStore } from '../anchorStore'
import { CORE_ACTORS } from '../coreActors'
import { CORE_SEQUENCES } from '../coreSequences'
import { useActorRuntimeStore } from '../actorRuntime'
import { useEffectScopeSnapshots } from '../effectScope'
import { getDomLayer, listLayers, resolvePointerEvents } from '../layerRegistry'
import { useSequenceStore } from '../sequenceStore'
import { snapshotTimeline } from '../timeline'
import './CompositionPanel.css'
import { PAGE_FLOW } from '../../types'

interface CompositionPanelProps {
  scrollProgress: number
  onSeek?: (progress: number) => void
}

export default function CompositionPanel({ scrollProgress, onSeek }: CompositionPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const anchors = useAnchorStore((state) => state.anchors)
  const actorRuntime = useActorRuntimeStore((state) => state.actors)
  const sequences = useSequenceStore((state) => state.states)
  const events = useSequenceStore((state) => state.events)
  const effectScopes = useEffectScopeSnapshots()
  const timeline = useMemo(() => snapshotTimeline(scrollProgress), [scrollProgress])
  const layers = useMemo(() => listLayers(), [])
  const panelLayer = getDomLayer('dom.debugPanel')

  if (collapsed) {
    return (
      <button
        type="button"
        className="composition-panel-toggle composition-panel-toggle--collapsed"
        style={{
          position: panelLayer.position,
          zIndex: panelLayer.zIndex,
          pointerEvents: resolvePointerEvents(panelLayer.pointerEvents),
        }}
        aria-label="Expand Composition Runtime panel"
        onClick={(event) => {
          event.stopPropagation()
          setCollapsed(false)
        }}
      >
        Runtime
      </button>
    )
  }

  return (
    <aside
      className="composition-panel"
      style={{
        position: panelLayer.position,
        zIndex: panelLayer.zIndex,
        pointerEvents: resolvePointerEvents(panelLayer.pointerEvents),
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="composition-panel__header">
        <strong>Composition Runtime</strong>
        <button
          type="button"
          className="composition-panel-toggle"
          aria-label="Collapse Composition Runtime panel"
          onClick={(event) => {
            event.stopPropagation()
            setCollapsed(true)
          }}
        >
          -
        </button>
      </header>
      <div className="composition-panel__body">
        <section>
          <h3>Timeline</h3>
          {onSeek && <label>Page {scrollProgress.toFixed(3)}
            <input aria-label="页面时间轴" type="range" min={0} max={PAGE_FLOW.end} step={0.001}
              value={scrollProgress} onChange={event => onSeek(Number(event.target.value))} style={{ width: '100%' }} />
          </label>}
          {Object.entries(timeline).map(([key, value]) => (
            <div key={key}>
              {key}: {value.progress.toFixed(2)} {value.active ? 'active' : ''}
            </div>
          ))}
        </section>
        <section>
          <h3>Actors</h3>
          {CORE_ACTORS.map((actor) => {
            const runtime = actorRuntime[actor.id]
            const status = runtime?.mounted
              ? runtime.active ? 'active' : 'mounted'
              : 'idle'
            return (
              <div key={actor.id}>
                {actor.id} [{actor.domain}] {status}
                {runtime ? ` f${runtime.lastFrameId} #${runtime.frameCount}` : ''}
              </div>
            )
          })}
        </section>
        <section>
          <h3>Layers</h3>
          {layers.map((layer) => (
            <div key={layer.id}>{layer.id}</div>
          ))}
        </section>
        <section>
          <h3>Anchors</h3>
          {Object.values(anchors).map((anchor) => (
            <div key={anchor.id}>
              {anchor.id} ({anchor.space}) f{anchor.frameId}
            </div>
          ))}
        </section>
        <section>
          <h3>Sequences</h3>
          {CORE_SEQUENCES.map((seq) => {
            const state = sequences[seq.id]
            return <div key={seq.id}>{seq.id}: {state?.phase ?? seq.initial}</div>
          })}
        </section>
        <section>
          <h3>Effects</h3>
          {effectScopes.map((scope) => (
            <div key={scope.owner}>
              {scope.owner}: tween {scope.tweens} timer {scope.timers} raf {scope.rafs}
            </div>
          ))}
        </section>
        <section>
          <h3>Signals</h3>
          {events.slice(-8).map((event, index) => (
            <div key={`${event.seqId}-${event.at}-${index}`}>
              {event.seqId}: {event.from} --{event.signal}--&gt; {event.to}
            </div>
          ))}
        </section>
      </div>
    </aside>
  )
}
