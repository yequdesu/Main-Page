import { afterEach, describe, expect, it } from 'vitest'
import { resetPBD, stepPBD } from '../../../behaviors/usePBDLayout'
import { compareRates, DEFAULTS, Experiment, overlapArea, rectCircleGap, sceneAt, sizesFor, targetFor, WORLD } from '../model'

afterEach(resetPBD)

describe('PBD 文档实验', () => {
  it('诊断实际矩形重叠，而不是仅检查中心', () => {
    const a = { x: 0, y: 0, width: 60, height: 36 }
    expect(overlapArea(a, { ...a, x: 50, y: 30 })).toBe(60)
    expect(overlapArea(a, { ...a, x: 60 })).toBe(0)
    // 矩形中心距圆心>圆半径，但右侧仍侵入圆 5px。
    expect(rectCircleGap(a, { x: 65, y: 18, r: 10 })).toBe(-5)
    expect(rectCircleGap(a, { x: 80, y: 18, r: 10 })).toBe(10)
  })

  it('目标标记表示左上角，偏移作用于矩形中心', () => {
    const p = { sx: 500, sy: 500, pr: 8, visible: true, lw: 60, lh: 36 }
    expect(targetFor(p, { x: 200, y: 500 }, DEFAULTS, 1)).toEqual({ x: 494, y: 482 })
    expect(targetFor(p, { x: 500, y: 500 }, DEFAULTS, 1)).toEqual({ x: 470, y: 458 })
  })

  it('演示调用原求解器，并保持相同的时间、尺寸和状态序列', () => {
    const s = { ...DEFAULTS, fps: 30, expanded: 1 }
    resetPBD()
    let expected
    for (let frame = 0; frame <= 12; frame++) {
      const scene = sceneAt(s, frame / s.fps)
      expected = stepPBD(scene.planets, scene.star, {
        gap: s.gap, anchorRangeRadius: s.range, shadowAngleSpread: s.spread,
      }, 1 / s.fps, WORLD.width, WORLD.height, 60, 200, 36, 44, s.expanded, [30,41,53])
    }
    const experiment = new Experiment(s)
    experiment.reset()
    let actual
    for (let frame = 1; frame <= 12; frame++) actual = experiment.step()
    expect(actual!.labels).toEqual(expected)
    expect(actual!.time).toBe(0.4)
    expect(actual!.frame).toBe(12)
    expect(actual!.sizes[1]).toEqual({ width: 200, height: 44 })
  })

  it('复位清除前一实验的速度与目标历史', () => {
    const experiment = new Experiment(DEFAULTS)
    const first = experiment.reset()
    for (let i = 0; i < 100; i++) experiment.step()
    expect(experiment.reset()).toEqual(first)
    expect(sizesFor({ ...DEFAULTS, fitted: false })[0]).toEqual({ width: 60, height: 36 })
  })

  it('帧率比较可重复，且不会修改输入配置', () => {
    const settings = { ...DEFAULTS, scenario: 'crowded' as const, fitted: false }
    const copy = { ...settings }
    const first = compareRates(settings)
    expect(first.map(row => row.fps)).toEqual([30,60,120])
    expect(compareRates(settings)).toEqual(first)
    expect(settings).toEqual(copy)
    first.forEach(row => expect(Number.isFinite(row.overlap + row.starGap + row.anchorExcess)).toBe(true))
    // 比较完成后重新 reset，交互会话不会继承最后一组的状态。
    const experiment = new Experiment(settings)
    expect(experiment.reset().time).toBe(0)
  })
})
