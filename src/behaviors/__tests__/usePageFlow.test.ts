import { afterEach, describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { getPageFlow, PAGE_FLOW } from '../usePageFlow'
import { getStructureLayout, STRUCTURE_LAYOUT } from '../structureLayout'
import { createCameraFocusController } from '../useCameraFocus'
import { createFocusChannels } from '../useFocusTimeline'
import { useScrollStore } from '../../stores/scrollStore'

const initial = useScrollStore.getState()
afterEach(() => useScrollStore.setState(initial, true))

describe('第四幕滚动与取景', () => {
  it('原三幕区间不变，快进落点停在轨道图；继续滚动才进入结构图', () => {
    for (const value of [0, 0.4, 0.45, 0.85, 1]) {
      expect(getPageFlow(value)).toEqual({ pageProgress: value, scrollProgress: value, structureProgress: 0 })
    }
    expect(getPageFlow(PAGE_FLOW.act3Target).structureProgress).toBe(0)
    expect(getPageFlow(1.12).structureProgress).toBeCloseTo(0.5)
    expect(getPageFlow(1.22).structureProgress).toBe(1)
    expect(getPageFlow(2)).toEqual({ pageProgress: 1.3, scrollProgress: 1, structureProgress: 1 })
    expect(getPageFlow(-1)).toEqual({ pageProgress: 0, scrollProgress: 0, structureProgress: 0 })
  })

  it('正反向滚动原子更新三个进度字段，不留下上次结构视图状态', () => {
    const snapshots: unknown[] = []
    const unsubscribe = useScrollStore.subscribe(state => snapshots.push([state.pageProgress, state.scrollProgress, state.structureProgress]))
    try {
      useScrollStore.getState().setPageProgress(1.22)
      useScrollStore.getState().setPageProgress(0.85)
      expect(snapshots).toEqual([[1.22, 1, 1], [0.85, 0.85, 0]])
    } finally { unsubscribe() }
  })

  it.each([16 / 9, 390 / 844, 844 / 390])('宽高比 %s 下排列与 DOM 对齐，往返取景与图层不残留', aspect => {
    const camera = new PerspectiveCamera(40, aspect)
    const channels = createFocusChannels(), update = createCameraFocusController()
    const layout = getStructureLayout(aspect)
    update(camera, channels, null)
    const original = camera.position.clone()
    const originalDirection = camera.getWorldDirection(new Vector3())
    expect(camera.layers.mask).toBe(1)
    update(camera, channels, null, 1, 0, 0.5)
    const midway = camera.position.clone()
    expect(camera.layers.mask).toBe(3)
    update(camera, channels, null, 1, 0, 1)
    expect(camera.layers.mask).toBe(2)
    expect(camera.fov).toBe(40)
    camera.updateMatrixWorld()
    layout.planets.forEach((planet, i) => {
      const projected = new Vector3(planet.x, STRUCTURE_LAYOUT.centerY, STRUCTURE_LAYOUT.planeZ).project(camera)
      expect((projected.x + 1) / 2).toBeCloseTo(STRUCTURE_LAYOUT.planetFractions[i])
      expect(projected.y).toBeCloseTo(0)
      // 包含卫星完整轨道与最外层行星环的保守包络，仍在各自列内。
      expect(planet.radius * 3).toBeLessThan(layout.width * 0.12)
    })
    // 透视相机下用屏幕边缘射线与球体相切，而非按圆盘最右顶点摆放。
    const ray = new Vector3(-0.395 * layout.width, 0, STRUCTURE_LAYOUT.planeZ - STRUCTURE_LAYOUT.cameraZ).normalize()
    const center = new Vector3(layout.sunX, 0, STRUCTURE_LAYOUT.planeZ - STRUCTURE_LAYOUT.cameraZ)
    expect(center.clone().cross(ray).length()).toBeCloseTo(layout.sunRadius)
    const glowRay = new Vector3(-0.22 * layout.width, 0, STRUCTURE_LAYOUT.planeZ - STRUCTURE_LAYOUT.cameraZ).normalize()
    expect(center.clone().cross(glowRay).length()).toBeCloseTo(layout.sunGlowRadius)
    expect(layout.sunGlowRadius).toBeGreaterThan(layout.sunRadius)
    update(camera, channels, null, 1, 0, 0.5)
    expect(camera.position.distanceTo(midway)).toBeLessThan(1e-9)
    update(camera, channels, null)
    expect(camera.position.distanceTo(original)).toBeLessThan(1e-9)
    expect(camera.getWorldDirection(new Vector3()).distanceTo(originalDirection)).toBeLessThan(1e-9)
    expect(camera.layers.mask).toBe(1)
  })
})
