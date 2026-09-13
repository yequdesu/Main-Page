import { afterEach, describe, expect, it, vi } from 'vitest'
import { Color, Group, PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from 'three'
import { captureViewport } from '../captureViewport'

afterEach(() => vi.restoreAllMocks())
function renderer() {
  const oldTarget = new WebGLRenderTarget(1, 1)
  let target: WebGLRenderTarget | null = oldTarget
  return {
    oldTarget,
    getRenderTarget: () => target,
    getClearColor: (value: Color) => value.set('#345678'),
    getClearAlpha: () => 0.6,
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn((next: WebGLRenderTarget | null) => {
      target = next
    }),
    render: vi.fn(),
    readRenderTargetPixels: vi.fn(
      (_target: unknown, _x: number, _y: number, _w: number, _h: number, pixels: Uint8Array) =>
        pixels.set([255, 0, 0, 255, 0, 0, 255, 255]),
    ),
  }
}
describe('视口导出', () => {
  it('翻转像素行，恢复背景、辅助对象与渲染目标', () => {
    const gl = renderer(),
      scene = new Scene(),
      camera = new PerspectiveCamera()
    const background = new Color('#112233')
    scene.background = background
    const helper = new Group()
    helper.userData.studioHelper = true
    scene.add(helper)
    const put = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: () => ({ data: new Uint8ClampedArray(8) }),
      putImageData: put,
    } as unknown as CanvasRenderingContext2D)
    const disposed = vi.spyOn(WebGLRenderTarget.prototype, 'dispose')
    const canvas = captureViewport(gl as unknown as WebGLRenderer, scene, camera, {
      width: 1,
      height: 2,
      transparent: true,
      helpers: false,
    })
    expect([canvas.width, canvas.height]).toEqual([1, 2])
    expect([...put.mock.calls[0][0].data]).toEqual([0, 0, 255, 255, 255, 0, 0, 255])
    expect(gl.render.mock.calls[0][1]).not.toBe(camera)
    expect(scene.background).toBe(background)
    expect(helper.visible).toBe(true)
    expect(gl.getRenderTarget()).toBe(gl.oldTarget)
    expect(gl.setClearColor).toHaveBeenLastCalledWith(new Color('#345678'), 0.6)
    expect(disposed).toHaveBeenCalledTimes(1)
  })
  it('GPU 读回失败后仍恢复场景并释放临时目标', () => {
    const gl = renderer(),
      scene = new Scene(),
      helper = new Group()
    helper.userData.studioHelper = true
    scene.add(helper)
    gl.readRenderTargetPixels.mockImplementation(() => {
      throw new Error('read failed')
    })
    const disposed = vi.spyOn(WebGLRenderTarget.prototype, 'dispose')
    expect(() =>
      captureViewport(gl as unknown as WebGLRenderer, scene, new PerspectiveCamera(), {
        width: 1,
        height: 2,
        transparent: true,
        helpers: false,
      }),
    ).toThrow('read failed')
    expect(helper.visible).toBe(true)
    expect(gl.getRenderTarget()).toBe(gl.oldTarget)
    expect(disposed).toHaveBeenCalledTimes(1)
  })
})
