import { createOrbitHarness } from './focusHarness'
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { ORBIT_RADII } from '../../r3f/ScrollRig'
import type { ParticleData } from '../../types'

const geometry = { planetRadius: 0.015, starRadius: 0.42 }
const envelopes = [1.1, 2.78, 2.94]
const makeBodies = () => ORBIT_RADII.map((orbitR, i) => ({
  orbitR, orbitAngle: [0.3, 2.4, 5.2][i], _baseSpeed: -0.04 - i * 0.015,
  hoverFactor: 0, scale: 1.2, sizeBoost: 4, scaleMult: 2.4 + i * 0.2,
} as ParticleData))
const angularError = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

describe('退出聚焦后追赶原始公转相位', () => {
  const cases = [30, 60, 120].flatMap(fps => [0, 0.001, Math.PI, Math.PI * 2 - 0.001].map(gap => ({ fps, gap })))
  it.each(cases)('$fps fps，剩余弧长 $gap：同向、限速、精确追上移动目标，零距离不多绕一圈', ({ fps, gap }) => {
    const data = makeBodies()
    const initial = data.map(d => d.orbitAngle)
    const controller = createOrbitHarness(geometry)
    const camera = new PerspectiveCamera(40, 16 / 9)
    controller.step(data, 0, camera, 0, 0, envelopes, 1)
    // 模拟构图完成后的不同相位偏移，参考轨道仍从初始位置持续运行。
    data.forEach((d, i) => { d.orbitAngle = initial[i] + gap })
    for (let f = 1; f <= fps * 6; f++) {
      const before = data.map(d => d.orbitAngle)
      controller.step(data, -1, camera, f / fps, 1 / fps, envelopes, 1)
      data.forEach((d, i) => {
        expect(d.orbitAngle).toBeLessThanOrEqual(before[i] + 1e-10)
        expect(controller.speeds[i]).toBeLessThan(0)
        expect(Math.abs(controller.speeds[i] - d._baseSpeed)).toBeLessThanOrEqual(2.8 + 1e-10)
        if (f / fps <= 0.7) expect(d.orbitAngle).toBeCloseTo(initial[i] + gap + d._baseSpeed * f / fps, 6)
      })
    }
    data.forEach((d, i) => {
      expect(d.orbitAngle).toBeCloseTo(initial[i] + d._baseSpeed * 6, 8)
      expect(controller.speeds[i]).toBeCloseTo(d._baseSpeed, 10)
      expect(d.orbitR).toBe(ORBIT_RADII[i])
    })
  })

  it('参考相位穿过聚焦、切换、回位与再次聚焦，最终仍匹配从未聚焦的轨道', () => {
    const data = makeBodies()
    const initial = data.map(d => d.orbitAngle)
    const controller = createOrbitHarness(geometry)
    const camera = new PerspectiveCamera(40, 16 / 9)
    let frames = 0
    // 分别打断制动阶段与快速回位阶段；最终回到三颗行星的持续参考位置。
    for (const [track, duration] of [[1, 10], [-1, 0.3], [2, 0.7], [-1, 1.4], [0, 7], [-1, 6]]) {
      for (let f = 0; f < Math.round(duration * 60); f++) {
        const previous = data.map(d => d.orbitAngle)
        controller.step(data, track, camera, frames++ / 60, 1 / 60, envelopes, track === 0 ? 1 : 1.25)
        data.forEach((d, i) => expect(Math.abs(d.orbitAngle - previous[i])).toBeLessThan(3 / 60))
      }
    }
    data.forEach((d, i) => {
      expect(angularError(d.orbitAngle, initial[i] + d._baseSpeed * frames / 60)).toBeLessThan(1e-8)
      expect(controller.speeds[i]).toBeCloseTo(d._baseSpeed, 10)
    })
  })

  it('中途退出反向调相时先连续制动，快速回位阶段遵循原公转方向', () => {
    const data = makeBodies()
    const controller = createOrbitHarness(geometry)
    const camera = new PerspectiveCamera(40, 16 / 9)
    for (let f = 0; f < 24; f++) controller.step(data, 1, camera, f / 60, 1 / 60, envelopes, 1.25)
    expect(controller.speeds.some(speed => speed > 0)).toBe(true)
    const previousSpeeds = [...controller.speeds]
    controller.step(data, -1, camera, 0.4, 1 / 60, envelopes, 1)
    controller.speeds.forEach((speed, i) => expect(Math.abs(speed - previousSpeeds[i])).toBeLessThan(0.01))
    for (let f = 1; f < 360; f++) {
      controller.step(data, -1, camera, 0.4 + f / 60, 1 / 60, envelopes, 1)
      if (f / 60 >= 0.7) expect(controller.speeds.every(speed => speed < 0)).toBe(true)
    }
  })

  it('正常全景仍响应悬停减速，聚焦时参考轨道使用原始公转速度', () => {
    const data = makeBodies()
    const initial = data.map(d => d.orbitAngle)
    const controller = createOrbitHarness(geometry)
    const camera = new PerspectiveCamera(40, 16 / 9)
    data[0].hoverFactor = 1
    for (let f = 0; f < 120; f++) controller.step(data, -1, camera, f / 60, 1 / 60, envelopes, 1)
    expect(data[0].orbitAngle).toBeCloseTo(initial[0] + data[0]._baseSpeed * 0.2 * 2, 10)
    const references = data.map(d => d.orbitAngle)
    data[0].hoverFactor = 0
    for (let f = 120; f < 1920; f++) controller.step(data, 1, camera, f / 60, 1 / 60, envelopes, 1.25)
    for (let f = 1920; f < 2280; f++) controller.step(data, -1, camera, f / 60, 1 / 60, envelopes, 1)
    data.forEach((d, i) => expect(angularError(d.orbitAngle, references[i] + d._baseSpeed * 36)).toBeLessThan(1e-8))
  })
})
