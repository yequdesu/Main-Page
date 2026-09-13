import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_CONFIG } from '../../actors/LighthouseCaptureTypes'
import { pickSavable, savedSignature } from '../captureSettings'

describe('图标配置保存边界', () => {
  it('预览分辨率和抗锯齿不参与保存与脏状态', () => {
    const saved = pickSavable(DEFAULT_CAPTURE_CONFIG)
    expect(saved).not.toHaveProperty('captureW')
    expect(saved).not.toHaveProperty('antialias')
    expect(savedSignature({ ...DEFAULT_CAPTURE_CONFIG, captureW: 512, antialias: false })).toBe(
      savedSignature(DEFAULT_CAPTURE_CONFIG),
    )
    expect(savedSignature({ ...DEFAULT_CAPTURE_CONFIG, cameraY: 1 })).not.toBe(
      savedSignature(DEFAULT_CAPTURE_CONFIG),
    )
  })
  it.each([
    null,
    [],
    { cameraFov: 0 },
    { cameraZ: Infinity },
    { cameraY: '1' },
    { outlineType: 'bloom' },
    { keyColor: 'red' },
  ])('拒绝无效配置 %j', (raw) => {
    expect(() => pickSavable(raw)).toThrow()
  })
  it('允许旧版部分字段，字段顺序不产生假变更', () => {
    expect(pickSavable({ cameraY: -1.5, unused: true })).toEqual({ cameraY: -1.5 })
    expect(savedSignature({ cameraZ: 9, cameraY: 0 })).toBe(savedSignature({ cameraY: 0, cameraZ: 9 }))
  })
})
