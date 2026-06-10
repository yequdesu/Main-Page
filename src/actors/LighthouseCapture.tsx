import { useEffect, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { WebGLRenderTarget, Scene, PerspectiveCamera, Color, Vector3, Quaternion, AmbientLight, DirectionalLight, type Object3D } from 'three'
import { _lighthouseGroupRef } from './Lighthouse'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

// Module-level getter — App.tsx reads this to trigger capture
let _captureFn: (() => string | null) | null = null
export function getLighthouseCapture(): (() => string | null) | null {
  return _captureFn
}

/**
 * LighthouseCapture — 离屏渲染灯塔截图，供品牌文字旁图标使用。
 *
 * 原 captureLighthouse(): 克隆灯塔 group → 离屏 512×1024 → base64 PNG。
 * 通过 onCaptureReady 回调将 capture() 函数传递给 App.tsx。
 *
 * 援引：R3F useThree().gl + WebGLRenderTarget（Three.js 官方离屏渲染）
 */
interface CaptureProps {
  onCaptureReady: (capture: () => string | null) => void
}

/** Deep-clone a Three.js Object3D tree */
function deepClone(obj: Object3D): Object3D {
  const clone = obj.clone(true) // recursive material/geometry clone
  clone.position.copy(obj.position)
  clone.rotation.copy(obj.rotation)
  clone.scale.copy(obj.scale)
  return clone
}

export default function LighthouseCapture({ onCaptureReady }: CaptureProps) {
  const { gl } = useThree()

  const capture = useCallback((): string | null => {
    try {
      const lighthouseGroup = _lighthouseGroupRef
      if (!lighthouseGroup) {
        console.warn('LighthouseCapture: lighthouse not mounted yet')
        return null
      }

      // Clone lighthouse into a temp scene
      const tempScene = new Scene()
      tempScene.background = new Color('#050811')

      // Offscreen lights — necessary for MeshStandardMaterial (逐字保留自原 captureLighthouse)
      tempScene.add(new AmbientLight('#ffffff', 1.8))
      const key = new DirectionalLight('#ffffff', 2.2)
      key.position.set(8, 6, 2)
      tempScene.add(key)
      const fill = new DirectionalLight('#c8d6ff', 1.0)
      fill.position.set(-4, 3, -3)
      tempScene.add(fill)

      const tempCamera = new PerspectiveCamera(40, 0.5, 0.1, 150)
      tempCamera.position.set(0, 1.5, 4.5)
      tempCamera.lookAt(0, 0.3, SCENE_CENTER_Z)

      // Apply world transform for correct positioning
      const _wp = new Vector3()
      const _wq = new Quaternion()
      const _ws = new Vector3()
      lighthouseGroup.getWorldPosition(_wp)
      lighthouseGroup.getWorldQuaternion(_wq)
      lighthouseGroup.getWorldScale(_ws)

      const clone = deepClone(lighthouseGroup)
      clone.position.copy(_wp)
      clone.quaternion.copy(_wq)
      clone.scale.copy(_ws)
      tempScene.add(clone)

      // Render offscreen
      const target = new WebGLRenderTarget(512, 1024)
      const currentRenderTarget = gl.getRenderTarget()
      gl.setRenderTarget(target)
      gl.render(tempScene, tempCamera)
      gl.setRenderTarget(currentRenderTarget)

      // Extract pixels
      const pixels = new Uint8Array(512 * 1024 * 4)
      gl.readRenderTargetPixels(target, 0, 0, 512, 1024, pixels)

      // Convert to PNG via canvas (flip Y — WebGL reads bottom-to-top)
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 1024
      const ctx = canvas.getContext('2d')!
      const imgData = ctx.createImageData(512, 1024)
      imgData.data.set(pixels)
      ctx.putImageData(imgData, 0, 0)

      const flipped = document.createElement('canvas')
      flipped.width = 512
      flipped.height = 1024
      const fCtx = flipped.getContext('2d')!
      fCtx.scale(1, -1)
      fCtx.drawImage(canvas, 0, -1024)

      // Cleanup
      target.dispose()
      tempScene.clear()

      return flipped.toDataURL('image/png')
    } catch (err) {
      console.error('LighthouseCapture failed:', err)
      return null
    }
  }, [gl])

  useEffect(() => {
    _captureFn = capture
    onCaptureReady(capture)
    return () => { _captureFn = null }
  }, [capture, onCaptureReady])

  return null
}
