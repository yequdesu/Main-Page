import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScrollStore } from '../stores/scrollStore'
import { sceneApplyWhiteOut } from './ScrollRig'

/**
 * ScrollInvalidator — 桥接 Zustand scrollProgress 到 R3F 渲染循环。
 *
 * 双重职责：
 *   1. frameloop 桥接：subscribe scrollProgress → invalidate()
 *   2. 全局雾/背景更新：sceneApplyWhiteOut 必须每帧调用（不受 Act 可见性限制）
 *
 * 援引：R3F 官方文档 "Frameloop — demand mode with external state"
 */
export default function ScrollInvalidator() {
  const { invalidate, scene } = useThree()

  // ---- Every-frame fog/background update ----
  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    sceneApplyWhiteOut(scene, sp)
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

  return null
}
