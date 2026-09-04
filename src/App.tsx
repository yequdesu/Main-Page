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
import FocusInversionBlocks from './actors/FocusInversionBlocks'
import FocusInversionDebugPanel from './composition/debug/FocusInversionDebugPanel'
import LusionAtmosphereOverlay from './actors/LusionAtmosphereOverlay'
import Act2SquareContourTransition from './actors/Act2SquareContourTransition'
import MiniatureAbsorptionTrails from './actors/MiniatureAbsorptionTrails'
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

const SCROLL_VH = 80
const FRICTION = 0.955
const MAX_VELOCITY = 0.025
const SCROLL_PROGRESS_EPSILON = 0.000001
const SCROLL_Y_EPSILON = 0.5

const RAW_ACT1_END = 0.30
const RAW_ACT2_END = 0.70
const SCENE_ACT1_END = TIMELINE.act1OceanVoyage.end
const SCENE_ACT2_END = TIMELINE.act2SquareTransition.end

function lerpRange(value: number, inStart: number, inEnd: number, outStart: number, outEnd: number): number {
  const t = Math.max(0, Math.min(1, (value - inStart) / (inEnd - inStart)))
  return outStart + (outEnd - outStart) * t
}

function rawToSceneProgress(raw: number): number {
  if (raw <= RAW_ACT1_END) {
    return lerpRange(raw, 0, RAW_ACT1_END, 0, SCENE_ACT1_END)
  }
  if (raw <= RAW_ACT2_END) {
    return lerpRange(raw, RAW_ACT1_END, RAW_ACT2_END, SCENE_ACT1_END, SCENE_ACT2_END)
  }
  return lerpRange(raw, RAW_ACT2_END, 1, SCENE_ACT2_END, 1)
}

function sceneToRawProgress(scene: number): number {
  if (scene <= SCENE_ACT1_END) {
    return lerpRange(scene, 0, SCENE_ACT1_END, 0, RAW_ACT1_END)
  }
  if (scene <= SCENE_ACT2_END) {
    return lerpRange(scene, SCENE_ACT1_END, SCENE_ACT2_END, RAW_ACT1_END, RAW_ACT2_END)
  }
  return lerpRange(scene, SCENE_ACT2_END, 1, RAW_ACT2_END, 1)
}

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
  const scrollEffectScope = useEffectScope('appScroll')
  const signalAct3 = useSignal('act3.entry')

  // ---- Physics state (refs �?no re-render) ----
  const physRef = useRef({ target: 0, velocity: 0, lastScrollbar: 0, lastPhysics: 0, active: true })
  const clickTweenRef = useRef<gsap.core.Tween | null>(null)
  const lighthouseCapturedRef = useRef(false)
  const stRef = useRef<ScrollTrigger | null>(null)
  const act3VisibleRef = useRef(false)
  const isAct3FocusedRef = useRef(false)
  const scrollProgressRef = useRef(0)

  // ---- UI state (React �?triggers re-render) ----
  const [isClickPlaying, setIsClickPlaying] = useState(false)
  const [lighthouseImage, setLighthouseImage] = useState<string | null>(null)
  const isTerminalActive = terminalMode === 'active'

  scrollProgressRef.current = scrollProgress

  // ---- Act visibility ----
  // The screen-space square takes over the face-on miniature at exactly 55%.
  const needsAct1 = (sp: number) => sp <= TIMELINE.cubeWhiteFill.end + 0.0005
  const needsAct3Visual = (sp: number) => sp >= TIMELINE.squareTitleTyping.start - 0.001
  const needsAct3 = (sp: number) => sp >= TIMELINE.act3Shift.start - 0.001

  // ---- syncScrollbar ----
  const syncScrollbar = useCallback((targetScene = rawToSceneProgress(physRef.current.target)) => {
    const h = document.body.scrollHeight - window.innerHeight
    if (h <= 0) return false
    const y = sceneToRawProgress(targetScene) * h
    if (Math.abs(window.scrollY - y) < SCROLL_Y_EPSILON) return false
    window.scrollTo(0, y)
    return true
  }, [])

  // ---- ScrollTrigger (native scrollbar) ----
  useGSAP(() => {
    document.body.style.height = window.innerHeight * SCROLL_VH + 'px'

    stRef.current = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0,
      onUpdate: (self) => {
        if (Math.abs(self.progress - physRef.current.target) < 0.0005) return
        physRef.current.lastScrollbar = performance.now()
        physRef.current.velocity = 0
        physRef.current.target = self.progress
        setScrollProgress(rawToSceneProgress(self.progress))
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

      if (now - p.lastScrollbar < 80) return
      if (isClickPlaying) return
      if (p.velocity === 0) return

      const previousTarget = p.target
      p.target += p.velocity * dtFrames
      if (p.target <= 0) { p.target = 0; p.velocity = 0 }
      if (p.target >= 1) { p.target = 1; p.velocity = 0 }

      p.velocity *= Math.pow(FRICTION, dtFrames)
      if (Math.abs(p.velocity) < 0.00001) p.velocity = 0

      const targetChanged = Math.abs(p.target - previousTarget) > SCROLL_PROGRESS_EPSILON
      if (!targetChanged && p.velocity === 0) return

      const sceneTarget = rawToSceneProgress(p.target)
      setScrollProgress(sceneTarget)
      syncScrollbar(sceneTarget)
    }
    gsap.ticker.add(ticker)
    return () => { gsap.ticker.remove(ticker) }
  }, [isClickPlaying, syncScrollbar])

  useEffect(() => {
    const syncFocusGate = (state: ReturnType<typeof useScrollStore.getState>) => {
      isAct3FocusedRef.current =
        state.focusedPlanetIdx >= 0 && state.scrollProgress >= TIMELINE.act3Shift.start
    }

    syncFocusGate(useScrollStore.getState())
    return useScrollStore.subscribe(syncFocusGate)
  }, [])

  // ---- wheel handler ----
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    if (isTerminalActive) return
    if (isAct3FocusedRef.current) return
    if (isClickPlaying && clickTweenRef.current) {
      clickTweenRef.current.kill()
      scrollEffectScope.cancel('interrupt click tween')
      clickTweenRef.current = null
      setIsClickPlaying(false)
    }
    const p = physRef.current
    if ((p.target <= SCROLL_PROGRESS_EPSILON && e.deltaY < 0) ||
        (p.target >= 1 - SCROLL_PROGRESS_EPSILON && e.deltaY > 0)) {
      p.velocity = 0
      return
    }
    const step = e.deltaY / (window.innerHeight * SCROLL_VH) * 0.65
    p.velocity += step
    p.velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, p.velocity))
  }, [isTerminalActive, isClickPlaying, scrollEffectScope])

  // ---- click fast-forward ----
  const onClick = useCallback(() => {
    if (isTerminalActive) return
    if (isClickPlaying) return
    if (isAct3FocusedRef.current) return  // block fast-forward during planet focus
    if (scrollProgressRef.current >= 0.995) return
    setIsClickPlaying(true)
    physRef.current.velocity = 0

    const tweenObj = { val: physRef.current.target }
    scrollEffectScope.cancel('replace click tween')
    clickTweenRef.current = scrollEffectScope.addTween(gsap.to(tweenObj, {
      val: 1.0,
      duration: 2,
      ease: 'power2.inOut',
      onUpdate: () => {
        physRef.current.target = tweenObj.val
        const sceneTarget = rawToSceneProgress(tweenObj.val)
        setScrollProgress(sceneTarget)
        syncScrollbar(sceneTarget)
      },
      onComplete: () => {
        setIsClickPlaying(false)
        clickTweenRef.current = null
      },
    }))
  }, [isTerminalActive, isClickPlaying, setScrollProgress, syncScrollbar, scrollEffectScope])

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

      {/* 品牌标题（Act 2-3�?*/}
      <BrandTitle
        scrollProgress={sp}
        lighthouseImage={lighthouseImage}
        isClickPlaying={isClickPlaying}
      />

      {/* 聚焦 HUD 叠加�?*/}
      <FocusHudOverlay />
      <FocusInversionBlocks />

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
          <FocusInversionDebugPanel />
        </>
      )}
    </>
  )
}
