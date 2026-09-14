import { describe, expect, it } from 'vitest'
import { gsap } from 'gsap'
import { PerspectiveCamera, Vector3 } from 'three'
import { CENTRAL_STAR_CORE_RADIUS } from '../../actors/assets/centralStar'
import { createCameraFocusController } from '../useCameraFocus'
import { createFocusChannels } from '../useFocusTimeline'
import { getStructureLayout, STRUCTURE_LAYOUT } from '../structureLayout'
import { createStellarTransitionPose, createStellarTransitionState, createStellarTransitionTimeline, sampleStellarTransition, stellarArrival, STELLAR_TRANSITION } from '../stellarTransition'

describe('Act 4 恒星转场', () => {
  it('真实暂停 Timeline 保留既有阶段，跨阶段跳转与反向 seek 无状态残留，释放后停止写入', () => {
    const before = gsap.globalTimeline.getChildren().length
    const state = createStellarTransitionState(), controller = createStellarTransitionTimeline(state)
    try {
      expect(controller.timeline).toBeInstanceOf(gsap.core.Timeline)
      expect(controller.timeline.paused()).toBe(true)
      expect(controller.timeline.duration()).toBeCloseTo(6.8)
      expect(controller.timeline.labels['stellar:approach']).toBe(0)
      expect(controller.timeline.labels['stellar:reframe']).toBeCloseTo(0.42 * 6.8)
      expect(controller.timeline.labels['menu:ready']).toBeCloseTo(6.8)
      for (const p of [1, 0.9, 0.77, 0.42, 0.35, 0.25, 0.04, 0, 0.84, 0.18, 1, 0]) {
        controller.seek(p)
        expect(state).toEqual(sampleStellarTransition(p, createStellarTransitionState()))
        expect(controller.timeline.time()).toBeCloseTo(p * 6.8)
      }
      controller.seek(0.86)
      const frozen = structuredClone(state)
      controller.dispose(); controller.seek(1)
      expect(state).toEqual(frozen)
    } finally { controller.dispose() }
    expect(gsap.globalTimeline.getChildren().length).toBe(before)
  })

  it('先拉近后重构图，行星在末段依次进入，直接跳转及往返不依赖历史', () => {
    const state = createStellarTransitionState()
    sampleStellarTransition(0.42, state)
    expect(state.zoom).toBe(1)
    expect(state.reframe).toBe(0)
    expect(state.activity).toBe(1)
    expect(state.radiation).toBe(0)
    expect(state.planets).toEqual([0, 0, 0])
    for (const [i, start] of STELLAR_TRANSITION.planetStarts.entries()) {
      sampleStellarTransition(start + 0.001, state)
      expect(state.reframe).toBeGreaterThan(0.85)
      expect(state.planets[i]).toBeGreaterThan(0)
      state.planets.slice(i + 1).forEach(value => expect(value).toBe(0))
    }
    for (const p of [1, 0.74, 0.41, 0, 0.9, 1, 0.2]) {
      expect(sampleStellarTransition(p, state)).toEqual(sampleStellarTransition(p, createStellarTransitionState()))
    }
    sampleStellarTransition(1, state)
    expect(state.planets).toEqual([1, 1, 1])
    expect(state.activity).toBe(1)
    expect(state.overlay).toBe(1)
  })

  it('日面活动在拉近中逐渐显现，背景微光等待最终构图；回退对称且端点精确', () => {
    const sample = (p: number) => sampleStellarTransition(p, createStellarTransitionState())
    expect(sample(0).activity).toBe(0)
    expect(sample(0.18).activity).toBeCloseTo(0.5)
    expect(sample(0.32).activity).toBe(1)
    expect(sample(0.32).zoom).toBeLessThan(1)
    expect(sample(0.32).radiation).toBe(0)
    expect(sample(0.86).radiation).toBeCloseTo(0.5)
    expect(sample(0.25).activityDetail).toBe(0)
    expect(sample(0.35).activityDetail).toBeCloseTo(0.5)
    expect(sample(0.45).activityDetail).toBe(1)
    expect(sample(0.65).activityDetail).toBe(1)
  })

  it('弹簧入场有较高初速、有限回弹和静止终点', () => {
    expect(stellarArrival(0)).toBe(0)
    expect(stellarArrival(1)).toBe(1)
    expect(stellarArrival(0.05)).toBeGreaterThan(0.18)
    const samples = Array.from({ length: 1001 }, (_, i) => stellarArrival(i / 1000))
    expect(Math.max(...samples)).toBeGreaterThan(1)
    expect(Math.max(...samples)).toBeLessThan(1.02)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0)
    expect(Math.abs((stellarArrival(1) - stellarArrival(0.9999)) / 0.0001)).toBeLessThan(0.001)
  })

  it.each([16 / 9, 390 / 844, 844 / 390])('视口 %s：镜头留在球外，同一恒星连续放大并抵达最终切圆', aspect => {
    const camera = new PerspectiveCamera(40, aspect), update = createCameraFocusController()
    const focus = createFocusChannels(), state = createStellarTransitionState(), sample = createStellarTransitionPose()
    const layout = getStructureLayout(aspect)
    let lastRadius = 0
    const previousStar = new Vector3(0, -1, -16), previousCamera = new Vector3(0, 0.25, 8)
    for (let i = 0; i <= 1000; i++) {
      sampleStellarTransition(i / 1000, state)
      update(camera, focus, null, 1, 0, state)
      const pose = sample(state, aspect), radius = CENTRAL_STAR_CORE_RADIUS * pose.scale
      const distance = camera.position.distanceTo(pose.star)
      expect(distance).toBeGreaterThan(radius + camera.near)
      expect(pose.star.distanceTo(previousStar)).toBeLessThan(0.7)
      expect(camera.position.distanceTo(previousCamera)).toBeLessThan(0.7)
      if (i / 1000 <= 0.42) {
        const angularRadius = Math.asin(radius / distance)
        expect(angularRadius).toBeGreaterThanOrEqual(lastRadius - 1e-9)
        lastRadius = angularRadius
      }
      previousStar.copy(pose.star); previousCamera.copy(camera.position)
    }
    const end = sample(state, aspect)
    expect(end.star.distanceTo(new Vector3(layout.sunX, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.planeZ))).toBeLessThan(1e-9)
    expect(end.scale * CENTRAL_STAR_CORE_RADIUS).toBeCloseTo(layout.sunRadius)
    expect(camera.position.distanceTo(new Vector3(0, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.cameraZ))).toBeLessThan(1e-9)
    expect(end.structureScale).toBeCloseTo(1)
    expect(camera.layers.mask).toBe(2)
    sampleStellarTransition(0, state)
    update(camera, focus, null, 1, 0, state)
    expect(camera.position.distanceTo(new Vector3(0, 0.25, 8))).toBeLessThan(1e-9)
    expect(camera.layers.mask).toBe(1)
  })
})
