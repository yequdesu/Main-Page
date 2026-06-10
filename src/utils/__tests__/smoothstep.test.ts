import { describe, it, expect } from 'vitest'
import { smoothstep } from '../smoothstep'

describe('smoothstep', () => {
  it('returns 0 at t=0', () => expect(smoothstep(0)).toBe(0))
  it('returns 1 at t=1', () => expect(smoothstep(1)).toBe(1))
  it('returns 0.5 at t=0.5', () => expect(smoothstep(0.5)).toBe(0.5))
  it('is symmetric: smoothstep(t) + smoothstep(1-t) = 1', () => {
    expect(smoothstep(0.3) + smoothstep(0.7)).toBeCloseTo(1)
  })
})
