import { describe, expect, it } from 'vitest'
import { TIMELINE, contains, direction, progress, smoothProgress } from '../timeline'

describe('composition timeline', () => {
  it('keeps core scroll ranges explicit and reversible', () => {
    expect(TIMELINE.act1OceanVoyage).toMatchObject({ start: 0, end: 0.45, reversible: true })
    expect(TIMELINE.act2GridTransition).toMatchObject({ start: 0.45, end: 0.85, reversible: true })
    expect(TIMELINE.act3ContentPhase).toMatchObject({ start: 0.85, end: 1.0, reversible: true })
    expect(TIMELINE.whiteOut).toMatchObject({ start: 0.40, end: 0.55, reversible: true })
    expect(TIMELINE.wavesCascade).toMatchObject({ start: 0.24, end: 0.72, reversible: true })
    expect(TIMELINE.gridExtend).toMatchObject({ start: 0.60, end: 0.85, reversible: true })
    expect(TIMELINE.gridRetract).toMatchObject({ start: 0.85, end: 0.95, reversible: true })
    expect(TIMELINE.orbitGlow).toMatchObject({ start: 0.94, end: 1.0, reversible: true })
  })

  it('computes clamped progress without side effects', () => {
    expect(progress('whiteOut', 0.20)).toBe(0)
    expect(progress('whiteOut', 0.40)).toBe(0)
    expect(progress('whiteOut', 0.475)).toBeCloseTo(0.5)
    expect(progress('whiteOut', 0.55)).toBe(1)
    expect(progress('whiteOut', 0.80)).toBe(1)
    expect(smoothProgress('whiteOut', 0.475)).toBeCloseTo(0.5)
  })

  it('reports containment and scroll direction', () => {
    expect(contains('act1OceanVoyage', 0.20)).toBe(true)
    expect(contains('gridExtend', 0.70)).toBe(true)
    expect(contains('gridExtend', 0.95)).toBe(false)
    expect(direction(0.1, 0.2)).toBe('forward')
    expect(direction(0.2, 0.1)).toBe('backward')
    expect(direction(0.2, 0.2)).toBe('still')
  })
})
