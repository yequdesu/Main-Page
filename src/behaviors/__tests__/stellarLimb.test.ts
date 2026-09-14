import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createStellarLimbFrame, stellarLimbPhase, stellarDetailVisibility } from '../stellarLimb'
import { getStructureLayout } from '../structureLayout'

it('不同视口、相机位置和完整环周相位均落在真实轮廓，不向正面球面铺开', () => {
  const frame = createStellarLimbFrame(), anchor = new Vector3(), tangent = new Vector3(), normal = new Vector3()
  for (const aspect of [0.46, 1, 16 / 9, 2.4]) {
    const layout = getStructureLayout(aspect), sun = new Vector3(layout.sunX, 0, 0)
    frame.layout(layout)
    for (const camera of [new Vector3(0, 0, 24), new Vector3(layout.sunX, 0, 90), new Vector3(layout.sunX + 6, 20, 46)]) {
      frame.view(camera, new Vector3(0, 1, 0))
      for (const angle of [-Math.PI, -2, -0.7, 0, 0.6, 1.9, Math.PI]) {
        frame.sampleAngle(angle, anchor, tangent, normal)
        expect(anchor.distanceTo(sun)).toBeCloseTo(layout.sunRadius, 10)
        expect(camera.clone().sub(anchor).dot(normal)).toBeCloseTo(0, 10)
        expect(normal.dot(tangent)).toBeCloseTo(0, 12)
        expect(tangent.length()).toBeCloseTo(1, 12)
      }
    }
  }
})

it('保留环周相位，摄像机小步运动不会切换锚点或翻转切向', () => {
  const frame = createStellarLimbFrame(), layout = getStructureLayout(16 / 9)
  frame.layout(layout)
  const anchor = new Vector3(), tangent = new Vector3(), normal = new Vector3()
  const last = new Vector3(), camera = new Vector3(layout.sunX, 0, 90), up = new Vector3(0, 1, 0)
  const angle = stellarLimbPhase(0.47, 0.6, 0, frame.referenceLimit)
  for (let i = 0; i <= 1000; i++) {
    camera.set(layout.sunX * (1 - i / 1000), 0, 90 - 66 * i / 1000)
    frame.view(camera, up); frame.sampleAngle(angle, anchor, tangent, normal)
    if (i > 0) expect(anchor.distanceTo(last)).toBeLessThan(0.035)
    last.copy(anchor)
  }
  // 较小日珥与 CME 都能覆盖整圈；CME 的概率偏好不再限制出生范围。
  expect(stellarLimbPhase(0.47, -1, 1, frame.referenceLimit)).toBe(-Math.PI)
  expect(stellarLimbPhase(0.47, 1, 1, frame.referenceLimit)).toBe(Math.PI)
  expect(stellarLimbPhase(0.47, -1, 2, frame.referenceLimit)).toBe(-Math.PI)
  expect(stellarLimbPhase(0.47, 1, 2, frame.referenceLimit)).toBe(Math.PI)
})

it('细节按屏幕半径平滑显现，避免远景中最小像素的团块聚集', () => {
  expect(stellarDetailVisibility(8)).toBe(0)
  expect(stellarDetailVisibility(46)).toBeCloseTo(0.5)
  expect(stellarDetailVisibility(100)).toBe(1)
})
