import { describe, it, expect, beforeEach } from 'vitest'
import { stepPBD, resetPBD, type PBDInput, type PBDParams } from '../usePBDLayout'

function inp(sx: number, sy: number, pr = 20, visible = true, lw = 60, lh = 44): PBDInput {
  return { sx, sy, pr, visible, lw, lh }
}

const NO_STAR = { x: 0, y: 0, r: 0, visible: false }

describe('stepPBD', () => {
  beforeEach(() => resetPBD())
  it('returns a results', () => {
    const inputs: [PBDInput, PBDInput, PBDInput] = [
      inp(500, 400), inp(900, 400), inp(1300, 400),
    ]
    const results = stepPBD(inputs, NO_STAR, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    expect(results).toHaveLength(3)
    results.forEach(r => {
      expect(r).toHaveProperty('x')
      expect(r).toHaveProperty('y')
      expect(r).toHaveProperty('anchorL')
      expect(r).toHaveProperty('anchorR')
    })
  })

  it('places labels above when star is below', () => {
    const starBelow = { x: 500, y: 600, r: 30, visible: true }
    const inputs: [PBDInput, PBDInput, PBDInput] = [
      inp(500, 500), inp(900, 500, 20, false), inp(1300, 500, 20, false),
    ]
    let results = stepPBD(inputs, starBelow, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    for (let i = 0; i < 200; i++) results = stepPBD(inputs, starBelow, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    // 含 8° spread，label 0 略偏左上但仍在上方
    expect(results[0].y + 44).toBeLessThan(520)  // 放宽：shadow spread 使 y 略有偏移
  })

  it('places labels to the right when star is left', () => {
    // 恒星离远些，避免 protect zone 与 shadow target 冲突
    const starLeft = { x: 200, y: 500, r: 30, visible: true }
    const inputs: [PBDInput, PBDInput, PBDInput] = [
      inp(500, 500), inp(900, 500, 20, false), inp(1300, 500, 20, false),
    ]
    let results = stepPBD(inputs, starLeft, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    for (let i = 0; i < 200; i++) results = stepPBD(inputs, starLeft, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    // 含 8° spread + EMA 平滑，target x ≈ 460
    expect(results[0].x).toBeGreaterThan(450)
  })

  it('returns zeros for invisible planets', () => {
    const inputs: [PBDInput, PBDInput, PBDInput] = [
      inp(500, 500, 20, false), inp(900, 500, 20, false), inp(1300, 500, 20, false),
    ]
    const results = stepPBD(inputs, NO_STAR, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    results.forEach(r => {
      expect(r.x).toBe(0); expect(r.y).toBe(0)
    })
  })

  it('converges labels apart when overlapping', () => {
    const starBelow = { x: 500, y: 600, r: 30, visible: true }
    const inputs: [PBDInput, PBDInput, PBDInput] = [
      inp(500, 500), inp(620, 500), inp(1300, 500, 20, false),
    ]
    // 120px 间距，K=2 弱弹簧 + EMA 平滑后应分离
    let final: any = null
    for (let i = 0; i < 200; i++) {
      final = stepPBD(inputs, starBelow, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    }
    const a = final[0], b = final[1]
    const ox = Math.max(0, Math.min(a.x + 85, b.x + 85) - Math.max(a.x, b.x))
    const oy = Math.max(0, Math.min(a.y + 44, b.y + 44) - Math.max(a.y, b.y))
    expect(ox <= 0 || oy <= 0).toBe(true)
  })

  it('avoids central star', () => {
    const star = { x: 500, y: 500, r: 40, visible: true }
    const inputs: [PBDInput, PBDInput, PBDInput] = [
      inp(500, 500), inp(900, 500, 20, false), inp(1300, 500, 20, false),
    ]
    const results = stepPBD(inputs, star, {}, 0.016, 1920, 1080, 85, 200, 44, 44, -1)
    // label 不应覆盖恒星区域
    const r = results[0]
    const cx = r.x + 42; const cy = r.y + 22
    const d = Math.hypot(cx - 500, cy - 500)
    expect(d).toBeGreaterThan(40)
  })
})
