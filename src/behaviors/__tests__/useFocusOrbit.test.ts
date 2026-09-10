import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { chooseFocusPhases, createFocusOrbitController } from '../useFocusOrbit'
import { createFocusPoseCalculator, focusFieldOfView } from '../focusPose'
import { ORBIT_RADII, SCENE_CENTER_Z } from '../../r3f/ScrollRig'
import type { ParticleData } from '../../types'

const geometry = { planetRadius: 0.015, starRadius: 0.42 }
const envelopes = [1.1, 2.78, 2.94]
const scales = [1, 1.25, 1.25]
const bodies = () => ORBIT_RADII.map((orbitR, i) => ({
  orbitR, orbitAngle: [0.3, 2.4, 5.2][i], _baseSpeed: -0.04 - i * 0.015,
  hoverFactor: 0, scale: 1.2, sizeBoost: 4, scaleMult: 2.4 + i * 0.2,
} as ParticleData))

const cases = [16 / 9, 1, 755 / 871, 390 / 844].flatMap(aspect => [0, 1, 2].map(track => ({ aspect, track })))
describe('原轨道上的聚焦构图', () => {
  it.each(cases)('宽高比 $aspect，聚焦 $track：三角形包含恒星，其他行星位于两侧且在视口内', ({ aspect, track }) => {
    const data = bodies()
    const fov = focusFieldOfView(aspect, 40)
    const phases = chooseFocusPhases(data, track, aspect, fov, envelopes, scales[track], geometry)
    const camera = new PerspectiveCamera(fov, aspect)
    const pose = createFocusPoseCalculator()
    const p = new Vector3(), look = new Vector3()
    for (const rotation of [0, 1.7, 4.3]) for (const elapsed of [0, 5, 10, 15, 20, 25, 30]) {
      const angles = phases.map((phase, i) => phase + rotation + (i === track ? 0 : 0.025 * Math.sin(elapsed * 0.12 + i * 2.1)))
      pose(new Vector3(Math.cos(rotation) * data[track].orbitR, -1, SCENE_CENTER_Z + Math.sin(rotation) * data[track].orbitR), elapsed, scales[track], p, look)
      camera.position.copy(p); camera.lookAt(look); camera.updateMatrixWorld()
      const star = new Vector3(0, -1, SCENE_CENTER_Z).project(camera)
      const points = angles.map((phase, i) => new Vector3(Math.cos(phase) * data[i].orbitR, -1, SCENE_CENTER_Z + Math.sin(phase) * data[i].orbitR).project(camera))
      const other = points.filter((_, i) => i !== track).sort((a, b) => a.x - b.x)
      expect(other[0].x, `left phases ${phases}`).toBeLessThan(star.x)
      expect(other[1].x, `right phases ${phases}`).toBeGreaterThan(star.x)
      for (const point of other) {
        expect(Math.abs(point.x), `x ${point.x}, phases ${phases}, time ${elapsed}`).toBeLessThan(0.96)
        expect(Math.abs(point.y), `y ${point.y}, phases ${phases}, time ${elapsed}`).toBeLessThan(0.96)
      }
      for (let i = 0; i < 3; i++) {
        if (i === track) continue
        const world = new Vector3(Math.cos(angles[i]) * data[i].orbitR, -1, SCENE_CENTER_Z + Math.sin(angles[i]) * data[i].orbitR)
        const distance = world.distanceTo(camera.position)
        const depth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z
        const radius = geometry.planetRadius * data[i].scale * 0.7 * data[i].sizeBoost * data[i].scaleMult * 22 / Math.max(5, distance) * envelopes[i] * 1.35 / (depth * Math.tan(fov * Math.PI / 360))
        expect(Math.abs(points[i].x) + radius / aspect, `horizontal envelope ${i}, ${elapsed}`).toBeLessThan(0.99)
        expect(Math.abs(points[i].y) + radius, `vertical envelope ${i}, ${elapsed}`).toBeLessThan(0.99)
      }
      const cross = (a: Vector3, b: Vector3) => (a.x - star.x) * (b.y - star.y) - (a.y - star.y) * (b.x - star.x)
      const signs = [cross(points[0], points[1]), cross(points[1], points[2]), cross(points[2], points[0])]
      expect(signs.every(s => s > 0) || signs.every(s => s < 0)).toBe(true)
    }
  })


  it.each([30, 60, 120])('每秒 %i 帧：快速调相、切换目标后重新收敛，角速度与步长稳定', (fps) => {
    const data = bodies()
    const camera = new PerspectiveCamera(40, 16 / 9)
    const controller = createFocusOrbitController(geometry)
    const error = (a: number) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))
    for (const [start, track] of [[0, 0], [6, 2], [12, 1]]) {
      const phases = chooseFocusPhases(data, track, camera.aspect, focusFieldOfView(camera.aspect, 40), envelopes, scales[track], geometry)
      for (let f = 0; f < fps * 6; f++) {
        const previous = data.map(d => d.orbitAngle)
        controller.step(data, track, camera, start + f / fps, 1 / fps, envelopes, scales[track])
        data.forEach((d, i) => expect(Math.abs(d.orbitAngle - previous[i])).toBeLessThan(2 / fps))
        if (f >= fps * 4) data.forEach((d, i) => {
          if (i !== track) expect(error(d.orbitAngle - data[track].orbitAngle - phases[i])).toBeLessThan(0.06)
        })
      }
      expect(Math.max(...controller.speeds) - Math.min(...controller.speeds)).toBeLessThan(0.01)
    }
  })

  it('到位后角速度近同步且有小幅差异，退出平滑恢复原角速度，不倒回旧相位', () => {
    const data = bodies()
    const originalRadii = data.map(d => d.orbitR)
    const originalSpeed = data.map(d => d._baseSpeed)
    const camera = new PerspectiveCamera(40, 16 / 9)
    const controller = createFocusOrbitController(geometry)
    for (let f = 0; f < 1200; f++) controller.step(data, 1, camera, f / 60, 1 / 60, envelopes, 1.25)
    const speeds = [...controller.speeds]
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeLessThan(0.01)
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.0001)
    const angles = data.map(d => d.orbitAngle)
    controller.step(data, -1, camera, 20, 1 / 60, envelopes, 1)
    data.forEach((d, i) => expect(Math.abs(d.orbitAngle - angles[i])).toBeLessThan(0.002))
    for (let f = 1201; f < 1800; f++) controller.step(data, -1, camera, f / 60, 1 / 60, envelopes, 1)
    data.forEach((d, i) => {
      expect(d.orbitR).toBe(originalRadii[i])
      expect(d._baseSpeed).toBe(originalSpeed[i])
      expect(controller.speeds[i]).toBeCloseTo(originalSpeed[i], 6)
    })
  })
})
