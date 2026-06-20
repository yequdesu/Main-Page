import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { calcAnchorPositions, type AnchorInput, type AnchorResult } from './useAnchorAvoidance'
import type { ScreenCoord } from '../stores/realtimeStore'
import type { PlanetLink } from '../types'

/**
 * useFloatingLabels — 行星标签编排逻辑。
 *
 * 管理 3 个标签的：入场排序 + 锚点位置 + 展开/收起状态 + 退出超时。
 * 消费 realtimeStore.screenCoords，产出每个标签的 CSS 定位数据和状态。
 *
 * 援引：React Hooks 组合模式 — 逻辑与视图分离
 */

export type SequenceStrategy = 'index' | 'simultaneous' | 'proximity'

export interface LabelConfig {
  trackIdx: number
  planetLink: PlanetLink
  maxEchoLines: number
}

export interface LabelState {
  trackIdx: number
  config: LabelConfig
  /** Pill 屏幕 X（左上角） */
  x: number
  /** Pill 屏幕 Y（左上角） */
  y: number
  visible: boolean
  collapsed: boolean
  /** Welcome Slot 的延迟（ms），由入场排序计算 */
  typewriterDelay: number
}

interface FloatingLabelsOptions {
  configs: [LabelConfig, LabelConfig, LabelConfig]
  sequenceStrategy?: SequenceStrategy
  staggerDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
}

export function useFloatingLabels(
  options: FloatingLabelsOptions,
  /** 当前帧的 screenCoords（由 FloatingLabels 组件通过 Zustand selector 订阅传入） */
  screenCoords: [ScreenCoord, ScreenCoord, ScreenCoord],
  /** 是否有行星被聚焦 */
  isAnyFocused: boolean,
) {
  const {
    configs,
    sequenceStrategy = 'proximity',
    staggerDelay = 800,
    exitTimeout = 15000,
    collapsedWidth = 160,
    expandedWidth = 260,
  } = options

  const [activeTrackIdx, setActiveTrackIdx] = useState(-1)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight })
  // 缓存入场排序结果（仅首次计算，不随 screenCoords 变化）
  const entryOrderRef = useRef<number[] | null>(null)

  // ---- 入场排序：计算每个标签的 typewriter 延迟（仅首次） ----
  const typewriterDelays = useMemo(() => {
    const delays = [800, 800, 800]

    if (sequenceStrategy === 'index') {
      delays[0] = 800
      delays[1] = 800 + staggerDelay
      delays[2] = 800 + staggerDelay * 2
      entryOrderRef.current = [0, 1, 2]
    } else if (sequenceStrategy === 'simultaneous') {
      entryOrderRef.current = [0, 1, 2]
    } else if (sequenceStrategy === 'proximity') {
      const cx = viewportRef.current.width / 2
      const cy = viewportRef.current.height / 2
      const indexed = configs.map((cfg, i) => {
        const c = screenCoords[i]
        const dist = c.visible
          ? Math.hypot(c.x - cx, c.y - cy)
          : Infinity
        return { i, dist }
      })
      indexed.sort((a, b) => a.dist - b.dist)
      entryOrderRef.current = indexed.map(x => x.i)
      indexed.forEach(({ i }, rank) => {
        delays[i] = 800 + rank * staggerDelay
      })
    }

    return delays
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceStrategy, staggerDelay]) // 仅策略变更时重算，不依赖 screenCoords

  // ---- 锚点计算（使用传入的 screenCoords，每次渲染重算） ----
  const anchorResults: [AnchorResult, AnchorResult, AnchorResult] = (() => {
    const inputs = configs.map((cfg, i) => ({
      screenX: screenCoords[i].x,
      screenY: screenCoords[i].y,
      visible: screenCoords[i].visible,
      trackIdx: i,
      expanded: activeTrackIdx === i,
    })) as [AnchorInput, AnchorInput, AnchorInput]

    return calcAnchorPositions(inputs, viewportRef.current, collapsedWidth, expandedWidth)
  })()

  // ---- 退出超时管理 ----
  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }, [])

  const resetExitTimer = useCallback(() => {
    clearExitTimer()
    exitTimerRef.current = setTimeout(() => {
      setActiveTrackIdx(-1)
    }, exitTimeout)
  }, [exitTimeout, clearExitTimer])

  const handlePillClick = useCallback((trackIdx: number) => {
    if (activeTrackIdx === trackIdx) {
      // 再次点击同一标签 → 退出
      setActiveTrackIdx(-1)
      clearExitTimer()
    } else {
      setActiveTrackIdx(trackIdx)
      resetExitTimer()
    }
  }, [activeTrackIdx, resetExitTimer, clearExitTimer])

  // 外部点击 / Esc 退出
  const handleExternalDismiss = useCallback(() => {
    setActiveTrackIdx(-1)
    clearExitTimer()
  }, [clearExitTimer])

  // 构建 labels 数组（计算值，由 FloatingLabels 在渲染中调用）
  const labels = (() => {
    return configs.map((cfg, i): LabelState => ({
      trackIdx: i,
      config: cfg,
      x: anchorResults[i].x,
      y: anchorResults[i].y,
      visible: screenCoords[i].visible && !isAnyFocused,
      collapsed: activeTrackIdx !== i,
      typewriterDelay: typewriterDelays[i],
    }))
  })()

  // ---- resize 处理 ----
  useEffect(() => {
    const onResize = () => {
      viewportRef.current = { width: window.innerWidth, height: window.innerHeight }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ---- 清理 ----
  useEffect(() => {
    return () => clearExitTimer()
  }, [clearExitTimer])

  return {
    labels,
    activeTrackIdx,
    handlePillClick,
    handleExternalDismiss,
    /** 输入任意键时重置退出计时器 */
    resetExitTimer,
  }
}
