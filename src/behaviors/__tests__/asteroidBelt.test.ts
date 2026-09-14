import { afterEach, describe, expect, it } from 'vitest'
import { ASTEROID_BELT, ASTEROID_ENTRY_VISUAL, createAsteroidOrbits, createAsteroidBeltController, sampleAsteroidOrbit, sampleAsteroidEntry, updateBeltScene } from '../asteroidBelt'
import { SCROLL_RIG } from '../../types'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()))
function setup(seed = 470) {
  const orbits = createAsteroidOrbits(ASTEROID_BELT.count, seed)
  const controller = createAsteroidBeltController(orbits)
  cleanups.push(() => controller.dispose())
  const starts = orbits.map(o => sampleAsteroidEntry(o, point()))
  const advance = (seconds: number, fps = 60) => {
    for (let i = 0; i < Math.round(seconds * fps); i++) controller.advance(1 / fps)
  }
  return { orbits, controller, starts, advance }
}
const point = () => ({ x: 0, y: 0, z: 0 })

describe('小行星带轨道与事件入场', () => {
  it('同种子可复现，主体窄带与 约 3% 离群轨道长期保持在两颗行星之间', () => {
    const orbits = createAsteroidOrbits()
    expect(createAsteroidOrbits()).toEqual(orbits)
    expect(createAsteroidOrbits(ASTEROID_BELT.count, 790)).not.toEqual(orbits)
    expect(orbits.filter(o => o.outlier)).toHaveLength(10)
    const p = point()
    for (const orbit of orbits) for (let k = 0; k < 360; k++) {
      sampleAsteroidOrbit(orbit, k * Math.PI / 180, p)
      const r = Math.hypot(p.x, p.z - SCROLL_RIG.SCENE_CENTER_Z)
      expect(r).toBeGreaterThan(6.6)
      expect(r).toBeLessThan(7.8)
      if (!orbit.outlier) {
        expect(Math.abs(r - ASTEROID_BELT.radius)).toBeLessThan(0.19)
        expect(Math.abs(p.y + 1)).toBeLessThan(0.06)
      }
      expect(orbit.speed).toBeLessThan(0)
      if (orbit.outlier) {
        const factor = orbit.speed / (ASTEROID_BELT.cruiseSpeed * (ASTEROID_BELT.radius / orbit.radius) ** 1.5)
        expect(factor).toBeGreaterThanOrEqual(1.3)
        expect(factor).toBeLessThanOrEqual(1.6)
      }
    }
  })

  it('继承实际位置，高速收拢完成后才制动，最终全环分布且持续公转', () => {
    const { orbits, controller, starts, advance } = setup()
    controller.dispatch('enter', starts)
    starts.forEach((start, i) => {
      const p = controller.sample(i, point())
      expect(p.x).toBeCloseTo(start.x, 10)
      expect(p.y).toBeCloseTo(start.y, 10)
      expect(p.z).toBeCloseTo(start.z, 10)
    })
    advance(0.6)
    controller.channels.forEach(c => {
      expect(c.speed).toBeLessThan(-1.2)
      expect(c.gather).toBeGreaterThan(0)
      expect(c.gather).toBeLessThan(1)
    })
    advance(0.4)
    controller.channels.forEach(c => expect(c.gather).toBe(1))
    advance(4)
    expect(controller.forming).toBe(false)
    const p = point()
    controller.channels.forEach((c, i) => {
      expect(c.speed).toBeCloseTo(orbits[i].speed, 5)
      controller.sample(i, p)
      expect(Math.hypot(p.x, p.z + 16)).toBeGreaterThan(6.6)
    })
    const angles = controller.channels.map(c => c.angle)
    advance(10)
    controller.channels.forEach((c, i) => expect(c.angle - angles[i]).toBeCloseTo(orbits[i].speed * 10, 4))
  })

  it('高亮覆盖高速收拢与成环停留，制动末段平滑回落；重入与 Menu 往返不闪亮', () => {
    const { controller, starts, advance } = setup()
    const prepared = controller.visual.highlight
    expect(prepared).toBeGreaterThan(0)
    controller.dispatch('enter', starts)
    expect(controller.visual.highlight).toBe(prepared)
    advance(0.075, 120)
    expect(controller.visual.highlight).toBeGreaterThan(prepared)
    expect(controller.visual.highlight).toBeLessThan(1)
    advance(0.075, 120)
    expect(controller.visual.highlight).toBe(1)
    advance(1.25)
    expect(controller.visual.highlight).toBe(1)
    controller.channels.forEach(c => expect(c.gather).toBe(1))
    advance(0.8)
    expect(controller.visual.highlight).toBeGreaterThan(0)
    expect(controller.visual.highlight).toBeLessThan(1)
    advance(0.8)
    expect(controller.visual.highlight).toBe(0)
    for (const sp of [0.939, 1, 1.42, 1]) updateBeltScene(controller, sp, false, starts)
    expect(controller.visual.highlight).toBe(0)
    controller.dispatch('reset')
    expect(controller.visual.highlight).toBe(ASTEROID_ENTRY_VISUAL.preparedHighlight)
    controller.dispatch('enter', starts)
    advance(0.6)
    expect(controller.visual.highlight).toBe(1)
    controller.dispose()
    const stopped = controller.visual.highlight
    advance(5)
    expect(controller.visual.highlight).toBe(stopped)
  })

  it.each([470, 790, 126])('种子 %i：准备、高速与制动全程覆盖四周，不形成单侧团块', seed => {
    const { controller, starts, advance } = setup(seed)
    controller.dispatch('enter', starts)
    const p = point()
    for (let step = 0; step <= 40; step++) {
      const bins = Array(8).fill(0)
      let mx = 0, mz = 0
      controller.channels.forEach((_, i) => {
        controller.sample(i, p)
        const angle = (Math.atan2(p.z + 16, p.x) + Math.PI * 2) % (Math.PI * 2)
        bins[Math.floor(angle / (Math.PI / 4))]++
        mx += Math.cos(angle); mz += Math.sin(angle)
      })
      expect(Math.min(...bins)).toBeGreaterThan(18)
      expect(Math.max(...bins)).toBeLessThan(62)
      expect(Math.hypot(mx, mz) / starts.length).toBeLessThan(0.07)
      advance(0.1)
    }
  })

  it('最宽主环带在最大聚焦与悬停包络之外留有间隔，包含卫星整圈和最外行星环', () => {
    const maximumRadius = (scaleMult: number, envelope: number) => 0.015 * 1.2 * 0.7 * 4 * scaleMult * 22 / 5 * 1.35 * 0.6 * envelope
    const innerEdge = (ASTEROID_BELT.radius - ASTEROID_BELT.radialSpread) * (1 - 0.006)
    const outerEdge = (ASTEROID_BELT.radius + ASTEROID_BELT.radialSpread) * (1 + 0.006)
    expect(innerEdge - SCROLL_RIG.ORBIT_RADII[1] - maximumRadius(2.6, 2.78)).toBeGreaterThan(0.2)
    expect(SCROLL_RIG.ORBIT_RADII[2] - outerEdge - maximumRadius(2.8, 2.94)).toBeGreaterThan(0.1)
  })

  it.each([30, 60, 120])('%i fps 下同一时间达到同一轨道与相位', fps => {
    const reference = setup(), actual = setup()
    reference.controller.dispatch('enter', reference.starts)
    actual.controller.dispatch('enter', actual.starts)
    reference.advance(5, 120)
    actual.advance(5, fps)
    actual.controller.channels.forEach((c, i) => expect(c.angle).toBeCloseTo(reference.controller.channels[i].angle, 5))
  })

  it('聚焦中途接管不重置位置/速度，随后迅速进入巡航', () => {
    const { controller, starts, advance, orbits } = setup()
    controller.dispatch('enter', starts)
    advance(0.65)
    const highlightBefore = controller.visual.highlight
    const before = controller.channels.map((c, i) => ({ angle: c.angle, speed: c.speed, p: controller.sample(i, point()) }))
    controller.dispatch('focus')
    expect(controller.visual.highlight).toBe(highlightBefore)
    before.forEach((b, i) => {
      expect(controller.channels[i].angle).toBe(b.angle)
      expect(controller.channels[i].speed).toBe(b.speed)
      expect(controller.sample(i, point())).toEqual(b.p)
    })
    advance(0.1)
    expect(controller.visual.highlight).toBeGreaterThan(0)
    expect(controller.visual.highlight).toBeLessThan(highlightBefore)
    controller.dispatch('focus') // 连续读取聚焦状态不重复重启减速。
    advance(1)
    expect(controller.visual.highlight).toBe(0)
    expect(controller.forming).toBe(false)
    controller.channels.forEach((c, i) => {
      expect(c.gather).toBe(1)
      expect(c.speed).toBeCloseTo(orbits[i].speed, 5)
      expect(c.angle).toBeLessThan(before[i].angle)
    })
  })

  it('边界抖动和 Menu 往返不重播，深度回退重新入场，释放后停止推进', () => {
    const { controller, starts, advance } = setup()
    expect(updateBeltScene(controller, 0.9, false, starts)).toBe(0)
    expect(updateBeltScene(controller, 1, false, starts)).toBe(1)
    advance(5)
    const angle = controller.channels[0].angle
    for (const sp of [0.939, 0.95, 1, 1.42, 1]) updateBeltScene(controller, sp, false, starts)
    expect(controller.channels[0].angle).toBe(angle)
    expect(controller.forming).toBe(false)
    expect(updateBeltScene(controller, 0.75, false, starts)).toBe(0)
    expect(controller.active).toBe(false)
    updateBeltScene(controller, 1, false, starts)
    expect(controller.forming).toBe(true)
    controller.dispose()
    const frozen = controller.channels[0].angle
    advance(5)
    controller.dispatch('enter', starts)
    expect(controller.channels[0].angle).toBe(frozen)
    expect(controller.active).toBe(false)
  })
})
