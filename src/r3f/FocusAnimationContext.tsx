import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createFocusChannels } from '../behaviors/useFocusTimeline'

const FocusAnimationContext = createContext<ReturnType<typeof createFocusChannels> | null>(null)

export function FocusAnimationProvider({ children }: { children: ReactNode }) {
  const channels = useMemo(createFocusChannels, [])
  return <FocusAnimationContext.Provider value={channels}>{children}</FocusAnimationContext.Provider>
}

export function useFocusAnimation() {
  const channels = useContext(FocusAnimationContext)
  if (!channels) throw new Error('FocusAnimationProvider is required for scene focus animation')
  return channels
}
