import { describe, expect, it } from 'vitest'
import { buildParticleField, getFieldParticleState, buildFieldScans, selectScanMembers,
  CUBE_BOUND_RADIUS, FIELD_END } from '../miniatureParticleField'
import { getMiniatureTransform } from '../miniatureUniverse'
import { afterMiniature, miniatureSourceProgress } from '../../composition/transitionTiming'

describe('miniature particle field', () => {
  it('keeps 240 deterministic, unique world-space particles outside the cube', () => {
    const field = buildParticleField(123)
    expect(field).toEqual(buildParticleField(123))
    expect(field).not.toEqual(buildParticleField(124))
    expect(new Set(field.map(p => p.id)).size).toBe(240)
    for (const p of field) {
      expect(Math.hypot(...p.offset)).toBeCloseTo(p.distance)
      expect(p.distance).toBeGreaterThanOrEqual(CUBE_BOUND_RADIUS * 1.3)
      expect(p.distance).toBeLessThanOrEqual(CUBE_BOUND_RADIUS * 8)
      expect(getFieldParticleState(p, 0.5).travel).toBe(0)
    }
    expect(field.filter(p => p.distance > CUBE_BOUND_RADIUS * 5).length).toBeGreaterThan(120)
  })
  it('collapses inward in radial order and completely vanishes by 64.8%', () => {
    const field = buildParticleField(123)
    for (let i = 0; i < field.length; i++) {
      const p = field[i]
      if (i) {
        expect(p.start).toBeGreaterThanOrEqual(field[i - 1].start)
        expect(p.end).toBeGreaterThanOrEqual(field[i - 1].end)
      }
      const halfway = getFieldParticleState(p, (p.start + p.end) / 2)
      expect(halfway.travel).toBeCloseTo(0.5)
      getFieldParticleState(p, FIELD_END)
      expect(getFieldParticleState(p, (p.start + p.end) / 2)).toEqual(halfway)
      expect(getFieldParticleState(p, FIELD_END).radius).toBe(0)
    }
    expect(field[field.length - 1].end).toBe(FIELD_END)
  })
  it('schedules 16 bounded scans and deterministic local membership', () => {
    const events = buildFieldScans(123)
    expect(events).toHaveLength(16)
    for (const event of events) {
      expect(event.start).toBeGreaterThanOrEqual(0.4)
      expect(event.end).toBeLessThanOrEqual(0.5)
      expect(event.end - event.start).toBeGreaterThanOrEqual(0.014 - 1e-10)
      expect(event.end - event.start).toBeLessThanOrEqual(0.02)
    }
    for (let sp = 0.4; sp < 0.5; sp += 0.0001)
      expect(events.filter(e => sp >= e.start && sp < e.end).length).toBeLessThanOrEqual(4)
    expect(selectScanMembers([], 1)).toEqual([])
    const circles = Array.from({ length: 10 }, (_, id) => ({ id, x: id * 20, y: 0, radius: 2 }))
    expect(selectScanMembers(circles, 0)).toEqual([0, 1, 2])
  })
  it('stretches both miniature phases continuously and remaps downstream milestones once', () => {
    expect(miniatureSourceProgress(0.25)).toBe(0.25)
    expect(miniatureSourceProgress(0.5)).toBe(0.45)
    expect(miniatureSourceProgress(0.65)).toBe(0.55)
    expect(getMiniatureTransform(0.5 - 1e-8).scale).toBeCloseTo(getMiniatureTransform(0.5 + 1e-8).scale, 6)
    expect(getMiniatureTransform(0.5).whiteFillProgress).toBe(0)
    expect(getMiniatureTransform(0.65).whiteFillProgress).toBe(1)
    expect(afterMiniature(0.55)).toBe(0.65)
    expect(afterMiniature(0.85)).toBeCloseTo(0.8833333333)
    expect(afterMiniature(0.90)).toBeCloseTo(0.9222222222)
    expect(afterMiniature(1)).toBe(1)
  })
})
