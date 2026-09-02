import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScrollStore } from '../stores/scrollStore'
import { sceneApplyThemeTransition } from './ScrollRig'
import { _ambientLight } from '../actors/SceneLights'
import { progress, TIMELINE } from '../composition/timeline'
import { useAnchorStore } from '../composition/anchorStore'
import { touchActorFrame } from '../composition/actorRuntime'

const CONTINUOUS_INVALIDATE_MIN_DELTA = 1000 / 240

function hasTimeDrivenWebgl(sp: number, focusedPlanetIdx: number): boolean {
  return (
    focusedPlanetIdx >= 0 ||
    sp < TIMELINE.miniatureShrink.end ||
    sp < TIMELINE.wavesAct3Fade.end ||
    sp >= TIMELINE.planetVisible.start
  )
}

/**
 * ScrollInvalidator �?桥接 Zustand scrollProgress �?R3F 渲染循环�?
 *
 * 双重职责�?
 *   1. frameloop 桥接：subscribe scrollProgress �?invalidate()
 *   2. 全局背景更新：微缩宇宙消失后再恢复 Act 2 主题。
 *   3. Act 2 环境光随主题恢复区间增强。
 *
 * 援引：R3F 官方文档 "Frameloop �?demand mode with external state"
 */
export default function ScrollInvalidator() {
  const { invalidate, scene } = useThree()
  const frameIdRef = useRef(0)
  const lastContinuousInvalidateRef = useRef(0)

  // ---- Every-frame fog/background + ambient light update ----
  useFrame(() => {
    const frameId = ++frameIdRef.current
    ;(window as any).__WEBGL_FRAME_COUNT__ = ((window as any).__WEBGL_FRAME_COUNT__ ?? 0) + 1
    useAnchorStore.getState().setFrameId(frameId)
    const sp = useScrollStore.getState().scrollProgress
    sceneApplyThemeTransition(scene, sp)
    touchActorFrame('sceneBackground', frameId, true)

    // The miniature remains in the original night lighting; Act 2 brightens afterwards.
    if (_ambientLight) {
      const themeProgress = progress('act2ThemeReveal', sp)
      _ambientLight.intensity = 1.4 + themeProgress * 3.5
    }
  })

  // ---- Frameloop bridge ----
  useEffect(() => {
    const unsub = useScrollStore.subscribe((state, prevState) => {
      if (state.scrollProgress !== prevState.scrollProgress) {
        invalidate()
      }
    })
    invalidate()
    return () => { unsub() }
  }, [invalidate])

  useEffect(() => {
    let raf = 0

    const loop = (now: number) => {
      const store = useScrollStore.getState()
      if (
        !document.hidden &&
        hasTimeDrivenWebgl(store.scrollProgress, store.focusedPlanetIdx) &&
        now - lastContinuousInvalidateRef.current >= CONTINUOUS_INVALIDATE_MIN_DELTA
      ) {
        lastContinuousInvalidateRef.current = now
        invalidate()
      }
      raf = window.requestAnimationFrame(loop)
    }

    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [invalidate])

  return null
}
