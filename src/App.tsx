import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import SceneCanvas from './r3f/Canvas'
import Act1OceanVoyage from './acts/Act1OceanVoyage'
import Act2GridTransition from './acts/Act2GridTransition'
import Act4SystemStructure from './acts/Act4SystemStructure'
import SystemStructureOverlay from './acts/SystemStructureOverlay'
import { PAGE_FLOW } from './behaviors/usePageFlow'
import Act3ContentPhase from './acts/Act3ContentPhase'
import { useScrollStore } from './stores/scrollStore'
import { TIMELINE } from './composition/timeline'
import { getLighthouseCapture } from './actors/LighthouseCapture'
import MainTerminal from './MainTerminal'
import { executeCommand } from './terminal/commands'
import InfoPanelTerminal from './InfoPanelTerminal'
import FloatingLabels from './actors/FloatingLabels'
import BrandTitle from './actors/BrandTitle'
import CompositionPanel from './composition/debug/CompositionPanel'
import { registerCoreActors } from './composition/coreActors'
import { registerCoreSequences } from './composition/coreSequences'
import { resetSequence, useSignal } from './composition/sequenceStore'
import { useEffectScope } from './composition/effectScope'
import type { LabelConfig, SequenceStrategy } from './behaviors/useFloatingLabels'
import { PLANET_LINKS } from './types'
import { useDayNight } from './theme/useDayNight'
import './theme/theme.css'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

const SCROLL_VH = 25
const FRICTION = 0.955
const MAX_VELOCITY = 0.025

/**
 * App 根组件 — GSAP ScrollTrigger + 滚动物理 + DOM 叠加层。
 *
 * 原 App.vue 逻辑迁移：onWheel, onClick, ScrollTrigger, GSAP ticker。
 *
 * 援引：
 *   Codrops 2025 — GSAP ScrollTrigger + R3F 混合
 *   @gsap/react useGSAP — 自动 cleanup
 */
export default function App() {
  useEffect(() => {
    registerCoreActors()
    registerCoreSequences()
  }, [])

  // ---- Zustand store ----
  const { scrollProgress, pageProgress, structureProgress, setPageProgress } = useScrollStore()
  const terminalMode = useScrollStore(s => s.terminalMode)
  const debugMode = useScrollStore(s => s.debugMode)
  const echoLines = useScrollStore(s => s.echoLines)
  const inputValue = useScrollStore(s => s.inputValue)
  const { handleThemeUpdate, themeKey } = useDayNight()
  const scrollEffectScope = useEffectScope('appScroll')
  const signalAct3 = useSignal('act3.entry')

  // ---- Physics state (refs — no re-render) ----
  const physRef = useRef({ target: 0, velocity: 0, lastScrollbar: 0, lastPhysics: 0, active: true })
  const clickTweenRef = useRef<gsap.core.Tween | null>(null)
  const lighthouseCapturedRef = useRef(false)
  const stRef = useRef<ScrollTrigger | null>(null)
  const act3VisibleRef = useRef(false)

  // ---- UI state (React — triggers re-render) ----
  const [isClickPlaying, setIsClickPlaying] = useState(false)
  const [lighthouseImage, setLighthouseImage] = useState<string | null>(null)
  const focusedPlanetIdx = useScrollStore(s => s.focusedPlanetIdx)
  const focusedVoyager = useScrollStore(s => s.focusedVoyager)
  const isAct3Focused = (focusedPlanetIdx >= 0 || focusedVoyager) && scrollProgress >= TIMELINE.act3Shift.start && structureProgress === 0
  const isTerminalActive = terminalMode === 'active'

  // ---- Act visibility ----
  // Act 1 扩展到 GRID_SHIFT_START(0.85)：波浪展平后需与 Act2 竖线共存形成网格，
  // Act3 开始后波浪自行通过 gridOpacityMult 淡出
  const needsAct1 = (sp: number) => sp < TIMELINE.act3Shift.start + 0.01
  const needsAct2 = (sp: number) => sp >= TIMELINE.whiteOut.start - 0.01
  const needsAct3 = (sp: number) => sp >= TIMELINE.act3Shift.start - 0.01

  // ---- syncScrollbar ----
  const syncScrollbar = useCallback(() => {
    const h = document.body.scrollHeight - window.innerHeight
    if (h > 0) window.scrollTo(0, physRef.current.target / PAGE_FLOW.end * h)
  }, [])

  // ---- ScrollTrigger (native scrollbar) ----
  useGSAP(() => {
    const updateHeight = () => { document.body.style.height = window.innerHeight * (1 + (SCROLL_VH - 1) * PAGE_FLOW.end) + 'px' }
    updateHeight()

    stRef.current = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0,
      onUpdate: (self) => {
        const progress = self.progress * PAGE_FLOW.end
        if (Math.abs(progress - physRef.current.target) < 0.0005) return
        physRef.current.lastScrollbar = performance.now()
        physRef.current.velocity = 0
        physRef.current.target = progress
        setPageProgress(progress)
      },
    })

    const resize = () => {
      const target = physRef.current.target
      updateHeight()
      stRef.current?.refresh()
      physRef.current.target = target
      setPageProgress(target)
      syncScrollbar()
    }
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); stRef.current?.kill() }
  }, [])

  // ---- GSAP physics ticker ----
  useEffect(() => {
    const ticker = () => {
      const p = physRef.current
      if (!p.active) return
      const now = performance.now()
      if (!p.lastPhysics) { p.lastPhysics = now; return }
      const dt = Math.min(0.1, (now - p.lastPhysics) / 1000)
      p.lastPhysics = now
      const dtFrames = dt * 60

      if (now - p.lastScrollbar < 80) return
      if (isClickPlaying) return

      p.target += p.velocity * dtFrames
      if (p.target <= 0) { p.target = 0; p.velocity = 0 }
      if (p.target >= PAGE_FLOW.end) { p.target = PAGE_FLOW.end; p.velocity = 0 }

      p.velocity *= Math.pow(FRICTION, dtFrames)
      if (Math.abs(p.velocity) < 0.00001) p.velocity = 0

      setPageProgress(p.target)
      syncScrollbar()
    }
    gsap.ticker.add(ticker)
    return () => { gsap.ticker.remove(ticker) }
  }, [isClickPlaying, syncScrollbar])

  // ---- wheel handler ----
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (isTerminalActive) return
    if (isAct3Focused) return
    if (isClickPlaying && clickTweenRef.current) {
      clickTweenRef.current.kill()
      scrollEffectScope.cancel('interrupt click tween')
      clickTweenRef.current = null
      setIsClickPlaying(false)
    }
    const step = e.deltaY / (window.innerHeight * SCROLL_VH) * 0.65
    physRef.current.velocity += step
    physRef.current.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, physRef.current.velocity))
  }, [isTerminalActive, isAct3Focused, isClickPlaying, scrollEffectScope])

  // 同一页面滚动时间轴；普通点击固定停在 Act 3，结构视图由继续滚动或专用按钮进入。
  const scrollToSection = useCallback((target: number) => {
    clickTweenRef.current?.kill()
    setIsClickPlaying(true)
    physRef.current.velocity = 0
    const tweenObj = { val: physRef.current.target }
    scrollEffectScope.cancel('replace click tween')
    clickTweenRef.current = scrollEffectScope.addTween(gsap.to(tweenObj, {
      val: target,
      duration: 2,
      ease: 'power2.inOut',
      onUpdate: () => {
        physRef.current.target = tweenObj.val
        setPageProgress(tweenObj.val)
        syncScrollbar()
      },
      onComplete: () => { setIsClickPlaying(false); clickTweenRef.current = null },
    }))
  }, [setPageProgress, syncScrollbar, scrollEffectScope])
  const onClick = useCallback(() => {
    if (isTerminalActive || isClickPlaying || isAct3Focused || pageProgress >= 0.995) return
    scrollToSection(PAGE_FLOW.act3Target)
  }, [isTerminalActive, isClickPlaying, isAct3Focused, pageProgress, scrollToSection])

  // ---- event listeners ----
  useEffect(() => {
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('click', onClick)
    }
  }, [onWheel, onClick])

  useEffect(() => {
    const visible = needsAct3(scrollProgress) && structureProgress === 0
    if (visible === act3VisibleRef.current) return
    act3VisibleRef.current = visible
    if (visible) {
      signalAct3('act3Mounted')
    } else {
      resetSequence('act3.entry')
      resetSequence('labelReveal')
    }
  }, [scrollProgress, structureProgress, signalAct3])

  // ---- lighthouse screenshot ----
  useEffect(() => {
    // theme 切换时清除缓存，触发重新烘焙
    lighthouseCapturedRef.current = false
  }, [themeKey])

  useEffect(() => {
    if (scrollProgress >= 0.54 && !lighthouseCapturedRef.current) {
      lighthouseCapturedRef.current = true
      const captureFn = getLighthouseCapture()
      if (captureFn) {
        const img = captureFn()
        if (img) setLighthouseImage(img)
      }
    }
  }, [scrollProgress, themeKey])

  // ---- cleanup ----
  useEffect(() => {
    return () => {
      physRef.current.active = false
      scrollEffectScope.cancel('app cleanup')
      stRef.current?.kill()
      ScrollTrigger.getAll().forEach((t: ScrollTrigger) => t.kill())
      document.body.style.height = ''
    }
  }, [scrollEffectScope])

  const sp = scrollProgress

  // ---- Terminal callbacks ----
  const handleModeChange = useCallback((m: typeof terminalMode) => {
    useScrollStore.getState().setTerminalMode(m)
  }, [])
  const handleEchoLinesChange = useCallback((lines: string[]) => {
    useScrollStore.setState({ echoLines: lines })
  }, [])
  const handleInputChange = useCallback((v: string) => {
    useScrollStore.getState().setInputValue(v)
  }, [])
  const handleCommand = useCallback((input: string) => executeCommand(input), [])
  const labelConfigs: [LabelConfig, LabelConfig, LabelConfig] = PLANET_LINKS.map(
    (link, i) => ({
      trackIdx: i as 0 | 1 | 2,
      planetLink: link,
      maxEchoLines: 2,
    }),
  ) as [LabelConfig, LabelConfig, LabelConfig]
  const handleBuildStatusLine = useCallback((sp: number) => {
    if (sp > PAGE_FLOW.structureStart) {
      const pct = Math.round(Math.max(0, Math.min(1, (sp - PAGE_FLOW.structureStart) / (PAGE_FLOW.structureEnd - PAGE_FLOW.structureStart))) * 100)
      return `# Act 4 · SystemStructure · scroll ${pct}%`
    }
    const pct = Math.round(Math.min(1, sp) * 100)
    const actName = sp < 0.45 ? 'OceanVoyage' : sp < TIMELINE.act3Shift.start ? 'GridTransition' : 'ContentPhase'
    const actNum = sp < 0.45 ? '1' : sp < TIMELINE.act3Shift.start ? '2' : '3'
    return `# Act ${actNum} · ${actName} · scroll ${pct}%`
  }, [])

  return (
    <>
      <SceneCanvas>
        <Act1OceanVoyage visible={needsAct1(sp)} />
        <Act2GridTransition visible={needsAct2(sp)} />
        <Act3ContentPhase visible={needsAct3(sp) && structureProgress < 1} />
        <Act4SystemStructure visible={structureProgress > 0} />
      </SceneCanvas>

      <MainTerminal
        mode={terminalMode}
        echoLines={echoLines}
        inputValue={inputValue}
        onModeChange={handleModeChange}
        onEchoLinesChange={handleEchoLinesChange}
        onInputValueChange={handleInputChange}
        scrollProgress={pageProgress}
        buildStatusLine={handleBuildStatusLine}
        onThemeUpdate={handleThemeUpdate}
        themeKey={themeKey}
        onCommand={handleCommand}
      />

      {/* Info Panel Terminal — 仅 Act 3 (ContentPhase) 渲染 */}
      {needsAct3(sp) && structureProgress === 0 && <InfoPanelTerminal />}

      {/* Planet Labels — 仅 Act 3 可见，组件不卸载 */}
      {needsAct3(sp) && structureProgress === 0 && (
        <FloatingLabels
          configs={labelConfigs}
          sequenceStrategy="proximity"
          staggerDelay={200}
          exitTimeout={15000}
          collapsedWidth={60}
          expandedWidth={200}
          collapsedHeight={36}
          expandedHeight={44}
          pbdParams={{
            anchorRangeRadius: 70,
            gap: 16,
          }}
        />
      )}

      {sp >= 0.995 && structureProgress === 0 && !isAct3Focused && (
        <button className="structure-next" onClick={event => { event.stopPropagation(); scrollToSection(PAGE_FLOW.structureEnd) }}>继续向下 · 系统结构 ↓</button>
      )}
      <SystemStructureOverlay progress={structureProgress} onBack={() => scrollToSection(PAGE_FLOW.act3Target)} />

      {/* 品牌标题（Act 2-3） */}
      <BrandTitle
        scrollProgress={sp}
        lighthouseImage={lighthouseImage}
        isClickPlaying={isClickPlaying}
        isFocused={isAct3Focused || structureProgress > 0}
      />

      {/* 页脚 */}
      <footer className="app-footer">
        <span>&copy; 2025 YeQuDesu · </span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">
          闽ICP备2026019172号-1
        </a>
      </footer>

      {debugMode && <CompositionPanel scrollProgress={sp} />}
    </>
  )
}
