import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { stepPBD, type PBDInput, type PBDResult, type PBDParams } from './usePBDLayout'
import { useRealtimeStore, type ScreenCoord } from '../stores/realtimeStore'
import type { PlanetLink } from '../types'

/**
 * useFloatingLabels — 行星标签编排逻辑（PBD 物理驱动）。
 *
 * 管理 3 个标签的：入场排序 + PBD 物理位置 + 展开/收起状态 + 退出超时。
 * PBD 状态（速度）跨帧保持 → 天然平滑连续。
 *
 * 援引：Müller et al. (2007) "Position Based Dynamics"
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
  x: number; y: number
  visible: boolean
  collapsed: boolean
  typewriterDelay: number
  debugAnchors?: { anchorL: { x: number; y: number }; anchorR: { x: number; y: number } }
}

interface FloatingLabelsOptions {
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

export function useFloatingLabels(
  options: FloatingLabelsOptions,
  screenCoords: [ScreenCoord, ScreenCoord, ScreenCoord],
  screenRadii: [number, number, number],
  centralStarScreen: { x: number; y: number; r: number; visible: boolean },
  isAnyFocused: boolean,
) {
  const {
    configs,
    sequenceStrategy = 'proximity',
    staggerDelay = 800,
    exitTimeout = 15000,
    collapsedWidth = 85,
    expandedWidth = 200,
    collapsedHeight = 36,
    expandedHeight = 44,
    pbdParams = {},
  } = options

  const [activeTrackIdx, setActiveTrackIdx] = useState(-1)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight })
  const lastTimeRef = useRef(performance.now())
  const entryOrderRef = useRef<number[] | null>(null)

  // ---- 入场排序 ----
  const typewriterDelays = useMemo(() => {
    const delays = [800, 800, 800]
    if (sequenceStrategy === 'index') {
      delays[0] = 800; delays[1] = 800 + staggerDelay; delays[2] = 800 + staggerDelay * 2
      entryOrderRef.current = [0, 1, 2]
    } else if (sequenceStrategy === 'simultaneous') {
      entryOrderRef.current = [0, 1, 2]
    } else {
      const cx = viewportRef.current.width / 2; const cy = viewportRef.current.height / 2
      const indexed = configs.map((cfg, i) => {
        const c = screenCoords[i]
        return { i, dist: c.visible ? Math.hypot(c.x - cx, c.y - cy) : Infinity }
      })
      indexed.sort((a, b) => a.dist - b.dist)
      entryOrderRef.current = indexed.map(x => x.i)
      indexed.forEach(({ i }, rank) => { delays[i] = 800 + rank * staggerDelay })
    }
    return delays
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceStrategy, staggerDelay])

  // ---- PBD 物理（rAF 驱动，独立于 R3F frameloop） ----
  const [pbdCache, setPbdCache] = useState<{ x: number; y: number; aLx: number; aLy: number; aRx: number; aRy: number }[]>(
    () => [ {x:0,y:0,aLx:0,aLy:0,aRx:0,aRy:0}, {x:0,y:0,aLx:0,aLy:0,aRx:0,aRy:0}, {x:0,y:0,aLx:0,aLy:0,aRx:0,aRy:0} ]
  )
  const [pbdReady, setPbdReady] = useState(false)
  let _pbdReadyLogged = false // module-level, survives re-renders
  const stableRefs = useRef({ pbdParams, collapsedWidth, expandedWidth, collapsedHeight, expandedHeight, configs, activeTrackIdx })
  stableRefs.current = { pbdParams, collapsedWidth, expandedWidth, collapsedHeight, expandedHeight, configs, activeTrackIdx }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const now = performance.now()
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = now

      const s = stableRefs.current
      const sc = useRealtimeStore.getState().screenCoords
      const sr = useRealtimeStore.getState().planetScreenRadii
      const cs = useRealtimeStore.getState().centralStarScreen
      const vp = viewportRef.current

      const inputs = s.configs.map((_, i) => ({
        sx: sc[i].x, sy: sc[i].y, pr: sr[i], visible: sc[i].visible,
        lw: s.activeTrackIdx === i ? s.expandedWidth : s.collapsedWidth,
        lh: s.activeTrackIdx === i ? s.expandedHeight : s.collapsedHeight,
      })) as [PBDInput, PBDInput, PBDInput]

      const results = stepPBD(
        inputs, cs, s.pbdParams, dt, vp.width, vp.height,
        s.collapsedWidth, s.expandedWidth, s.collapsedHeight, s.expandedHeight,
        s.activeTrackIdx,
      )

      const cached = results.map(r => ({
        x: r.x, y: r.y, aLx: r.anchorL.x, aLy: r.anchorL.y, aRx: r.anchorR.x, aRy: r.anchorR.y,
      }))
      setPbdCache(prev => {
        if (prev.length === 3 && prev.every((p, i) => Math.abs(p.x - cached[i].x) < 0.5 && Math.abs(p.y - cached[i].y) < 0.5)) return prev
        return cached
      })
      // 等待至少一个 body 激活（screenCoords 已有有效值）后才允许渲染 TerminalBar
      if (!_pbdReadyLogged && cached.some(c => c.x !== 0 || c.y !== 0)) {
        _pbdReadyLogged = true
        setPbdReady(true)
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ---- 退出超时管理 ----
  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current) { clearTimeout(exitTimerRef.current); exitTimerRef.current = null }
  }, [])
  const resetExitTimer = useCallback(() => {
    clearExitTimer()
    exitTimerRef.current = setTimeout(() => setActiveTrackIdx(-1), exitTimeout)
  }, [exitTimeout, clearExitTimer])
  const handlePillClick = useCallback((trackIdx: number) => {
    if (activeTrackIdx === trackIdx) { setActiveTrackIdx(-1); clearExitTimer() }
    else { setActiveTrackIdx(trackIdx); resetExitTimer() }
  }, [activeTrackIdx, resetExitTimer, clearExitTimer])
  const handleExternalDismiss = useCallback(() => { setActiveTrackIdx(-1); clearExitTimer() }, [clearExitTimer])

  // ---- 构建 labels（pbdCache 由 rAF 异步更新） ----
  const labels = configs.map((cfg, i): LabelState => ({
    trackIdx: i, config: cfg,
    x: pbdCache[i]?.x ?? 0, y: pbdCache[i]?.y ?? 0,
    visible: screenCoords[i].visible && !isAnyFocused,
    collapsed: activeTrackIdx !== i,
    typewriterDelay: typewriterDelays[i],
    debugAnchors: {
      anchorL: { x: pbdCache[i]?.aLx ?? 0, y: pbdCache[i]?.aLy ?? 0 },
      anchorR: { x: pbdCache[i]?.aRx ?? 0, y: pbdCache[i]?.aRy ?? 0 },
    },
  }))

  // ---- resize ----
  useEffect(() => {
    const onResize = () => { viewportRef.current = { width: window.innerWidth, height: window.innerHeight } }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { return () => clearExitTimer() }, [clearExitTimer])

  return { labels, activeTrackIdx, handlePillClick, handleExternalDismiss, resetExitTimer, pbdReady }
}
