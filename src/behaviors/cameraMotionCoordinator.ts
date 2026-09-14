import { PAGE_FLOW, type FocusEvent } from '../types'
import { createFocusTimeline, type FocusChannels, type FocusTimelineActions } from './useFocusTimeline'
import { createStellarTransitionTimeline, type StellarTransitionState } from './stellarTransition'

/** 每个 Canvas 一个协调器。构造时不创建动画，注册者负责配对释放，兼容 StrictMode。 */
export function createCameraMotionCoordinator(focus: FocusChannels, stellar: StellarTransitionState) {
  let focusTimeline: ReturnType<typeof createFocusTimeline> | null = null
  let stellarTimeline: ReturnType<typeof createStellarTransitionTimeline> | null = null
  let onReturn: (() => void) | null = null
  let handoff = false
  let previousPage: number | null = null
  const dispatch = (event: FocusEvent, track = -1) => {
    if (!focusTimeline) return false
    // 转场期间不让新的入焦或旧超时夺回相机；反向取消使用 scene 退出。
    if (stellar.progress > 0 && event.type !== 'exit') return false
    if ((handoff || stellar.progress > 0) && event.type === 'exit' && (event.reason === 'timeout' || event.reason === 'manual')) return false
    if (handoff && event.type === 'exit' && event.reason === 'menu') return false
    const revision = focus.revision
    focusTimeline.dispatch(event, track)
    if (focus.revision === revision) return false
    handoff = event.type === 'exit' && event.reason === 'menu'
    return true
  }
  return {
    dispatch,
    attachFocus(actions: FocusTimelineActions, returnToScene: () => void) {
      focusTimeline?.dispose()
      const controller = focusTimeline = createFocusTimeline(focus, actions)
      onReturn = returnToScene
      handoff = false
      previousPage = null
      return () => {
        controller.dispose()
        if (focusTimeline === controller) { focusTimeline = null; onReturn = null; handoff = false }
      }
    },
    attachStellar() {
      stellarTimeline?.dispose()
      const controller = stellarTimeline = createStellarTransitionTimeline(stellar)
      return () => { controller.dispose(); if (stellarTimeline === controller) stellarTimeline = null }
    },
    seekStellar(progress: number) { stellarTimeline?.seek(progress) },
    advanceFocus(delta: number, page: number) {
      if (handoff && previousPage !== null && page < previousPage && page <= PAGE_FLOW.structureStart) {
        dispatch({ type: 'exit', reason: 'scene' })
        onReturn?.()
      }
      if (stellar.progress >= 1) handoff = false
      previousPage = page
      focusTimeline?.advance(delta)
      // Act 3 已完全淡出后恢复远景尺寸，保证从 Menu 返回时不会残留缩小状态。
      if (stellar.orbitOpacity === 0 && focus.mode !== 'focus') focus.planetScale = 1
    },
    get owner() {
      return handoff || stellar.progress > 0 ? 'stellar' : focus.mode === 'focus' ? 'focus' : focus.mode === 'exit' ? 'return' : 'global'
    },
  }
}
