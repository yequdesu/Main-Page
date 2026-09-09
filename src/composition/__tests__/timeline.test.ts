import { afterMiniature, act1Progress, act1PageProgress, PRESENTATION_PACING as PACING } from '../transitionTiming'
import { describe, expect, it } from 'vitest'
import { TIMELINE, contains, direction, progress, smoothProgress } from '../timeline'

describe('composition timeline', () => {
  it('keeps core scroll ranges explicit and reversible', () => {
    expect(TIMELINE.act1OceanVoyage).toMatchObject({ start: 0, end: act1Progress(0.70), reversible: true })
    expect(TIMELINE.act2SquareTransition).toMatchObject({ start: afterMiniature(0.55), end: afterMiniature(PACING.act3SourceStart), reversible: true })
    expect(TIMELINE.act3ContentPhase).toMatchObject({ start: afterMiniature(PACING.act3SourceStart), end: 1.0, reversible: true })
    expect(TIMELINE.miniatureShrink).toMatchObject({ start: act1Progress(0.25), end: act1Progress(0.70), reversible: true })
    expect(TIMELINE.cubeDrawAndTumble).toMatchObject({ start: act1Progress(0.25), end: act1Progress(0.50), reversible: true })
    expect(TIMELINE.cubeAbsorptionTrails).toMatchObject({ start: act1Progress(0.25), end: act1Progress(0.70), reversible: true })
    expect(TIMELINE.cubeWhiteFill).toMatchObject({ start: act1Progress(0.50), end: act1Progress(0.70), reversible: true })
    expect(TIMELINE.squareSeedShrink).toMatchObject({ start: afterMiniature(0.55), end: afterMiniature(0.56), reversible: true })
    expect(TIMELINE.squareBfsWave).toMatchObject({ start: afterMiniature(0.56), end: afterMiniature(0.70), reversible: true })
    expect(TIMELINE.squareCircleMorph).toMatchObject({ start: afterMiniature(0.65), end: afterMiniature(0.665), reversible: true })
    expect(TIMELINE.squareTitleTyping).toMatchObject({ start: afterMiniature(0.58), end: afterMiniature(0.64), reversible: true })
    expect(TIMELINE.squareContourZoom).toMatchObject({ start: afterMiniature(0.70), end: afterMiniature(0.80), reversible: true })
    expect(TIMELINE.squarePlanetFlights).toMatchObject({ start: afterMiniature(0.70), end: afterMiniature(0.80), reversible: true })
    expect(TIMELINE.squareOrbitFlights).toMatchObject({ start: afterMiniature(PACING.orbitSourceStart), end: afterMiniature(PACING.orbitSourceEnd), reversible: true })
    expect(TIMELINE.squareTitleFade).toMatchObject({ start: afterMiniature(0.665), end: afterMiniature(0.745), reversible: true })
    expect(TIMELINE.squareAct3Crossfade).toMatchObject({ start: afterMiniature(PACING.crossfadeSourceStart), end: afterMiniature(PACING.act3SourceStart), reversible: true })
    expect(TIMELINE.act3OrbitResume).toMatchObject({ start: afterMiniature(PACING.act3SourceStart), end: afterMiniature(PACING.orbitResumeSourceEnd), reversible: true })
    expect(TIMELINE.act2ThemeReveal).toMatchObject({ start: afterMiniature(0.55), end: afterMiniature(0.63), reversible: true })
    expect(TIMELINE.orbitLineReveal).toMatchObject({ start: TIMELINE.squareAct3Crossfade.start, end: TIMELINE.squareAct3Crossfade.end, reversible: true })
    expect(TIMELINE.orbitGlow).toMatchObject({ start: afterMiniature(0.94), end: 1.0, reversible: true })
  })

  it('computes clamped progress without side effects', () => {
    expect(progress('miniatureShrink', act1Progress(0.20))).toBe(0)
    expect(progress('miniatureShrink', act1Progress(0.25))).toBe(0)
    expect(progress('miniatureShrink', act1PageProgress(act1Progress(0.475)))).toBeCloseTo(0.5)
    expect(progress('miniatureShrink', act1Progress(0.70))).toBe(1)
    expect(progress('miniatureShrink', act1Progress(0.80))).toBe(1)
    expect(smoothProgress('miniatureShrink', act1PageProgress(act1Progress(0.475)))).toBeCloseTo(0.5)
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
