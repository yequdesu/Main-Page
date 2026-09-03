import { describe, expect, it } from 'vitest'
import {
  bellDistanceProgress,
  bellSpeed,
  createMotionPath,
  getCircleConnector,
  getMotionTrailFrame,
  pointAtPathProgress,
  smootherstep,
  type MotionTrailConfig,
} from '../../behaviors/motionTrail'

const config: MotionTrailConfig = {
  width: 1280,
  height: 720,
  duration: 4,
  finalRadius: 36,
  trailSpacing: 8,
  shrinkRate: 24,
  waypointCount: 4,
  randomness: 0.52,
}

const start = { x: 180, y: 520 }
const end = { x: 1080, y: 220 }

describe('motion trail model', () => {
  it('uses smooth monotonic radius and bell-shaped travel curves', () => {
    expect(bellDistanceProgress(0)).toBe(0)
    expect(bellDistanceProgress(1)).toBe(1)
    expect(bellSpeed(0)).toBeCloseTo(0)
    expect(bellSpeed(0.5)).toBeCloseTo(2)
    expect(bellSpeed(1)).toBeCloseTo(0)
    expect(smootherstep(0)).toBe(0)
    expect(smootherstep(1)).toBe(1)

    let previousTravel = 0
    let previousRadius = 0
    for (let i = 0; i <= 100; i += 1) {
      const t = i / 100
      const travel = bellDistanceProgress(t)
      const radius = smootherstep(t)
      expect(travel).toBeGreaterThanOrEqual(previousTravel)
      expect(radius).toBeGreaterThanOrEqual(previousRadius)
      previousTravel = travel
      previousRadius = radius
    }
  })

  it('builds a deterministic bounded path with exact endpoints', () => {
    const first = createMotionPath(start, end, config, 12345)
    const second = createMotionPath(start, end, config, 12345)
    const other = createMotionPath(start, end, config, 54321)

    expect(first).toEqual(second)
    expect(first.controlPoints).not.toEqual(other.controlPoints)
    expect(pointAtPathProgress(first, 0)).toEqual(start)
    expect(pointAtPathProgress(first, 1).x).toBeCloseTo(end.x, 6)
    expect(pointAtPathProgress(first, 1).y).toBeCloseTo(end.y, 6)
    for (const sample of first.samples) {
      expect(sample.point.x).toBeGreaterThanOrEqual(46)
      expect(sample.point.x).toBeLessThanOrEqual(config.width - 46)
      expect(sample.point.y).toBeGreaterThanOrEqual(46)
      expect(sample.point.y).toBeLessThanOrEqual(config.height - 46)
    }
  })

  it('starts near zero at A and finishes at full size at B', () => {
    const path = createMotionPath(start, end, config, 91)
    const initial = getMotionTrailFrame(path, config, 0)
    const final = getMotionTrailFrame(path, config, config.duration)

    expect(initial.main.point).toEqual(start)
    expect(initial.main.radius).toBe(0)
    expect(initial.speed).toBeCloseTo(0)
    expect(final.main.point.x).toBeCloseTo(end.x, 6)
    expect(final.main.point.y).toBeCloseTo(end.y, 6)
    expect(final.main.radius).toBe(config.finalRadius)
    expect(final.speed).toBeCloseTo(0)
  })

  it('keeps emitted circles fixed while their radius shrinks without alpha state', () => {
    const path = createMotionPath(start, end, config, 18)
    const earlier = getMotionTrailFrame(path, config, 2.7)
    const later = getMotionTrailFrame(path, config, 2.8)
    const shared = earlier.trail.find((circle) => later.trail.some((candidate) => candidate.id === circle.id))
    expect(shared).toBeDefined()
    const laterCircle = later.trail.find((circle) => circle.id === shared!.id)!

    expect(laterCircle.point).toEqual(shared!.point)
    expect(laterCircle.emittedRadius).toBe(shared!.emittedRadius)
    expect(laterCircle.radius).toBeCloseTo(shared!.radius - config.shrinkRate * 0.1, 5)
    expect('alpha' in laterCircle).toBe(false)
  })

  it('is independent of render frame cadence and fills every distance interval', () => {
    const path = createMotionPath(start, end, config, 2026)
    const direct = getMotionTrailFrame(path, config, 2.25)
    getMotionTrailFrame(path, config, 0.1)
    getMotionTrailFrame(path, config, 0.9)
    getMotionTrailFrame(path, config, 1.7)
    const stepped = getMotionTrailFrame(path, config, 2.25)

    expect(stepped).toEqual(direct)
    for (let i = 1; i < direct.trail.length; i += 1) {
      expect(direct.trail[i].id).toBeGreaterThan(direct.trail[i - 1].id)
    }
  })

  it('connects adjacent circles along their external common tangents', () => {
    const equal = getCircleConnector(
      { point: { x: 0, y: 0 }, radius: 3 },
      { point: { x: 10, y: 0 }, radius: 3 },
    )
    expect(equal).toEqual({
      firstPositive: { x: 0, y: 3 },
      secondPositive: { x: 10, y: 3 },
      secondNegative: { x: 10, y: -3 },
      firstNegative: { x: 0, y: -3 },
    })

    const tapered = getCircleConnector(
      { point: { x: 0, y: 0 }, radius: 5 },
      { point: { x: 12, y: 0 }, radius: 2 },
    )!
    expect(Math.hypot(tapered.firstPositive.x, tapered.firstPositive.y)).toBeCloseTo(5)
    expect(Math.hypot(tapered.secondPositive.x - 12, tapered.secondPositive.y)).toBeCloseTo(2)

    expect(getCircleConnector(
      { point: { x: 0, y: 0 }, radius: 8 },
      { point: { x: 2, y: 0 }, radius: 2 },
    )).toBeNull()
  })
})
