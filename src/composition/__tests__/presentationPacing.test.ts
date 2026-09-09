import { describe, expect, it } from 'vitest'
import { act1AnimationProgress, act1PageProgress, act1Progress, PAGE_DISTANCE_SCALE, PAGE_HEIGHT_VH, miniatureSourceProgress } from '../transitionTiming'
import { TIMELINE, progress, smoothProgress } from '../timeline'
import { getMiniatureTransform } from '../../behaviors/miniatureUniverse'
import { buildParticleField, FIELD_END, getFieldParticleState } from '../../behaviors/miniatureParticleField'
import { getSquareContourTransitionFrame, ORBIT_TRACE_TIMINGS, PLANET_FLIGHT_TIMINGS } from '../../behaviors/act2SquareContourTransition'
import { getAct3VisualAlpha } from '../../behaviors/act3TerminalLayout'

describe('presentation pacing', () => {
  it('leaves page distance, Act1 milestones and downstream progress unchanged', () => {
    expect(PAGE_HEIGHT_VH).toBeCloseTo(151.1)
    for (const p of [0, act1Progress(.25), act1Progress(.5), act1Progress(.7), .8, 1]) {
      expect(act1AnimationProgress(p)).toBeCloseTo(p, 12)
    }
    let previous = -1
    for (let i = 0; i <= 1000; i++) {
      const p = i / 1000, clock = act1AnimationProgress(p)
      expect(clock).toBeGreaterThanOrEqual(previous)
      expect(act1PageProgress(clock)).toBeCloseTo(p, 10)
      expect(act1AnimationProgress(p)).toBe(clock)
      previous = clock
    }
    expect(getMiniatureTransform(.14).scale).toBeGreaterThan(.85)
    expect(getMiniatureTransform(.15).scale).toBeGreaterThan(.65)
  })

  it('uses the same clock for scale, rotation, drawing, whitening, scans and collapse history', () => {
    const field = buildParticleField(19)
    for (const page of [.14, .18, .24, .27, .31, .36]) {
      const clock = act1AnimationProgress(page), transform = getMiniatureTransform(page)
      const source = miniatureSourceProgress(clock)
      const shrink = Math.max(0, Math.min(1, (source - .25) / .30)) ** .68
      expect(transform.scale).toBeCloseTo(10 ** (-1.6875 * shrink), 12)
      expect(transform.wireDrawProgress).toBeCloseTo(smoothProgress('cubeDrawAndTumble', page))
      expect(transform.whiteFillProgress).toBeCloseTo(smoothProgress('cubeWhiteFill', page))
      const t = progress('cubeDrawAndTumble', page)
      expect(transform.rotation[1]).toBeCloseTo(2 * Math.PI * .32 * t ** 3 * (t * (6 * t - 15) + 10))
      const historyPage = act1PageProgress(clock)
      expect(getMiniatureTransform(historyPage).scale).toBeCloseTo(transform.scale, 10)
    }
    const last = field[field.length - 1]
    const clearPage = act1PageProgress(act1Progress(FIELD_END))
    expect(getFieldParticleState(last, act1AnimationProgress(clearPage) * PAGE_DISTANCE_SCALE).radius).toBeCloseTo(0)
    expect(clearPage).toBeLessThan(TIMELINE.cubeWhiteFill.end)
    expect(act1AnimationProgress(TIMELINE.cubeParticleScan.end) * PAGE_DISTANCE_SCALE).toBeCloseTo(FIELD_END - .04)
  })

  it('holds the finished title and white system, then hands off with complementary alpha', () => {
    expect(TIMELINE.squareTitleFade.start - TIMELINE.squareTitleTyping.end).toBeCloseTo(.035)
    const titleHold = getSquareContourTransitionFrame(TIMELINE.squareTitleTyping.end + .02, 1200, 800)
    expect(titleHold.titleWriteProgress).toBe(1)
    expect(titleHold.titleAlpha).toBe(1)
    expect(ORBIT_TRACE_TIMINGS[0].start).toBeGreaterThan(PLANET_FLIGHT_TIMINGS[0].start + .08)
    for (let i = 1; i < ORBIT_TRACE_TIMINGS.length; i++) {
      expect(ORBIT_TRACE_TIMINGS[i].start - ORBIT_TRACE_TIMINGS[i-1].start).toBeCloseTo(.007 * 1.2 / .45 / 1.9)
    }
    expect(TIMELINE.squareAct3Crossfade.start).toBeGreaterThan(ORBIT_TRACE_TIMINGS[5].end + .02)
    expect(TIMELINE.squareAct3Crossfade.end).toBe(TIMELINE.act3ContentPhase.start)
    for (const t of [0, .2, .5, .8, 1, .5, 0]) {
      const p = TIMELINE.squareAct3Crossfade.start + t * (TIMELINE.squareAct3Crossfade.end - TIMELINE.squareAct3Crossfade.start)
      expect(getSquareContourTransitionFrame(p, 1200, 800).contourAlpha + getAct3VisualAlpha(p)).toBeCloseTo(1)
    }
    expect(TIMELINE.act3OrbitResume.end).toBeLessThan(1)
  })
})
