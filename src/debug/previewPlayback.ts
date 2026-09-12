import type { AnimationState } from './studioTypes'

/** 一个模型会话共用一个时钟，避免多视口按帧累加时间造成速度差异。 */
export function createPreviewPlayback(now = () => performance.now() / 1000) {
  let elapsed = 0
  let anchor = now()
  let state: AnimationState = { clip: '', playing: false, speed: 1 }
  function time() {
    return elapsed + (state.clip && state.playing ? (now() - anchor) * state.speed : 0)
  }
  return {
    time,
    configure(next: AnimationState) {
      elapsed = next.clip ? time() : 0
      anchor = now()
      state = next
    },
  }
}
