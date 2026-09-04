import { describe, expect, it } from 'vitest'
import {
  ACT3_BASE_FOV,
  ACT3_MIN_FRAMING_ASPECT,
  ACT3_TERMINAL_LAYOUT,
  getAct3ResponsiveFov,
  getAct3OrbitMotionScale,
  getAct3TerminalPlanetPosition,
  getAct3VisualAlpha,
} from '../act3TerminalLayout'

describe('Act 3 terminal layout', () => {
  it('widens the vertical FOV only when portrait framing needs it', () => {
    expect(getAct3ResponsiveFov(16 / 9)).toBeCloseTo(ACT3_BASE_FOV)
    expect(getAct3ResponsiveFov(ACT3_MIN_FRAMING_ASPECT)).toBeCloseTo(ACT3_BASE_FOV)
    expect(getAct3ResponsiveFov(390 / 844)).toBeGreaterThan(60)
    expect(getAct3ResponsiveFov(390 / 844)).toBeLessThan(70)
  })

  it('keeps all three terminal planets on their declared orbit radii', () => {
    ACT3_TERMINAL_LAYOUT.planets.forEach((planet, index) => {
      const point = getAct3TerminalPlanetPosition(index)
      const distance = Math.hypot(
        point.x - ACT3_TERMINAL_LAYOUT.center.x,
        point.z - ACT3_TERMINAL_LAYOUT.center.z,
      )
      expect(distance).toBeCloseTo(planet.orbitRadius)
    })
  })

  it('crossfades at 80-85 and resumes orbit motion at 85-90', () => {
    expect(getAct3VisualAlpha(0.80)).toBe(0)
    expect(getAct3VisualAlpha(0.85)).toBe(1)
    expect(getAct3OrbitMotionScale(0.85)).toBe(0)
    expect(getAct3OrbitMotionScale(0.90)).toBe(1)
  })
})
