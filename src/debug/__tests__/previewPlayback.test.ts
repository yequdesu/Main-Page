import { expect, it } from 'vitest'
import { createPreviewPlayback } from '../previewPlayback'

it('暂停不累计时间，恢复和变速连续，停止归零', () => {
  let now = 100
  const playback = createPreviewPlayback(() => now)
  const playing = { clip: '光晕呼吸', playing: true, speed: 1 }
  now = 120
  expect(playback.time()).toBe(0)
  playback.configure(playing)
  now = 125
  expect(playback.time()).toBe(5)
  playback.configure({ ...playing, playing: false })
  now = 200
  expect(playback.time()).toBe(5)
  playback.configure({ ...playing, speed: 2 })
  now = 203
  expect(playback.time()).toBe(11)
  playback.configure(playing)
  now = 205
  expect(playback.time()).toBe(13)
  playback.configure({ ...playing, clip: '', playing: false })
  expect(playback.time()).toBe(0)
})

it('多个视口读取同一时刻不会重复累加动画时间', () => {
  let now = 0
  const playback = createPreviewPlayback(() => now)
  playback.configure({ clip: '光晕呼吸', playing: true, speed: 1 })
  now = 3
  expect(Array.from({ length: 4 }, () => playback.time())).toEqual([3, 3, 3, 3])
})
