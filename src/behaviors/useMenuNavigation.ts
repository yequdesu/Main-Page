import { useEffect } from 'react'
import { useScrollStore } from '../stores/scrollStore'
import { PAGE_FLOW } from '../types'

/** 业务入口只发出请求；App 持有唯一页面补间和滚动条同步，不在 Actor/终端中写进度。 */
export function useMenuNavigation(scrollToSection: (target: number) => void) {
  useEffect(() => {
    let handingOff = false
    return useScrollStore.subscribe((state, previous) => {
      if (state.navigationEvent !== previous.navigationEvent && state.navigationEvent?.target === 'menu') {
        if (state.structureProgress >= 1) return
        if (state.focusedVoyager || state.focusedPlanetIdx >= 0) {
          handingOff = true
          state.clearFocus('menu')
        }
        scrollToSection(PAGE_FLOW.structureEnd)
      }
      if (!handingOff) return
      if (state.structureProgress >= 1 || (state.focusEvent !== previous.focusEvent
        && (state.focusEvent?.type !== 'exit' || state.focusEvent.reason !== 'menu'))) {
        handingOff = false
      } else if (state.pageProgress < previous.pageProgress && state.pageProgress <= PAGE_FLOW.structureStart) {
        // 中途反向回到 Act 3（含尚未开始拉近时），从实际镜头平滑恢复全景。
        handingOff = false
        state.clearFocus('scene')
      }
    })
  }, [scrollToSection])
}
