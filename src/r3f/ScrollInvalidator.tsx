import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScrollStore } from '../stores/scrollStore'
import { sceneApplyWhiteOut, WHITE_OUT_THRESHOLD, WHITE_OUT_END } from './ScrollRig'
import { _ambientLight } from '../actors/SceneLights'

/**
 * ScrollInvalidator — 桥接 Zustand scrollProgress 到 R3F 渲染循环。
 *
 * 双重职责：
 *   1. frameloop 桥接：subscribe scrollProgress → invalidate()
 *   2. 全局雾/背景更新：sceneApplyWhiteOut 必须每帧调用（不受 Act 可见性限制）
 *   3. 白化过渡环境光增强：原 whiteOutManager.js:28 逐字保留
 *
 * 援引：R3F 官方文档 "Frameloop — demand mode with external state"
 */
export default function ScrollInvalidator() {
  const { invalidate, scene } = useThree()

  // ---- Every-frame fog/background + ambient light update ----
  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    sceneApplyWhiteOut(scene, sp)

    // 白化过渡时环境光逐步增强（原 whiteOutManager.js:28）
    if (_ambientLight) {
      const wof = Math.max(0, Math.min(1, (sp - WHITE_OUT_THRESHOLD) / (WHITE_OUT_END - WHITE_OUT_THRESHOLD)))
      _ambientLight.intensity = 1.4 + wof * 3.5
    }
  })

  // ---- Frameloop bridge ----
  useEffect(() => {
    const unsub = useScrollStore.subscribe((state, prevState) => {
      if (state.scrollProgress !== prevState.scrollProgress || state.structureProgress !== prevState.structureProgress) {
        invalidate()
      }
    })
    invalidate()
    return () => { unsub() }
  }, [invalidate])

  return null
}
