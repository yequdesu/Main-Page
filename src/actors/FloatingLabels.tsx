import { memo, useEffect, useRef, useCallback } from 'react'
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
 * PBD 状态（速度）跨帧保持 → 天然平滑连续。
 *
 * 援引：Müller et al. (2007) "Position Based Dynamics"
 */

interface FloatingLabelsProps {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: SequenceStrategy
  staggerDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
  collapsedHeight?: number
  expandedHeight?: number
  pbdParams?: PBDParams
}

const FloatingLabels = memo(function FloatingLabels(props: FloatingLabelsProps) {
  const {
    configs, sequenceStrategy, staggerDelay, exitTimeout,
    collapsedWidth = 85, expandedWidth = 200,
    collapsedHeight = 36, expandedHeight = 44,
    pbdParams,
  } = props

  const screenCoords = useRealtimeStore(s => s.screenCoords)
  const screenRadii = useRealtimeStore(s => s.planetScreenRadii)
  const centralStar = useRealtimeStore(s => s.centralStarScreen)
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const isAnyFocused = focusedPlanetIdx >= 0

  const {
    labels, activeTrackIdx,
    handlePillClick, handleExternalDismiss, resetExitTimer,
  } = useFloatingLabels(
    { configs, sequenceStrategy, staggerDelay, exitTimeout,
      collapsedWidth, expandedWidth, collapsedHeight, expandedHeight, pbdParams },
    screenCoords, screenRadii, centralStar, isAnyFocused,
  )

  const typingDoneRef = useRef<Set<number>>(new Set())
  const handleLabelModeChange = useCallback((trackIdx: number, mode: string) => {
    if (mode === 'idle') typingDoneRef.current = new Set(typingDoneRef.current).add(trackIdx)
    if (mode === 'active') handlePillClick(trackIdx)
  }, [handlePillClick])

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
        const w = isExpanded ? expandedWidth : collapsedWidth
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
            <TerminalBar
              layout={{ maxEchoLines: label.config.maxEchoLines, maxWidth: '100%',
                borderRadius: '6px', padding: '3px 6px', fontSize: '0.58rem',
                fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace', zIndex: 10, top: '0' }}
              variant={isExpanded ? 'glass' : 'transparent'}
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
              <TerminalBar.Welcome delay={label.typewriterDelay} charInterval={40} exitGap={1200}>
                {label.config.planetLink.label}
              </TerminalBar.Welcome>
              <TerminalBar.Section rows="lineByLine" rowInterval={150} appearAfter="welcome">
                {label.config.planetLink.url}
              </TerminalBar.Section>
            </TerminalBar>
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
