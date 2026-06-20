import { memo } from 'react'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useScrollStore } from '../stores/scrollStore'
import TerminalBar from '../terminal/TerminalBar'
import { createPlanetCommandHandler } from '../terminal/planetCommands'
import { useFloatingLabels, type SequenceStrategy, type LabelConfig } from '../behaviors/useFloatingLabels'
import type { PlanetLink } from '../types'
import './FloatingLabels.css'

/**
 * FloatingLabels — 行星标签 DOM 编排容器。
 *
 * 通过 useFloatingLabels 管理 3 个 Pill 的位置、状态、动画编排。
 * 每个 Pill 内部挂载 TerminalBar，通过 Slot 声明 Welcome + Section。
 * 订阅 realtimeStore.screenCoords（每帧更新）驱动 Pill 位置。
 *
 * 援引：R3F + HTML Overlay 混合渲染（Three.js 社区常见模式）
 */

interface FloatingLabelsProps {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: SequenceStrategy
  staggerDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
}

const FloatingLabels = memo(function FloatingLabels(props: FloatingLabelsProps) {
  const {
    configs,
    sequenceStrategy,
    staggerDelay,
    exitTimeout,
    collapsedWidth = 160,
    expandedWidth = 260,
  } = props

  // 订阅 screenCoords（每帧由 Planets.useFrame 写入）和聚焦状态
  const screenCoords = useRealtimeStore(s => s.screenCoords)
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const isAnyFocused = focusedPlanetIdx >= 0

  const {
    labels,
    activeTrackIdx,
    handlePillClick,
    handleExternalDismiss,
    resetExitTimer,
  } = useFloatingLabels(
    {
      configs,
      sequenceStrategy,
      staggerDelay,
      exitTimeout,
      collapsedWidth,
      expandedWidth,
    },
    screenCoords,
    isAnyFocused,
  )

  return (
    <div className="floating-labels-container">
      {labels.map((label) => {
        const isExpanded = activeTrackIdx === label.trackIdx
        const width = isExpanded ? expandedWidth : collapsedWidth

        return (
          <div
            key={label.trackIdx}
            className={`floating-label-pill${isExpanded ? ' expanded' : ''}`}
            style={{
              '--pill-accent': label.config.planetLink.accent,
              transform: `translate(${label.x}px, ${label.y}px)`,
              width: `${width}px`,
              opacity: label.visible ? undefined : 0,
              zIndex: isExpanded ? 11 : 10,
            } as React.CSSProperties}
            onClick={(e) => {
              e.stopPropagation()
              handlePillClick(label.trackIdx)
            }}
          >
            <TerminalBar
              layout={{
                maxEchoLines: label.config.maxEchoLines,
                maxWidth: '100%',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '0.62rem',
                fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
                zIndex: 10,
              }}
              variant={isExpanded ? 'glass' : 'transparent'}
              state={{
                mode: isExpanded ? undefined : 'idle',
                onModeChange: (mode) => {
                  if (mode === 'active' && !isExpanded) {
                    handlePillClick(label.trackIdx)
                  }
                },
              }}
              commands={{
                onCommand: createPlanetCommandHandler(
                  label.trackIdx,
                  label.config.planetLink,
                ),
                onPlayEcho: undefined, // 使用 Slot Section 输出
              }}
              behavior={{
                activationMode: 'click',
                blurTimeout: 100,
              }}
              onThemeUpdate={undefined}
            >
              <TerminalBar.Welcome
                delay={label.typewriterDelay}
                charInterval={40}
                exitGap={1200}
              >
                {label.config.planetLink.label}
              </TerminalBar.Welcome>

              <TerminalBar.Section
                rows="lineByLine"
                rowInterval={150}
                appearAfter="welcome"
              >
                {label.config.planetLink.url}
              </TerminalBar.Section>
            </TerminalBar>
          </div>
        )
      })}

      {/* 点击外部区域退出 */}
      {activeTrackIdx >= 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9,
            pointerEvents: 'auto',
          }}
          onClick={() => {
            handleExternalDismiss()
          }}
        />
      )}
    </div>
  )
})

export default FloatingLabels
export type { FloatingLabelsProps, LabelConfig, SequenceStrategy }
