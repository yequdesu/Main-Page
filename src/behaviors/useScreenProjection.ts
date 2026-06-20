import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useRealtimeStore, type ScreenCoord } from '../stores/realtimeStore'

/**
 * useScreenProjection — 将 _planetWorldPositions 投影到屏幕坐标。
 *
 * 在 Planets.tsx 的 useFrame 中调用 project()。
 * 每帧 3 次 Vector3.project()，模块级预分配 _ndc，无额外堆分配。
 *
 * 援引：Three.js Vector3.project() — 官方 API
 */

const _ndc = new Vector3()

export function useScreenProjection(worldPositions: (Vector3 | null)[]) {
  const { camera, gl } = useThree()
  const store = useRealtimeStore.getState

  const project = () => {
    const w = gl.domElement.clientWidth
    const h = gl.domElement.clientHeight

    const coords: [ScreenCoord, ScreenCoord, ScreenCoord] = [
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
    ]

    for (let i = 0; i < 3; i++) {
      const pos = worldPositions[i]
      if (!pos) continue

      _ndc.copy(pos).project(camera)

      // NDC.z < 1 表示在相机前方；±1.2 margin 避免边缘闪烁
      const visible =
        _ndc.z < 1 &&
        _ndc.x > -1.2 && _ndc.x < 1.2 &&
        _ndc.y > -1.2 && _ndc.y < 1.2

      if (visible) {
        coords[i] = {
          // NDC [-1,1] → 屏幕像素 [0, viewportSize]
          x: ((_ndc.x + 1) / 2) * w,
          // NDC Y 向上，屏幕 Y 向下 → 翻转
          y: ((-_ndc.y + 1) / 2) * h,
          visible: true,
        }
      }
    }

    store().setScreenCoords(coords)
  }

  return { project }
}
