import { useCallback, useMemo } from 'react'
import { useScrollStore } from '../stores/scrollStore'

// ============================================================
// useTerminalActivation — terminal bar 激活控制 hook
//
// 职责：
//   - 暴露声明式接口给父组件（App.tsx）
//   - 父组件无需直接触碰 terminalMode / setTerminalMode
//   - `/` 键激活逻辑封装在 hook 内
//
// 用法：
//   const { onKeyDown, activate, isActive } = useTerminalActivation()
//   useEffect(() => {
//     window.addEventListener('keydown', onKeyDown)
//     return () => window.removeEventListener('keydown', onKeyDown)
//   }, [onKeyDown])
//
// 援引：
//   React useCallback — 稳定引用避免 effect 重建
//   Zustand getState() — 非响应式读取，不触发 re-render
// ============================================================

export interface TerminalActivationAPI {
  /** spread 到父组件 keydown listener 的处理器 */
  onKeyDown: (e: KeyboardEvent) => void
  /** 程序式激活（备用） */
  activate: () => void
  /** terminal 是否处于 active 状态 */
  isActive: boolean
}

export function useTerminalActivation(): TerminalActivationAPI {
  // 响应式订阅 — React re-render on change
  const isActive = useScrollStore((s) => s.terminalMode === 'active')

  const activate = useCallback(() => {
    const s = useScrollStore.getState()
    if (s.terminalMode === 'idle') {
      s.setTerminalMode('active')
    }
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === '/') {
        e.preventDefault()
        activate()
      }
    },
    [activate]
  )

  return useMemo(() => ({ onKeyDown, activate, isActive }), [onKeyDown, activate, isActive])
}
