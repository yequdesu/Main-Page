import { PAGE_HEIGHT_VH } from './composition/transitionTiming'
import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import SceneCanvas from './r3f/Canvas'
import Act1OceanVoyage from './acts/Act1OceanVoyage'
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
import FpsMeter from './composition/debug/FpsMeter'
import FocusHudOverlay from './actors/FocusHudOverlay'
import MiniatureParticleScan from './actors/MiniatureParticleScan'
import LusionAtmosphereOverlay from './actors/LusionAtmosphereOverlay'
import Act2SquareContourTransition from './actors/Act2SquareContourTransition'
import MiniatureAbsorptionTrails from './actors/MiniatureAbsorptionTrails'
import { registerCoreActors } from './composition/coreActors'
import { registerCoreSequences } from './composition/coreSequences'
import { resetSequence, useSignal } from './composition/sequenceStore'
import type { LabelConfig, SequenceStrategy } from './behaviors/useFloatingLabels'
import { PLANET_LINKS } from './types'
import { useDayNight } from './theme/useDayNight'
import ChargeEnergyBar from './actors/ChargeEnergyBar'
import { chargeGates, chargeFromInput, constrainChargeProgress, createWheelIntentFilter,
  publishChargeGates, resetChargeGates, tickChargeGates, settleGateProgress } from './behaviors/chargeGates'
import './theme/theme.css'
import './fonts.css'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

const SCROLL_VH = PAGE_HEIGHT_VH
const FRICTION = 0.955
const MAX_VELOCITY = 0.025
const SCROLL_PROGRESS_EPSILON = 0.000001
const SCROLL_Y_EPSILON = 0.5
const SHOW_COMPLETION_BRAND = false

/**
 * App 根组�?�?GSAP ScrollTrigger + 滚动物理 + DOM 叠加层�?
 *
 * �?App.vue 逻辑迁移：onWheel, onClick, ScrollTrigger, GSAP ticker�?
 *
 * 援引�?
 *   Codrops 2025 �?GSAP ScrollTrigger + R3F 混合
 *   @gsap/react useGSAP �?自动 cleanup
 */
export default function App() {
  useEffect(() => {
    registerCoreActors()
    registerCoreSequences()
  }, [])

  // ---- Zustand store ----
  const scrollProgress = useScrollStore(s => s.scrollProgress)
  const setScrollProgress = useScrollStore(s => s.setScrollProgress)
  const terminalMode = useScrollStore(s => s.terminalMode)
  const debugMode = useScrollStore(s => s.debugMode)
  const echoLines = useScrollStore(s => s.echoLines)
  const inputValue = useScrollStore(s => s.inputValue)
  const { handleThemeUpdate, themeKey } = useDayNight()
  const signalAct3 = useSignal('act3.entry')

  // ---- Physics state (refs �?no re-render) ----
  const physRef = useRef({ target: 0, velocity: 0, lastScrollbar: 0, lastPhysics: 0, active: true })
  const lighthouseCapturedRef = useRef(false)
  const stRef = useRef<ScrollTrigger | null>(null)
  const act3VisibleRef = useRef(false)
  const isAct3FocusedRef = useRef(false)
  const scrollbarDrag = useRef(false)
  const displayedProgress = useRef(0)
  const wheelIntent = useRef(createWheelIntentFilter())

  // ---- UI state (React �?triggers re-render) ----
  const [lighthouseImage, setLighthouseImage] = useState<string | null>(null)
  const isTerminalActive = terminalMode === 'active'


  // ---- Act visibility ----
  // The screen-space square takes over the face-on miniature at the white-fill endpoint.
  const needsAct1 = (sp: number) => sp <= TIMELINE.cubeWhiteFill.end + 0.0005
  const needsAct3Visual = (sp: number) => sp >= TIMELINE.squareTitleTyping.start - 0.001
  const needsAct3 = (sp: number) => sp >= TIMELINE.act3Shift.start - 0.001

  // ---- syncScrollbar ----
  const syncScrollbar = useCallback((targetScene = physRef.current.target) => {
    const h = document.body.scrollHeight - window.innerHeight
    if (h <= 0) return false
    const y = targetScene * h
    if (Math.abs(window.scrollY - y) < SCROLL_Y_EPSILON) return false
    window.scrollTo(0, y)
    return true
  }, [])

  // ---- ScrollTrigger (native scrollbar) ----
  useGSAP(() => {
    resetChargeGates()
    physRef.current.active = true
    document.body.style.height = window.innerHeight * SCROLL_VH + 'px'

    stRef.current = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0,
      onUpdate: (self) => {
        if (Math.abs(self.progress - displayedProgress.current) < 0.0005) return
        physRef.current.lastScrollbar = performance.now()
        physRef.current.velocity = 0
        const previous = physRef.current.target
        if (scrollbarDrag.current && chargeGates.active >= 0 && self.progress > previous) {
          chargeFromInput(chargeGates, (self.progress - previous) * window.innerHeight * (SCROLL_VH - 1), window.innerHeight, performance.now())
        }
        const next = constrainChargeProgress(chargeGates, previous, self.progress)
        physRef.current.target = next
        if (next !== self.progress) syncScrollbar(displayedProgress.current)
        publishChargeGates()
      },
    })

    return () => { stRef.current?.kill() }
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

      tickChargeGates(chargeGates, now, displayedProgress.current)
      if (chargeGates.released !== null) {
        p.target = chargeGates.released + .00001
        chargeGates.released = null
        p.velocity = 0
      }
      publishChargeGates()
      if (chargeGates.active >= 0) p.velocity = 0

      const previousTarget = p.target
      if (now - p.lastScrollbar >= 80 && p.velocity !== 0)
        p.target = constrainChargeProgress(chargeGates, previousTarget, p.target + p.velocity * dtFrames)
      if (chargeGates.active >= 0) p.velocity = 0
      if (p.target <= 0) { p.target = 0; p.velocity = 0 }
      if (p.target >= 1) { p.target = 1; p.velocity = 0 }

      p.velocity *= Math.pow(FRICTION, dtFrames)
      if (Math.abs(p.velocity) < 0.00001) p.velocity = 0

      const sceneTarget = settleGateProgress(displayedProgress.current, p.target, dt)
      displayedProgress.current = sceneTarget
      setScrollProgress(sceneTarget)
      syncScrollbar(sceneTarget)
    }
    gsap.ticker.add(ticker)
    return () => { gsap.ticker.remove(ticker) }
  }, [syncScrollbar])

  useEffect(() => {
    const syncFocusGate = (state: ReturnType<typeof useScrollStore.getState>) => {
      isAct3FocusedRef.current =
        state.focusedPlanetIdx >= 0 && state.scrollProgress >= TIMELINE.act3Shift.start
    }

    syncFocusGate(useScrollStore.getState())
    return useScrollStore.subscribe(syncFocusGate)
  }, [])

  // Physical input is separate from velocity: inertial frames never charge.
  const handleScrollInput = useCallback((delta: number, intentional = true) => {
    if (isTerminalActive) return
    if (isAct3FocusedRef.current) return
    const p = physRef.current
    if (chargeGates.active >= 0) {
      p.velocity = 0
      if (delta < 0) {
        p.target = constrainChargeProgress(chargeGates, p.target, p.target - Math.max(.0001, Math.abs(delta) / (window.innerHeight * (SCROLL_VH - 1))))
      } else if (intentional) chargeFromInput(chargeGates, delta, window.innerHeight, performance.now())
      publishChargeGates()
      return
    }
    if ((p.target <= SCROLL_PROGRESS_EPSILON && delta < 0) ||
        (p.target >= 1 - SCROLL_PROGRESS_EPSILON && delta > 0)) {
      p.velocity = 0
      return
    }
    const step = delta / (window.innerHeight * (SCROLL_VH - 1)) * (0.65 * 79 / 80)
    p.velocity += step
    p.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, p.velocity))
  }, [isTerminalActive, syncScrollbar])

  // ---- event listeners ----
  useEffect(() => {
    const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest(
      'input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], .composition-panel, .main-terminal')
    const onWheel = (event: WheelEvent) => {
      if (interactive(event.target)) return
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1)
      handleScrollInput(delta, wheelIntent.current(delta, performance.now()))
    }
    let touchY: number | null = null
    const touchStart = (event: TouchEvent) => {
      touchY = event.touches.length === 1 && !interactive(event.target) ? event.touches[0].clientY : null
    }
    const touchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return
      event.preventDefault()
      const y = event.touches[0].clientY
      handleScrollInput(touchY - y); touchY = y
    }
    const touchEnd = () => { touchY = null }
    const keyDown = (event: KeyboardEvent) => {
      if (interactive(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      const direction = event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'End' || (event.key === ' ' && !event.shiftKey) ? 1
        : event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home' || (event.key === ' ' && event.shiftKey) ? -1 : 0
      if (!direction) return
      event.preventDefault(); handleScrollInput(direction * window.innerHeight * .12)
    }
    const pointerDown = (event: PointerEvent) => { scrollbarDrag.current = event.clientX >= document.documentElement.clientWidth - 16 }
    const pointerUp = () => { scrollbarDrag.current = false }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', touchStart, { passive: true })
    window.addEventListener('touchmove', touchMove, { passive: false })
    window.addEventListener('touchend', touchEnd)
    window.addEventListener('touchcancel', touchEnd)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('blur', pointerUp)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', touchStart)
      window.removeEventListener('touchmove', touchMove)
      window.removeEventListener('touchend', touchEnd)
      window.removeEventListener('touchcancel', touchEnd)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('blur', pointerUp)
    }
  }, [handleScrollInput])

  useEffect(() => {
    const visible = needsAct3(scrollProgress)
    if (visible === act3VisibleRef.current) return
    act3VisibleRef.current = visible
    if (visible) {
      signalAct3('act3Mounted')
    } else {
      resetSequence('act3.entry')
      resetSequence('labelReveal')
    }
  }, [scrollProgress, signalAct3])

  // ---- lighthouse screenshot ----
  useEffect(() => {
    // theme 切换时清除缓存，触发重新烘焙
    lighthouseCapturedRef.current = false
  }, [themeKey])

  useEffect(() => {
    if (scrollProgress >= TIMELINE.miniatureShrink.start - 0.01 && !lighthouseCapturedRef.current) {
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
      stRef.current?.kill()
      ScrollTrigger.getAll().forEach((t: ScrollTrigger) => t.kill())
      document.body.style.height = ''
    }
  }, [])

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
    const pct = Math.round(sp * 100)
    const actName = sp < TIMELINE.act1OceanVoyage.end ? 'OceanVoyage' : sp < TIMELINE.act3Shift.start ? 'SquareTransition' : 'ContentPhase'
    const actNum = sp < TIMELINE.act1OceanVoyage.end ? '1' : sp < TIMELINE.act3Shift.start ? '2' : '3'
    return `# Act ${actNum} · ${actName} · scroll ${pct}%`
  }, [])

  return (
    <>
      <SceneCanvas>
        <Act1OceanVoyage visible={needsAct1(sp)} />
        <MiniatureAbsorptionTrails />
        <Act3ContentPhase visible={needsAct3Visual(sp)} />
      </SceneCanvas>

      <LusionAtmosphereOverlay />
      <Act2SquareContourTransition />
      <ChargeEnergyBar />

      <MainTerminal
        mode={terminalMode}
        echoLines={echoLines}
        inputValue={inputValue}
        onModeChange={handleModeChange}
        onEchoLinesChange={handleEchoLinesChange}
        onInputValueChange={handleInputChange}
        scrollProgress={sp}
        buildStatusLine={handleBuildStatusLine}
        onThemeUpdate={handleThemeUpdate}
        themeKey={themeKey}
        onCommand={handleCommand}
      />

      {/* Info Panel Terminal �?�?Act 3 (ContentPhase) 渲染 */}
      {needsAct3(sp) && <InfoPanelTerminal />}

      {/* Planet Labels �?�?Act 3 可见，组件不卸载 */}
      {needsAct3(sp) && (
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

      {/* 100% completion brand is retained behind a flag for later development. */}
      {SHOW_COMPLETION_BRAND && (
        <BrandTitle
          scrollProgress={sp}
          lighthouseImage={lighthouseImage}
          isClickPlaying={false}
        />
      )}

      {/* 聚焦 HUD 叠加�?*/}
      <FocusHudOverlay />
      <MiniatureParticleScan />

      {/* 页脚 */}
      <footer className="app-footer">
        <span>&copy; 2025 YeQuDesu · </span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">
          闽ICP�?026019172�?1
        </a>
      </footer>

      {debugMode && (
        <>
          <FpsMeter />
          <CompositionPanel scrollProgress={sp} />
        </>
      )}
    </>
  )
}
