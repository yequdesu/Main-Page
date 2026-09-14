import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createStellarTransitionState } from '../behaviors/stellarTransition'

// 独立 Actor 测试/预览默认处于 Act 3；只有 Act4StellarTransition 写入 Provider 的实例。
const StellarTransitionContext = createContext(createStellarTransitionState())
export function StellarTransitionProvider({ children }: { children: ReactNode }) {
  const channels = useMemo(createStellarTransitionState, [])
  return <StellarTransitionContext.Provider value={channels}>{children}</StellarTransitionContext.Provider>
}
export const useStellarTransition = () => useContext(StellarTransitionContext)
