import { memo, useEffect, useRef, useCallback, useState } from 'react'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useScrollStore } from '../stores/scrollStore'
import TerminalBar from '../terminal/TerminalBar'
import { createPlanetCommandHandler } from '../terminal/planetCommands'
import { useFloatingLabels, type SequenceStrategy, type LabelConfig } from '../behaviors/useFloatingLabels'
import type { PBDParams } from '../behaviors/usePBDLayout'
import PlanetLabelDebug from './PlanetLabelDebug'
import './FloatingLabels.css'

/**
 * FloatingLabels — 行星标签 DOM 编排容器（PBD 物理驱动）。
 *
 * 通过 useFloatingLabels 管理 3 个 Pill 的 PBD 物理位置。
 * 折叠态 label 在 typewriter 动画结束后自动收缩宽度至适配 welcome-text。
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

const FloatingLabels = memo(function FloatingLabels(props: FloatingLabelsProps) {
  const {
    configs, sequenceStrategy, staggerDelay, baseTypewriterDelay, exitTimeout,
    collapsedWidth = 60, expandedWidth = 200,
    collapsedHeight = 36, expandedHeight = 44,
    pbdParams,
  } = props

  const screenCoords = useRealtimeStore(s => s.screenCoords)
  const screenRadii = useRealtimeStore(s => s.planetScreenRadii)
  const centralStar = useRealtimeStore(s => s.centralStarScreen)
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const isAnyFocused = focusedPlanetIdx >= 0

  // ---- 折叠态 typewriter 完成后自收缩宽度 ----
  // Canvas 2D 文本测量（与 TerminalBar 相同字体）
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const getTextWidth = useCallback((text: string): number => {
    if (!measureCtxRef.current) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      ctx.font = "0.58rem 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace"
      measureCtxRef.current = ctx
    }
    return measureCtxRef.current.measureText(text).width
  }, [])

  // per-label 折叠态自适合宽度（px），typewriter 完成后写入
  const [collapsedFitWidths, setCollapsedFitWidths] = useState<Record<number, number>>({})

  const {
    labels, activeTrackIdx,
    handlePillClick, handleExternalDismiss, resetExitTimer, pbdReady,
  } = useFloatingLabels(
    { configs, sequenceStrategy, staggerDelay, baseTypewriterDelay, exitTimeout,
      collapsedWidth, expandedWidth, collapsedHeight, expandedHeight, pbdParams,
      collapsedFitWidths },
    screenCoords, screenRadii, centralStar, isAnyFocused,
  )

  // 顺序播放：label 0 先渲染，typing+exitGap 完成后 label 1，以此类推
  const [showCount, setShowCount] = useState(1)
  const typingDoneRef = useRef<Set<number>>(new Set())

  const handleLabelModeChange = useCallback((trackIdx: number, mode: string) => {
    if (mode === 'idle') {
      typingDoneRef.current = new Set(typingDoneRef.current).add(trackIdx)
      setShowCount(prev => Math.max(prev, trackIdx + 2)) // 解锁下一个 label
      // 折叠态 typewriter 完成 → 计算适配 welcome-text 的宽度
      if (activeTrackIdx < 0) {
        const cfg = configs[trackIdx]
        const textW = getTextWidth(cfg.planetLink.label)
        // 文本宽度 + 左右 padding（6px × 2）+ 圆角余量
        const fitW = Math.max(24, Math.min(collapsedWidth, Math.ceil(textW + 18)))
        setCollapsedFitWidths(prev => ({ ...prev, [trackIdx]: fitW }))
      }
    }
    if (mode === 'active') handlePillClick(trackIdx)
  }, [handlePillClick, activeTrackIdx, configs, collapsedWidth, getTextWidth])

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
        const fitW = collapsedFitWidths[label.trackIdx]
        // 折叠 + 已收缩 → 用适配宽度；折叠 + 未收缩 → 默认宽度；展开 → 全宽
        const w = isExpanded ? expandedWidth
          : (fitW !== undefined ? fitW : collapsedWidth)
        const h = isExpanded ? expandedHeight : collapsedHeight

        return (
          <div
            key={label.trackIdx}
            className={`floating-label-pill${isExpanded ? ' expanded' : ''}`}
            style={{
              '--pill-accent': label.config.planetLink.accent,
              transform: `translate(${label.x}px, ${label.y}px)`,
              width: `${w}px`,
              opacity: label.visible ? undefined : 0,
              pointerEvents: label.visible ? undefined : 'none',
              zIndex: isExpanded ? 11 : 10,
            } as React.CSSProperties}
            onClick={(e) => { e.stopPropagation(); handlePillClick(label.trackIdx) }}
          >
            {pbdReady && label.trackIdx < showCount && (
              <TerminalBar
                layout={{ maxEchoLines: label.config.maxEchoLines, maxWidth: '100%',
                  borderRadius: '6px', padding: '3px 6px', fontSize: '0.58rem',
                  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  zIndex: 10, top: '0' }}
                variant={isExpanded ? 'glass' : 'label'}
                state={{
                  mode: isExpanded ? undefined
                    : typingDoneRef.current.has(label.trackIdx) ? 'idle' : undefined,
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

      <PlanetLabelDebug
        labels={labels}
        collapsedWidth={collapsedWidth}
        expandedWidth={expandedWidth}
        collapsedHeight={collapsedHeight}
        expandedHeight={expandedHeight}
        pbdParams={pbdParams}
        collapsedFitWidths={collapsedFitWidths}
      />

      {activeTrackIdx >= 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9, pointerEvents: 'auto' }}
          onClick={() => handleExternalDismiss()} />
      )}
    </div>
  )
})

export default FloatingLabels
export type { FloatingLabelsProps, LabelConfig, SequenceStrategy }
