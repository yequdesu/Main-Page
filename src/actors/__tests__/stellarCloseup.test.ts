import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCentralStarAsset } from '../assets/centralStar'
import { configureStellarCloseup, STELLAR_CLOSEUP } from '../assets/stellarCloseup'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.restoreAllMocks())

it('特写按原动画时间的 15% 呼吸，三层可见度有区分，不改变默认恒星', () => {
  const star = createCentralStarAsset(), reference = createCentralStarAsset()
  const closeup = configureStellarCloseup(star)
  try {
    for (const t of [0, 1, 5, 20, 80, 140]) {
      reference.updateGlow(t * 0.15, 1)
      closeup.update(t)
      const pulse = reference.glow.scale.x
      expect(star.glow.scale.x).toBe(pulse)
      expect(star.glow.material.opacity).toBeCloseTo(0.15 * pulse)
      expect(star.nearHalo.material.opacity).toBeCloseTo(0.20 * pulse)
      expect(star.farHalo.material.opacity).toBeCloseTo(0.20 * pulse)
      expect(star.glow.material.opacity).toBeLessThan(star.nearHalo.material.opacity)
      expect(star.glow.material.opacity).toBeLessThan(star.farHalo.material.opacity)
    }
    expect(reference.core.material.color.getHexString()).toBe('fff8e7')
    expect(star.core.material.color.getHexString()).toBe(STELLAR_CLOSEUP.coreColor.slice(1))
    expect(star.root.children.filter(child => child.name === '恒星核心')).toHaveLength(1)
    expect(star.glow.material.depthWrite).toBe(false)
    expect(star.nearHalo.material.depthTest).toBe(true)
    // 从近景反向退回时，同一资产恢复默认光晕和颜色，而不是替换另一颗恒星。
    closeup.update(12, 0, 0.7)
    reference.updateGlow(12, 0.7)
    expect(star.core.material.color.equals(reference.core.material.color)).toBe(true)
    expect(star.glow.scale.equals(reference.glow.scale)).toBe(true)
    expect(star.glow.material.opacity).toBeCloseTo(reference.glow.material.opacity)
    expect(star.nearHalo.material.opacity).toBeCloseTo(reference.nearHalo.material.opacity)
  } finally { star.dispose(); reference.dispose() }
})
