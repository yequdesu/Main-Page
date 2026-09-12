import { afterEach, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import { createRingedPlanetAsset, PLANET_RING } from '../assets/ringedPlanet'
import { createPlanetHaloTexture } from '../assets/planet'
import { PLANET_ORBIT_SPEEDS } from '../../types'

afterEach(() => vi.restoreAllMocks())

it('公转 0.7 周自转 180 度，1.4 周回到初态；自转轴、环面倾角和中心保持不变', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
  const texture = createPlanetHaloTexture()
  const asset = createRingedPlanetAsset(2, texture)
  const speed = PLANET_ORBIT_SPEEDS[2]
  const orbitPeriod = 2 * Math.PI / Math.abs(speed)
  const tilt = PLANET_RING.tiltDegrees * Math.PI / 180
  const axis = new Vector3(Math.sin(tilt), Math.cos(tilt), 0)
  const rings = [asset.innerRing, asset.ring, asset.outerRing, asset.outermostRing]
  try {
    asset.core.position.set(2, 3, 4)
    asset.updateAppearance(0, 2, 20, 1, 1, 2)
    asset.updateSpin(0, speed)
    const start = asset.core.quaternion.clone()
    asset.updateSpin(orbitPeriod * 0.7, speed)
    expect(asset.core.quaternion.angleTo(start)).toBeCloseTo(Math.PI)
    expect(new Vector3(0, 1, 0).applyQuaternion(asset.core.quaternion).distanceTo(axis)).toBeLessThan(1e-9)
    expect(asset.ring.quaternion.y).toBeLessThan(0) // 与正常公转同向。
    for (const ring of rings) {
      expect(axis.clone().applyQuaternion(ring.quaternion).distanceTo(axis)).toBeLessThan(1e-9)
      expect(ring.position.toArray()).toEqual([2, 3, 4])
      expect(ring.scale.x).toBe(20)
    }
    asset.updateSpin(orbitPeriod * 1.4, speed)
    expect(asset.core.quaternion.angleTo(start)).toBeLessThan(1e-7)
    const end = asset.core.quaternion.clone()
    // 绝对时间采样不累加误差，反复调用与切回场景都不额外推进自转。
    asset.updateSpin(orbitPeriod * 1.4, speed)
    expect(asset.core.quaternion.equals(end)).toBe(true)
    expect(asset.core.position.toArray()).toEqual([2, 3, 4])
  } finally { asset.dispose(); texture.dispose() }
})

it('开启进动后四层环朝向改变、倾角和中心不变，核心沿用原自转；重复采样不累积', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
  const texture = createPlanetHaloTexture()
  const asset = createRingedPlanetAsset(2, texture)
  const baseline = createRingedPlanetAsset(2, texture)
  const speed = PLANET_ORBIT_SPEEDS[2]
  const period = 2 * Math.PI / Math.abs(speed) * 0.7
  const tilt = PLANET_RING.tiltDegrees * Math.PI / 180
  const normal = new Vector3(Math.sin(tilt), Math.cos(tilt), 0)
  const rings = [asset.innerRing, asset.ring, asset.outerRing, asset.outermostRing]
  try {
    asset.core.position.set(2, 3, 4)
    asset.updateAppearance(0, 2, 20, 1, 1, 2)
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const time = period * fraction
      baseline.updateSpin(time, speed, 0.7)
      asset.updateSpin(time, speed, 0.7, true)
      expect(asset.core.quaternion.angleTo(baseline.core.quaternion)).toBeLessThan(1e-7)
      for (const ring of rings) {
        const direction = normal.clone().applyQuaternion(ring.quaternion)
        expect(direction.y).toBeCloseTo(Math.cos(tilt))
        if (fraction === 0.25) expect(Math.abs(direction.z)).toBeCloseTo(Math.sin(tilt))
        if (fraction === 1) expect(direction.distanceTo(normal)).toBeLessThan(1e-9)
        expect(ring.quaternion.equals(asset.ring.quaternion)).toBe(true)
        expect(ring.position.toArray()).toEqual([2, 3, 4])
        expect(ring.scale.x).toBe(20)
      }
    }
    asset.updateSpin(period / 4, speed, 0.7, true)
    const previous = asset.ring.quaternion.clone()
    asset.updateSpin(period / 4, speed, 0.7, true)
    expect(asset.ring.quaternion.equals(previous)).toBe(true)
    asset.updateSpin(period / 4, speed, 0.7)
    expect(normal.clone().applyQuaternion(asset.ring.quaternion).distanceTo(normal)).toBeLessThan(1e-9)
  } finally { asset.dispose(); baseline.dispose(); texture.dispose() }
})
