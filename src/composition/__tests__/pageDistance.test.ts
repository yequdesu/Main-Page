import { expect, it } from 'vitest'
import { act1Progress, afterMiniature, PAGE_HEIGHT_VH, previousPageProgress } from '../transitionTiming'

it('preserves Act1 distances and doubles downstream distances with linear page progress', () => {
  const distance = PAGE_HEIGHT_VH - 1
  for (const p of [0, 0.25, 0.4, 0.5, 0.658, 0.698, 0.7]) {
    expect(act1Progress(p) * distance).toBeCloseTo(p * 79)
    expect(previousPageProgress(act1Progress(p))).toBeCloseTo(p)
  }
  const boundary = afterMiniature(0.55)
  const act3 = afterMiniature(0.85)
  expect((act3 - boundary) * distance).toBeCloseTo(0.2 * 79 * 2)
  expect((1 - act3) * distance).toBeCloseTo(0.1 * 79 * 2)
  expect(afterMiniature(1)).toBe(1)
})
