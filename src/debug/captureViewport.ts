import {
  Camera,
  Color,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import type { ExportOptions } from './studioTypes'

// 显式离屏渲染，避免依赖浏览器已经清空的 drawing buffer。
export function captureViewport(gl: WebGLRenderer, scene: Scene, camera: Camera, options: ExportOptions) {
  const { width, height } = options
  const target = new WebGLRenderTarget(width, height, { samples: 4 })
  target.texture.colorSpace = SRGBColorSpace
  const savedTarget = gl.getRenderTarget()
  const background = scene.background
  const clearColor = gl.getClearColor(new Color()).clone()
  const clearAlpha = gl.getClearAlpha()
  const helpers: { object: import('three').Object3D; visible: boolean }[] = []
  const exportCamera = camera.clone() as PerspectiveCamera | OrthographicCamera
  if (exportCamera instanceof PerspectiveCamera) exportCamera.aspect = width / height
  else {
    const halfH = (exportCamera.top - exportCamera.bottom) / 2
    exportCamera.left = (-halfH * width) / height
    exportCamera.right = (halfH * width) / height
  }
  exportCamera.updateProjectionMatrix()
  try {
    if (options.transparent) {
      scene.background = null
      gl.setClearColor(0, 0)
    }
    if (!options.helpers)
      scene.traverse((object) => {
        if (object.userData.studioHelper) {
          helpers.push({ object, visible: object.visible })
          object.visible = false
        }
      })
    gl.setRenderTarget(target)
    gl.render(scene, exportCamera)
    const pixels = new Uint8Array(width * height * 4)
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    const data = context.createImageData(width, height)
    for (let y = 0; y < height; y++)
      data.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4)
    context.putImageData(data, 0, 0)
    return canvas
  } finally {
    scene.background = background
    helpers.forEach(({ object, visible }) => {
      object.visible = visible
    })
    gl.setClearColor(clearColor, clearAlpha)
    gl.setRenderTarget(savedTarget)
    target.dispose()
  }
}
