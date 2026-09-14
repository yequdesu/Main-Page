import { useEffect } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import { PAGE_FLOW } from '../types'

/** 业务入口只发出请求；App 持有唯一页面补间和滚动条同步，不在 Actor/终端中写进度。 */
export function useMenuNavigation(scrollToSection: (target: number) => void, cancelPagePlayback?: () => void) {
  useEffect(() => {
    return useScrollStore.subscribe((state, previous) => {
      if (state.focusEvent !== previous.focusEvent && state.focusEvent
        && (state.focusEvent.type !== 'exit' || state.focusEvent.reason === 'manual')) cancelPagePlayback?.()
      if (state.navigationEvent !== previous.navigationEvent && state.navigationEvent?.target === 'menu') {
        if (state.structureProgress >= 1) return
        if (state.focusedVoyager || state.focusedPlanetIdx >= 0) {
          state.clearFocus('menu')
        }
        scrollToSection(PAGE_FLOW.structureEnd)
      }
    })
  }, [scrollToSection, cancelPagePlayback])
}
