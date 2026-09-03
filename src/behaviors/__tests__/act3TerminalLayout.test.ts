import { describe, expect, it } from 'vitest'
import {
  ACT3_TERMINAL_LAYOUT,
  getAct3OrbitMotionScale,
  getAct3TerminalPlanetPosition,
  getAct3VisualAlpha,
} from '../act3TerminalLayout'

describe('Act 3 terminal layout', () => {
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
