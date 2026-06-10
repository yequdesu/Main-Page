import { useRef, useCallback } from 'react'

/**
 * 帧缓存守卫 — 同帧同参数跳过更新。
 *
 * 当前 LighthouseScene.vue 中散落 4 组 _lastXxxTime/_lastXxxSp，
 * 统一为此 hook。
 *
 * 援引：R3F Performance Pitfalls — 一致性守卫模式
 */
export function useFrameCache() {
  const lastTimeRef = useRef(-1)
  const lastSpRef = useRef(-1)

  /** 返回 true = 跳过（同帧同参数已更新过） */
  const shouldSkip = useCallback((time: number, sp: number): boolean => {
    if (time === lastTimeRef.current && sp === lastSpRef.current) {
      return true
    }
    lastTimeRef.current = time
    lastSpRef.current = sp
    return false
  }, [])

  /** 仅检查 sp（用于不依赖 time 的动画，如网格线） */
  const shouldSkipSp = useCallback((sp: number): boolean => {
    if (sp === lastSpRef.current) return true
    lastSpRef.current = sp
    return false
  }, [])

  return { shouldSkip, shouldSkipSp }
}
