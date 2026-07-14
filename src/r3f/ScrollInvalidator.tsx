import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScrollStore } from '../stores/scrollStore'
import { sceneApplyWhiteOut } from './ScrollRig'
import { _ambientLight } from '../actors/SceneLights'
import { TIMELINE } from '../composition/timeline'
import { useAnchorStore } from '../composition/anchorStore'
import { touchActorFrame } from '../composition/actorRuntime'

const CONTINUOUS_INVALIDATE_MIN_DELTA = 1000 / 240

function hasTimeDrivenWebgl(sp: number, focusedPlanetIdx: number): boolean {
  return (
    focusedPlanetIdx >= 0 ||
    sp < TIMELINE.whiteOut.end ||
    sp < TIMELINE.wavesAct3Fade.end ||
    sp >= TIMELINE.planetVisible.start
  )
}

/**
 * ScrollInvalidator �?桥接 Zustand scrollProgress �?R3F 渲染循环�?
 *
 * 双重职责�?
 *   1. frameloop 桥接：subscribe scrollProgress �?invalidate()
 *   2. 全局背景更新：sceneApplyWhiteOut 必须每帧调用（不受 Act 可见性限制）
 *   3. 保持场景灯光稳定；转场的局部灰度由 beam sweep 后处理负责
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
    sceneApplyWhiteOut(scene, sp)
    touchActorFrame('sceneBackground', frameId, true)

    // The sweep is a screen-local effect. Do not brighten the whole scene
    // while it expands, otherwise the mask reads as a full-screen white-out.
    if (_ambientLight) {
      _ambientLight.intensity = 1.4
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
