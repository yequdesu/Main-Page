import type { FocusEvent } from '../types'
import { gsap } from 'gsap'
import { FOCUS_TIMEOUT } from '../r3f/ScrollRig'

export const FOCUS_TIMING = {
  camera: 1.8,
  align: 4,
  speed: 0.65,
  orbitFade: 2.4,
  settle: 0.7,
  returnMin: 1.6,
  returnExtraSpeed: 2.8,
} as const
export type { FocusEvent } from '../types'

export function createFocusChannels() {
  return {
    revision: 0,
    mode: 'idle' as 'idle' | 'focus' | 'exit',
    track: -1,
    camera: 0,
    elapsed: 0,
    align: 0,
    settle: 0,
    returns: [0, 0, 0],
    orbitFocus: 0,
    orbitVisibility: [1, 1, 1, 1],
  }
}
export type FocusChannels = ReturnType<typeof createFocusChannels>

interface FocusTimelineActions {
  focus(track: number): void
  exit(settleDuration: number): readonly number[]
  timeout(): void
}

/** GSAP 负责所有阶段进度；R3F 统一推进播放头，避免两个时钟分别写入场景。 */
export function createFocusTimeline(channels: FocusChannels, actions: FocusTimelineActions) {
  let timeline: gsap.core.Timeline | null = null
  let disposed = false
  let revision = channels.revision
  const replace = () => {
    timeline?.kill()
    channels.revision = ++revision
    channels.camera = 0
    channels.elapsed = 0
    const token = revision
    timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    return { tl: timeline, valid: () => !disposed && token === revision }
  }
  return {
    dispatch(event: FocusEvent, track = -1) {
      if (disposed) return
      if (event.type === 'focus') {
        if (!Number.isInteger(track) || track < 0 || track > 2) return
        const { tl, valid } = replace()
        channels.mode = 'focus'
        channels.track = track
        channels.align = 0
        channels.settle = 0
        channels.returns.fill(0)
        actions.focus(track)
        tl.addLabel('focus:start', 0)
          .to(channels, { camera: 1, duration: FOCUS_TIMING.camera, ease: 'power2.inOut' }, 'focus:start')
          .to(channels, { align: 1, duration: FOCUS_TIMING.align }, 'focus:start')
          .to(channels, { elapsed: FOCUS_TIMEOUT, duration: FOCUS_TIMEOUT }, 'focus:start')
          .to(channels, { orbitFocus: 1, duration: FOCUS_TIMING.orbitFade, ease: 'power2.out' }, 'focus:start')
          .addLabel('focus:hold', FOCUS_TIMING.align)
          .call(() => { if (valid()) actions.timeout() }, [], FOCUS_TIMEOUT)
          .addLabel('focus:timeout', FOCUS_TIMEOUT)
        for (let i = 0; i < 4; i++) tl.to(channels.orbitVisibility, {
          [i]: i === 3 ? 0.12 : i === track ? 0.45 : 0.18,
          duration: FOCUS_TIMING.orbitFade, ease: 'power2.out',
        }, 'focus:start')
      } else {
        if (channels.mode !== 'focus') return
        const { tl, valid } = replace()
        channels.mode = 'exit'
        channels.settle = 0
        channels.returns.fill(0)
        const durations = actions.exit(FOCUS_TIMING.settle)
        tl.addLabel('exit:start', 0)
          .to(channels, { camera: 1, duration: FOCUS_TIMING.camera, ease: 'power2.inOut' }, 'exit:start')
          .to(channels, { settle: 1, duration: FOCUS_TIMING.settle }, 'exit:start')
          .to(channels, { orbitFocus: 0, duration: FOCUS_TIMING.orbitFade, ease: 'power2.out' }, 'exit:start')
          .addLabel('exit:return', FOCUS_TIMING.settle)
        for (let i = 0; i < 4; i++) tl.to(channels.orbitVisibility, {
          [i]: 1, duration: FOCUS_TIMING.orbitFade, ease: 'power2.out',
        }, 'exit:start')
        durations.forEach((duration, i) => tl.to(channels.returns, { [i]: 1, duration }, 'exit:return'))
        tl.addLabel('exit:complete', tl.duration())
          .call(() => { if (valid()) channels.mode = 'idle' }, [], 'exit:complete')
      }
    },
    advance(delta: number) {
      if (!disposed && timeline) timeline.totalTime(timeline.totalTime() + Math.min(0.1, Math.max(0, delta)), false)
    },
    dispose() {
      disposed = true
      revision++
      timeline?.kill()
      timeline = null
    },
  }
}
