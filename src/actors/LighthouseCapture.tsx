import { useEffect, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight } from 'three'
import { _lighthouseGroupRef } from './Lighthouse'

// Module-level getter — App.tsx reads this to trigger capture
let _captureFn: (() => string | null) | null = null
export function getLighthouseCapture(): (() => string | null) | null {
  return _captureFn
}

/**
 * LighthouseCapture — 使用独立 WebGLRenderer 离屏渲染灯塔截图。
 *
 * 原 captureLighthouse():1473-1520 — 逐字保留算法：
 *   1. 独立 renderer（alpha: true, preserveDrawingBuffer: true, pixelRatio: 1）
 *   2. 灯塔居中于原点（Y 居中 ≈ -0.965）
 *   3. FOV=25，相机 (0, 0, 9) → lookAt(0, 0, 0)
 *   4. toDataURL 直接输出（无需像素翻转）
 *
 * 援引：Three.js WebGLRenderer.toDataURL（官方 API）
 */
interface CaptureProps {
  onCaptureReady: (capture: () => string | null) => void
}

export default function LighthouseCapture({ onCaptureReady }: CaptureProps) {
  const capture = useCallback((): string | null => {
    try {
      const lighthouseGroup = _lighthouseGroupRef
      if (!lighthouseGroup) {
        console.warn('LighthouseCapture: lighthouse not mounted yet')
        return null
      }

      const captureW = 512, captureH = 1024

      // Independent renderer（逐字保留自原版）
      const offRenderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
      offRenderer.setSize(captureW, captureH)
      offRenderer.setPixelRatio(1)
      offRenderer.setClearColor(0x000000, 0)

      // Clone lighthouse and center it at origin
      const clone = lighthouseGroup.clone(true)
      clone.position.set(0, -0.965, 0) // center Y: foundation ~-0.63, spire ~2.56 → mid ≈ 0.965
      clone.scale.copy(lighthouseGroup.scale)

      const tempScene = new Scene()
      tempScene.add(clone)

      // Lighting for MeshStandardMaterials（逐字保留自原版）
      tempScene.add(new AmbientLight('#ffffff', 1.8))
      const key = new DirectionalLight('#ffffff', 2.2)
      key.position.set(4, 6, 8)
      tempScene.add(key)
      const fill = new DirectionalLight('#c8d6ff', 1.0)
      fill.position.set(-4, 2, 4)
      tempScene.add(fill)

      // Camera: narrow FOV, centered on lighthouse（逐字保留自原版）
      const capCam = new PerspectiveCamera(25, captureW / captureH, 0.1, 50)
      capCam.position.set(0, 0, 9)
      capCam.lookAt(0, 0, 0)

      // Render and capture directly from renderer canvas
      offRenderer.render(tempScene, capCam)
      const dataUrl = offRenderer.domElement.toDataURL('image/png')

      // Cleanup
      offRenderer.dispose()
      clone.traverse((c) => {
        if ((c as any).geometry) (c as any).geometry.dispose()
        if ((c as any).material) {
          const mat = (c as any).material
          if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose())
          else mat.dispose()
        }
      })

      return dataUrl
    } catch (err) {
      console.error('LighthouseCapture failed:', err)
      return null
    }
  }, [])

  useEffect(() => {
    _captureFn = capture
    onCaptureReady(capture)
    return () => { _captureFn = null }
  }, [capture, onCaptureReady])

  return null
}
