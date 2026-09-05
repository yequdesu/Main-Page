import { describe, expect, it } from 'vitest'
import { getPixelOrbitRevealFrame } from '../pixelOrbitReveal'

describe('pixel orbit reveal', () => {
  it('expands before contracting and finishes before the strict ring handoff', () => {
    expect(getPixelOrbitRevealFrame(0).expansion).toBe(0)
    expect(getPixelOrbitRevealFrame(.5).expansion).toBe(1)
    expect(getPixelOrbitRevealFrame(.5).collapse).toBe(0)
    expect(getPixelOrbitRevealFrame(1).collapse).toBe(1)
    expect(getPixelOrbitRevealFrame(1).pixelSize).toBe(1)
  })
  it('is independent of playback order', () => {
    const frame = getPixelOrbitRevealFrame(.8)
    getPixelOrbitRevealFrame(1)
    expect(getPixelOrbitRevealFrame(.8)).toEqual(frame)
    expect(frame.pixelSize).toBeLessThan(getPixelOrbitRevealFrame(.3).pixelSize)
  })
})
