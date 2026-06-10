import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useScrollStore } from '../stores/scrollStore'

/**
 * ScrollInvalidator — 桥接 Zustand scrollProgress 变更到 R3F 渲染循环。
 *
 * frameloop: 'demand' 模式下，R3F 仅在 invalidate() 被调用时渲染一帧。
 * 此组件订阅 scrollProgress，每次变化时触发 invalidate()，
 * 驱动所有 Act/Actor 的 useFrame 执行。
 *
 * 援引：R3F 官方文档 "Frameloop — demand mode with external state"
 */
export default function ScrollInvalidator() {
  const { invalidate } = useThree()

  useEffect(() => {
    // Zustand v5: subscribe(callback) with (state, prevState)
    const unsub = useScrollStore.subscribe((state, prevState) => {
      if (state.scrollProgress !== prevState.scrollProgress) {
        invalidate()
      }
    })

    // 初始触发一帧，确保场景在加载后有至少一次渲染
    invalidate()

    return () => {
      unsub()
    }
  }, [invalidate])

  return null
}
