import { describe, it, expect } from 'vitest'
import { toward } from '../toward'

describe('toward', () => {
  it('moves toward target', () => {
    expect(toward(0, 10, 0.5)).toBe(5)
  })
  it('asymptotically approaches target', () => {
    let v = 0
    for (let i = 0; i < 100; i++) v = toward(v, 1, 0.1)
    expect(v).toBeCloseTo(1, 2)
  })
})
