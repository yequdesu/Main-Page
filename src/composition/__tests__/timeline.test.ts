import { afterMiniature } from '../transitionTiming'
import { describe, expect, it } from 'vitest'
import { TIMELINE, contains, direction, progress, smoothProgress } from '../timeline'

describe('composition timeline', () => {
  it('keeps core scroll ranges explicit and reversible', () => {
    expect(TIMELINE.act1OceanVoyage).toMatchObject({ start: 0, end: 0.65, reversible: true })
    expect(TIMELINE.act2SquareTransition).toMatchObject({ start: afterMiniature(0.55), end: afterMiniature(0.85), reversible: true })
    expect(TIMELINE.act3ContentPhase).toMatchObject({ start: afterMiniature(0.85), end: 1.0, reversible: true })
    expect(TIMELINE.miniatureShrink).toMatchObject({ start: 0.25, end: 0.65, reversible: true })
    expect(TIMELINE.cubeDrawAndTumble).toMatchObject({ start: 0.25, end: 0.50, reversible: true })
    expect(TIMELINE.cubeAbsorptionTrails).toMatchObject({ start: 0.25, end: 0.65, reversible: true })
    expect(TIMELINE.cubeWhiteFill).toMatchObject({ start: 0.50, end: 0.65, reversible: true })
    expect(TIMELINE.squareSeedShrink).toMatchObject({ start: afterMiniature(0.55), end: afterMiniature(0.56), reversible: true })
    expect(TIMELINE.squareBfsWave).toMatchObject({ start: afterMiniature(0.56), end: afterMiniature(0.70), reversible: true })
    expect(TIMELINE.squareCircleMorph).toMatchObject({ start: afterMiniature(0.65), end: afterMiniature(0.665), reversible: true })
    expect(TIMELINE.squareTitleTyping).toMatchObject({ start: afterMiniature(0.58), end: afterMiniature(0.64), reversible: true })
    expect(TIMELINE.squareContourZoom).toMatchObject({ start: afterMiniature(0.70), end: afterMiniature(0.80), reversible: true })
    expect(TIMELINE.squarePlanetFlights).toMatchObject({ start: afterMiniature(0.70), end: afterMiniature(0.80), reversible: true })
    expect(TIMELINE.squareOrbitFlights).toMatchObject({ start: afterMiniature(0.725), end: afterMiniature(0.80), reversible: true })
    expect(TIMELINE.squareTitleFade).toMatchObject({ start: afterMiniature(0.64), end: afterMiniature(0.72), reversible: true })
    expect(TIMELINE.squareAct3Crossfade).toMatchObject({ start: afterMiniature(0.80), end: afterMiniature(0.85), reversible: true })
    expect(TIMELINE.act3OrbitResume).toMatchObject({ start: afterMiniature(0.85), end: afterMiniature(0.90), reversible: true })
    expect(TIMELINE.act2ThemeReveal).toMatchObject({ start: afterMiniature(0.55), end: afterMiniature(0.63), reversible: true })
    expect(TIMELINE.orbitLineReveal).toMatchObject({ start: afterMiniature(0.80), end: afterMiniature(0.85), reversible: true })
    expect(TIMELINE.orbitGlow).toMatchObject({ start: afterMiniature(0.94), end: 1.0, reversible: true })
  })

  it('computes clamped progress without side effects', () => {
    expect(progress('miniatureShrink', 0.20)).toBe(0)
    expect(progress('miniatureShrink', 0.25)).toBe(0)
    expect(progress('miniatureShrink', 0.45)).toBeCloseTo(0.5)
    expect(progress('miniatureShrink', 0.65)).toBe(1)
    expect(progress('miniatureShrink', 0.80)).toBe(1)
    expect(smoothProgress('miniatureShrink', 0.45)).toBeCloseTo(0.5)
  })

  it('reports containment and scroll direction', () => {
    expect(contains('act1OceanVoyage', 0.20)).toBe(true)
    expect(contains('act2SquareTransition', 0.70)).toBe(true)
    expect(contains('act2SquareTransition', 0.95)).toBe(false)
    expect(direction(0.1, 0.2)).toBe('forward')
    expect(direction(0.2, 0.1)).toBe('backward')
    expect(direction(0.2, 0.2)).toBe('still')
  })
})
