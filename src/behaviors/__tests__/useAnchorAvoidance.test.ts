import { describe, it, expect } from 'vitest'
import { calcAnchorPositions, type AnchorInput, type AnchorResult } from '../useAnchorAvoidance'

const DEFAULT_VP = { width: 1920, height: 1080 }

function makeInput(
  x: number, y: number, visible = true, trackIdx = 0, expanded = false,
): AnchorInput {
  return { screenX: x, screenY: y, visible, trackIdx, expanded }
}

describe('calcAnchorPositions', () => {
  it('returns three results for three inputs', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 400), makeInput(900, 400), makeInput(1300, 400),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    expect(results).toHaveLength(3)
    results.forEach(r => {
      expect(r).toHaveProperty('x')
      expect(r).toHaveProperty('y')
    })
  })

  it('places pill above planet by default', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500), makeInput(900, 500, false), makeInput(1300, 500, false),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    // 默认偏移：行星上方，pill 底部在行星上方 8px
    // pill 高度约 2 * 1.6em + padding ≈ 56px
    const pillH = 60 // approximate
    expect(results[0].y).toBeLessThan(500 - pillH / 2)
  })

  it('returns {0,0} for invisible planets', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500, false), makeInput(900, 500, false), makeInput(1300, 500, false),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    results.forEach(r => {
      expect(r.x).toBe(0)
      expect(r.y).toBe(0)
    })
  })

  it('avoids overlapping pills by shifting outer ones', () => {
    // 三个行星在屏幕同一点，pill 必须不重叠
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500, true, 0), makeInput(500, 500, true, 1), makeInput(500, 500, true, 2),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    // 验证两两不重叠（10px 容差）
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const a = results[i], b = results[j]
        const overlapX = Math.abs(a.x - b.x) < (160 + 10)
        const overlapY = Math.abs(a.y - b.y) < (60 + 10)
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  it('keeps pills within viewport bounds', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(10, 10, true, 0),     // 左上角
      makeInput(1910, 10, true, 1),   // 右上角
      makeInput(10, 1070, true, 2),   // 左下角
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    results.forEach(r => {
      expect(r.x).toBeGreaterThanOrEqual(12)
      expect(r.x + 160).toBeLessThanOrEqual(1920 - 12)
      expect(r.y).toBeGreaterThanOrEqual(12)
      expect(r.y + 60).toBeLessThanOrEqual(1080 - 12)
    })
  })

  it('expanded pill gets extra space', () => {
    const inputs: [AnchorInput, AnchorInput, AnchorInput] = [
      makeInput(500, 500, true, 0, true),  // 展开：260px 宽
      makeInput(500, 500, true, 1),
      makeInput(500, 500, true, 2),
    ]
    const results = calcAnchorPositions(inputs, DEFAULT_VP, 160, 260)
    // 展开 pill 宽度为 260，其余为 160
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const aW = results[i].expanded ? 260 : 160
        const bW = results[j].expanded ? 260 : 160
        const a = results[i], b = results[j]
        const overlapX = Math.abs(a.x - b.x) < (Math.max(aW, bW) + 10)
        const overlapY = Math.abs(a.y - b.y) < (60 + 10)
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })
})
