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
 * ## 时间参数（可调，影响入场动画节奏）
 *
 * | 参数 | 默认值 | 增大效果 | 减小效果 |
 * |------|--------|----------|----------|
 * | `baseTypewriterDelay` | 600ms | 所有 label 延迟更久才出现，页面"静默期"更长 | label 更快出现，节奏紧凑 |
 * | `staggerDelay` | 600ms | label 间错开更明显，逐个登场的"呼吸感"更强 | label 近乎同时出现，减少等待 |
 *
 * 两参数组合示例：
 *   base=600, stagger=1200 → 首个快出，后续大间隔跟进（强调首位）
 *   base=1200, stagger=400 → 整体慢入，但一旦开始就紧凑展示（叙事感）
 *   base=400, stagger=400  → 快速全部展示（简洁模式）
 *
 * ## 物理参数（模块常量，一般不调）
 *
 * | 常量 | 默认值 | 作用 |
 * |------|--------|------|
 * | `MAX_PBD_DT` | 0.1s | PBD 单帧最大时间步长，防止标签暂停后恢复时瞬移 |
 * | `PBD_CACHE_THRESHOLD` | 0.5px | 位置变化低于此值时不触发 React re-render，减少无效渲染 |
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
  /**
   * 标签间错开延迟（ms）。
   *
   * 作用：第二个及后续 label 的 typewriter 开始延迟在前一个的基础上叠加此值。
   *       index 策略：delay[i] = baseTypewriterDelay + i × staggerDelay
   *       proximity 策略：delay[i] = baseTypewriterDelay + rank × staggerDelay
   *
   * 增大 → 标签逐个出现的间隔更长，节奏更舒缓
   * 减小 → 标签近乎同时出现，信息密度更大
   */
  staggerDelay?: number
  /**
   * typewriter 基础延迟（ms），所有 label 的起步等待时间。
   *
   * 作用：在 PBD 位置稳定后、打字机动画开始前的统一静默期。
   *       所有策略下每个 label 的 typewriterDelay 最小值均为此值。
   *
   * 增大 → 页面加载后更长的"留白"时间，强调场景本身
   * 减小 → 标签更快出现，减少用户等待
   */
  baseTypewriterDelay?: number
  exitTimeout?: number
  collapsedWidth?: number
  expandedWidth?: number
  collapsedHeight?: number
  expandedHeight?: number
  pbdParams?: PBDParams
}

/**
 * PBD 单帧最大时间步长（秒）。
 *
 * 当页面切到后台或标签页暂停后恢复时，rAF 的 dt 可能非常大。
 * 限制此值可防止 PBD 物理在一帧内产生过大的位移（瞬移）。
 *
 * 0.1s ≈ 6 帧 @ 60fps — 在此之上位置预测已经不可靠。
 */
const MAX_PBD_DT = 0.1

/**
 * PBD 缓存位置变化阈值（px）。
 *
 * rAF 循环每帧检查 PBD 输出与当前 React state 的差异。
 * 当所有 label 的 x/y 变化均 < 此值时跳过 setState，
 * 避免 PBD 微小振荡触发不必要的 React re-render。
 *
 * 减小 → 位置更新更精确，但渲染次数增加
 * 增大 → 减少渲染，但可能出现亚像素"粘滞"感
 */
const PBD_CACHE_THRESHOLD = 0.5

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
    staggerDelay = 600,
    baseTypewriterDelay = 600,
    exitTimeout = 15000,
    collapsedWidth = 60,
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
    const base = baseTypewriterDelay
    const delays = [base, base, base]
    if (sequenceStrategy === 'index') {
      delays[0] = base; delays[1] = base + staggerDelay; delays[2] = base + staggerDelay * 2
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
      indexed.forEach(({ i }, rank) => { delays[i] = base + rank * staggerDelay })
    }
    return delays
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceStrategy, staggerDelay, baseTypewriterDelay])

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
      const dt = Math.min((now - lastTimeRef.current) / 1000, MAX_PBD_DT)
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
        if (prev.length === 3 && prev.every((p, i) => Math.abs(p.x - cached[i].x) < PBD_CACHE_THRESHOLD && Math.abs(p.y - cached[i].y) < PBD_CACHE_THRESHOLD)) return prev
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
