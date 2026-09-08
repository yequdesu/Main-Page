import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene } from 'three'
import { DEFAULT_CAPTURE_CONFIG, offscreenCapture } from '../../actors/LighthouseCaptureTypes'

const renderer = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn() }))
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    domElement = document.createElement('canvas')
    setSize() {}
    setPixelRatio() {}
    setClearColor() {}
    render = renderer.render
    dispose = renderer.dispose
    forceContextLoss = renderer.forceContextLoss
  },
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
describe('灯塔烘焙资源所有权', () => {
  it.each([false, true])('完成或失败（%s）都释放自有资源，保留源模型', (fail) => {
    const root = new Group(),
      geometry = new BoxGeometry(),
      material = new MeshStandardMaterial()
    root.add(new Mesh(geometry, material))
    const geometryDispose = vi.spyOn(geometry, 'dispose'),
      materialDispose = vi.spyOn(material, 'dispose')
    const ownedDispose = vi.spyOn(MeshBasicMaterial.prototype, 'dispose')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,test')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderer.render.mockImplementation((scene: Scene) => {
      expect((scene.children[0].children[0] as Mesh).geometry).toBe(geometry)
      if (fail) throw new Error('render failed')
    })
    const result = offscreenCapture(
      { ...DEFAULT_CAPTURE_CONFIG, silhouetteType: 'solid', outlineType: 'none' },
      root,
    )
    expect(result).toBe(fail ? null : 'data:image/png;base64,test')
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    expect(ownedDispose).toHaveBeenCalledTimes(1)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1)
  })
})
