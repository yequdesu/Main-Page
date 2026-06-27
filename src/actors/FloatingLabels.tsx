import { memo, useEffect, useRef, useCallback, useReducer, useMemo } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import TerminalBar from '../terminal/TerminalBar'
import { createPlanetCommandHandler } from '../terminal/planetCommands'
import { useFloatingLabels, type SequenceStrategy, type LabelConfig } from '../behaviors/useFloatingLabels'
import type { PBDParams } from '../behaviors/usePBDLayout'
import PlanetLabelDebug from './PlanetLabelDebug'
import PlanetLabelGuideLines from './PlanetLabelGuideLines'
import { useAnchorStore } from '../composition/anchorStore'
import {
  centralStarScreenAnchorId,
  planetScreenAnchorId,
  planetScreenRadiusAnchorId,
  type ScreenCircle,
  type ScreenPoint,
} from '../composition/coreAnchors'
import { getDomLayer, resolvePointerEvents } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'
import { useEffectScope } from '../composition/effectScope'
import { usePhaseAtOrAfter, useSignal } from '../composition/sequenceStore'
import './FloatingLabels.css'

/**
 * FloatingLabels �?行星标签 DOM 编排容器（PBD 物理驱动）�?
 *
 * 通过 useFloatingLabels 管理 3 �?Pill �?PBD 物理位置�?
 * 折叠�?label �?typewriter 动画结束后自动收缩宽度至适配 welcome-text�?
 *
 * 援引：Müller et al. (2007) "Position Based Dynamics"
 */

interface FloatingLabelsProps {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: SequenceStrategy
  staggerDelay?: number
  /** @see FloatingLabelsOptions.baseTypewriterDelay */
  baseTypewriterDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
  collapsedHeight?: number
  expandedHeight?: number
  pbdParams?: PBDParams
}

type LabelLayoutPhase = 'idle' | 'visualFit' | 'pbdFit' | 'guideReady'

interface LabelLayoutState {
  phase: LabelLayoutPhase
  visualWidth?: number
  pbdWidth?: number
}

type LabelLayoutAction =
  | { type: 'visualFit'; trackIdx: number; width: number }
  | { type: 'pbdFit'; trackIdx: number; width: number }
  | { type: 'guideReady'; trackIdx: number; width: number }

const LABEL_LAYOUT_PHASE_ORDER: Record<LabelLayoutPhase, number> = {
  idle: 0,
  visualFit: 1,
  pbdFit: 2,
  guideReady: 3,
}

const EMPTY_SCREEN_POINT: ScreenPoint = { x: 0, y: 0, visible: false }
const EMPTY_SCREEN_CIRCLE: ScreenCircle = { x: 0, y: 0, r: 0, visible: false }

function labelLayoutAtOrAfter(state: LabelLayoutState | undefined, phase: LabelLayoutPhase): boolean {
  return Boolean(state && LABEL_LAYOUT_PHASE_ORDER[state.phase] >= LABEL_LAYOUT_PHASE_ORDER[phase])
}

function labelLayoutReducer(
  state: Record<number, LabelLayoutState>,
  action: LabelLayoutAction,
): Record<number, LabelLayoutState> {
  const current = state[action.trackIdx] ?? { phase: 'idle' as LabelLayoutPhase }
  if (action.type === 'visualFit') {
    return {
      ...state,
      [action.trackIdx]: { phase: 'visualFit', visualWidth: action.width },
    }
  }
  if (action.type === 'pbdFit') {
    return {
      ...state,
      [action.trackIdx]: {
        ...current,
        phase: 'pbdFit',
        visualWidth: current.visualWidth ?? action.width,
        pbdWidth: action.width,
      },
    }
  }
  return {
    ...state,
    [action.trackIdx]: {
      ...current,
      phase: 'guideReady',
      visualWidth: current.visualWidth ?? action.width,
      pbdWidth: current.pbdWidth ?? action.width,
    },
  }
}

const FloatingLabels = memo(function FloatingLabels(props: FloatingLabelsProps) {
  useActorRuntime('planetLabels', true)
  const effectScope = useEffectScope('planetLabels.measure')
  const {
    configs, sequenceStrategy, staggerDelay, baseTypewriterDelay, exitTimeout,
    collapsedWidth = 60, expandedWidth = 200,
    collapsedHeight = 36, expandedHeight = 44,
    pbdParams,
  } = props

  const screen0 = useAnchorStore(s => (s.anchors[planetScreenAnchorId(0)]?.value as ScreenPoint | undefined) ?? EMPTY_SCREEN_POINT)
  const screen1 = useAnchorStore(s => (s.anchors[planetScreenAnchorId(1)]?.value as ScreenPoint | undefined) ?? EMPTY_SCREEN_POINT)
  const screen2 = useAnchorStore(s => (s.anchors[planetScreenAnchorId(2)]?.value as ScreenPoint | undefined) ?? EMPTY_SCREEN_POINT)
  const radius0 = useAnchorStore(s => (s.anchors[planetScreenRadiusAnchorId(0)]?.value as number | undefined) ?? 0)
  const radius1 = useAnchorStore(s => (s.anchors[planetScreenRadiusAnchorId(1)]?.value as number | undefined) ?? 0)
  const radius2 = useAnchorStore(s => (s.anchors[planetScreenRadiusAnchorId(2)]?.value as number | undefined) ?? 0)
  const centralStar = useAnchorStore(s => (s.anchors[centralStarScreenAnchorId]?.value as ScreenCircle | undefined) ?? EMPTY_SCREEN_CIRCLE)
  const screenCoords: [ScreenPoint, ScreenPoint, ScreenPoint] = [screen0, screen1, screen2]
  const screenRadii: [number, number, number] = [radius0, radius1, radius2]
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const isAnyFocused = focusedPlanetIdx >= 0
  const labelsLayer = getDomLayer('dom.planetLabels')
  const expandedLayer = getDomLayer('dom.planetLabelExpanded')
  const backdropLayer = getDomLayer('dom.planetLabelBackdrop')
  const signalAct3 = useSignal('act3.entry')
  const signalLabelReveal = useSignal('labelReveal')
  const labelsRevealStarted = usePhaseAtOrAfter('act3.entry', 'labelsReveal')
  const labelVisibleByPhase = [
    usePhaseAtOrAfter('labelReveal', 'label0'),
    usePhaseAtOrAfter('labelReveal', 'label1'),
    usePhaseAtOrAfter('labelReveal', 'label2'),
  ] as const

  // ---- 折叠�?typewriter 完成后自收缩宽度 ----
  // DOM 实时测量：读 <span> �?getBoundingClientRect，比 Canvas measureText
  // 更准确（不受浏览器字体引擎差异影响）。Canvas 仅作 fallback�?
  const pillRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const [labelLayouts, dispatchLabelLayout] = useReducer(labelLayoutReducer, {})
  const pbdDelayTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const guideTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const pbdFitWidths = useMemo(() => {
    const widths: Record<number, number> = {}
    for (const [key, layout] of Object.entries(labelLayouts)) {
      if (layout.pbdWidth !== undefined) widths[Number(key)] = layout.pbdWidth
    }
    return widths
  }, [labelLayouts])
  const guideLayouts = useMemo(() => {
    const layouts: Record<number, { width?: number; ready: boolean }> = {}
    for (let i = 0; i < configs.length; i++) {
      const layout = labelLayouts[i]
      layouts[i] = {
        width: layout?.visualWidth,
        ready: labelLayoutAtOrAfter(layout, 'guideReady'),
      }
    }
    return layouts
  }, [configs.length, labelLayouts])

  const {
    labels, activeTrackIdx,
    handlePillClick, handleExternalDismiss, resetExitTimer, layoutReady,
  } = useFloatingLabels(
    { configs, sequenceStrategy, staggerDelay, baseTypewriterDelay, exitTimeout,
      collapsedWidth, expandedWidth, collapsedHeight, expandedHeight, pbdParams,
      collapsedFitWidths: pbdFitWidths },
    screenCoords, isAnyFocused,
  )

  const handleLabelModeChange = useCallback((trackIdx: number, mode: string) => {
    if (mode === 'idle') {
      if (trackIdx === 0) {
        signalAct3('firstLabelMounted')
        signalLabelReveal('label0Done')
      } else if (trackIdx === 1) {
        signalLabelReveal('label1Done')
      } else if (trackIdx === 2) {
        signalLabelReveal('label2Done')
        signalAct3('allLabelsTyped')
      }
      // 折叠�?typewriter 完成 �?DOM 实测 welcome-text 渲染宽度
      if (activeTrackIdx < 0) {
        effectScope.requestAnimationFrame(() => {
          const pill = pillRefs.current[trackIdx]
          if (!pill) return
          // �?<span> 的实际渲染宽度（getBoundingClientRect 跨浏览器一致）
          const echoEl = pill.querySelector('.terminal-echo') as HTMLElement | null
          const firstSpan = echoEl?.firstElementChild as HTMLElement | null
          const domW = firstSpan ? firstSpan.getBoundingClientRect().width : 0
          // Canvas fallback：使用元素实�?computed font，消除浏览器字体引擎差异
          const measuredW = domW > 0 ? domW : (() => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!
            ctx.font = firstSpan ? getComputedStyle(firstSpan).font
              : "0.58rem 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace"
            return ctx.measureText(configs[trackIdx].planetLink.label).width
          })()
          // 文本宽度 + 左右 padding�?px × 2�? 圆角余量
          const fitW = Math.max(24, Math.min(collapsedWidth, Math.ceil(measuredW + 18)))
          dispatchLabelLayout({ type: 'visualFit', trackIdx, width: fitW })
          effectScope.clearTimer(pbdDelayTimers.current[trackIdx])
          pbdDelayTimers.current[trackIdx] = effectScope.setTimeout(() => {
            dispatchLabelLayout({ type: 'pbdFit', trackIdx, width: fitW })
          }, 250)
          effectScope.clearTimer(guideTimers.current[trackIdx])
          guideTimers.current[trackIdx] = effectScope.setTimeout(() => {
            dispatchLabelLayout({ type: 'guideReady', trackIdx, width: fitW })
            signalAct3('labelShrinkDone')
            signalAct3('guidesShown')
          }, 500)
        })
      }
    }
    if (mode === 'active') handlePillClick(trackIdx)
  }, [handlePillClick, activeTrackIdx, configs, collapsedWidth, effectScope, signalAct3, signalLabelReveal])

  // 清理 PBD 与牵引线延迟定时�?
  useEffect(() => {
    const pbd = pbdDelayTimers.current
    const guide = guideTimers.current
    return () => {
      Object.values(pbd).forEach(t => effectScope.clearTimer(t))
      Object.values(guide).forEach(t => effectScope.clearTimer(t))
      effectScope.cancel('planet labels cleanup')
    }
  }, [effectScope])

  useEffect(() => {
    if (activeTrackIdx < 0) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleExternalDismiss() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTrackIdx, handleExternalDismiss])

  return (
    <div className="floating-labels-container">
      {labels.map((label) => {
        const isExpanded = activeTrackIdx === label.trackIdx
        const fitW = labelLayouts[label.trackIdx]?.visualWidth
        // 折叠 + 已收�?�?用适配宽度；折�?+ 未收�?�?默认宽度；展开 �?全宽
        const w = isExpanded ? expandedWidth
          : (fitW !== undefined ? fitW : collapsedWidth)
        const h = isExpanded ? expandedHeight : collapsedHeight

        return (
          <div
            key={label.trackIdx}
            ref={(el) => { pillRefs.current[label.trackIdx] = el }}
            className={`floating-label-pill${isExpanded ? ' expanded' : ''}`}
            style={{
              '--pill-accent': label.config.planetLink.accent,
              transform: `translate(${label.x}px, ${label.y}px)`,
              width: `${w}px`,
              opacity: label.visible ? undefined : 0,
              pointerEvents: label.visible ? undefined : 'none',
              zIndex: isExpanded ? expandedLayer.zIndex : labelsLayer.zIndex,
            } as React.CSSProperties}
            onClick={(e) => { e.stopPropagation(); handlePillClick(label.trackIdx) }}
          >
            {layoutReady && labelsRevealStarted && labelVisibleByPhase[label.trackIdx] && (
              <TerminalBar
                layout={{ maxEchoLines: label.config.maxEchoLines, maxWidth: '100%',
                  borderRadius: '6px', padding: '3px 6px', fontSize: '0.58rem',
                  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  zIndex: labelsLayer.zIndex, top: '0' }}
                variant={isExpanded ? 'glass' : 'label'}
                state={{
                  mode: isExpanded ? undefined
                    : labelLayoutAtOrAfter(labelLayouts[label.trackIdx], 'visualFit') ? 'idle' : undefined,
                  onModeChange: (mode) => handleLabelModeChange(label.trackIdx, mode),
                }}
                commands={{
                  onCommand: (input: string) => {
                    resetExitTimer()
                    return createPlanetCommandHandler(label.trackIdx, label.config.planetLink)(input)
                  },
                  onPlayEcho: undefined,
                }}
                behavior={{ activationMode: 'click', blurTimeout: 100 }}
                onThemeUpdate={undefined}
              >
                <TerminalBar.Welcome
                  name={label.config.planetLink.label}
                  text={label.config.planetLink.label}
                  lineCount={1}
                  animation={{ inline: 'literal', charInterval: 40, startDelay: label.typewriterDelay }}
                  exitGap={400}
                />
                <TerminalBar.Section
                  name={label.config.planetLink.label}
                  getLines={() => [label.config.planetLink.url]}
                  rows="lineByLine"
                  rowInterval={150}
                  appearAfter="welcome"
                />
              </TerminalBar>
            )}
          </div>
        )
      })}

      <PlanetLabelGuideLines
        labels={labels}
        screenCoords={screenCoords}
        screenRadii={screenRadii}
        collapsedWidth={collapsedWidth}
        expandedWidth={expandedWidth}
        collapsedHeight={collapsedHeight}
        expandedHeight={expandedHeight}
        activeTrackIdx={activeTrackIdx}
        guideLayouts={guideLayouts}
      />

      <PlanetLabelDebug
        labels={labels}
        screenCoords={screenCoords}
        screenRadii={screenRadii}
        centralStar={centralStar}
        collapsedWidth={collapsedWidth}
        expandedWidth={expandedWidth}
        collapsedHeight={collapsedHeight}
        expandedHeight={expandedHeight}
        pbdParams={pbdParams}
        collapsedFitWidths={pbdFitWidths}
      />

      {activeTrackIdx >= 0 && (
        <div style={{
          position: backdropLayer.position,
          inset: 0,
          zIndex: backdropLayer.zIndex,
          pointerEvents: resolvePointerEvents(backdropLayer.pointerEvents),
        }}
          onClick={() => handleExternalDismiss()} />
      )}
    </div>
  )
})

export default FloatingLabels
export type { FloatingLabelsProps, LabelConfig, SequenceStrategy }
