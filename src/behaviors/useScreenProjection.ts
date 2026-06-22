import { useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { useRealtimeStore, type ScreenCoord } from '../stores/realtimeStore'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

/**
 * useScreenProjection — 将行星世界坐标 + 中央恒星投影到屏幕坐标。
 *
 * 在 Planets.tsx 的 useFrame 中调用 project()。
 * 模块级预分配 Vector3，无额外堆分配。
 *
 * 援引：Three.js Vector3.project() — 官方 API
 */

const _ndc = new Vector3()

/** 中央恒星世界位置 */
const CENTRAL_STAR_WORLD = new Vector3(0, -1.0, SCENE_CENTER_Z)
/** 中央恒星内层光晕世界半径（与 CentralStar.tsx INNER_GLOW_RADIUS 一致） */
const CENTRAL_STAR_WORLD_RADIUS = 0.70

export function useScreenProjection(worldPositions: (Vector3 | null)[]) {
  const { camera, gl } = useThree()
  const store = useRealtimeStore.getState

  const project = () => {
    const w = gl.domElement.clientWidth
    const h = gl.domElement.clientHeight
    const pcam = camera as PerspectiveCamera
    const fovY = (pcam.fov * Math.PI) / 180
    const halfTan = Math.tan(fovY / 2)

    // ---- 行星投影 ----
    const coords: [ScreenCoord, ScreenCoord, ScreenCoord] = [
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
    ]

    for (let i = 0; i < 3; i++) {
      const pos = worldPositions[i]
      if (!pos) continue
      _ndc.copy(pos).project(camera)
      const visible =
        _ndc.z < 1 &&
        _ndc.x > -1.2 && _ndc.x < 1.2 &&
        _ndc.y > -1.2 && _ndc.y < 1.2
      if (visible) {
        coords[i] = {
          x: ((_ndc.x + 1) / 2) * w,
          y: ((-_ndc.y + 1) / 2) * h,
          visible: true,
        }
      }
    }
    store().setScreenCoords(coords)

    // ---- 中央恒星投影 ----
    _ndc.copy(CENTRAL_STAR_WORLD).project(camera)
    const csVisible = _ndc.z < 1
    if (csVisible) {
      const csx = ((_ndc.x + 1) / 2) * w
      const csy = ((-_ndc.y + 1) / 2) * h
      const cd = pcam.position.distanceTo(CENTRAL_STAR_WORLD)
      const csr = (CENTRAL_STAR_WORLD_RADIUS * h) / (2 * cd * halfTan)
      store().setCentralStarScreen({ x: csx, y: csy, r: Math.round(csr), visible: true })
    } else {
      store().setCentralStarScreen({ x: 0, y: 0, r: 0, visible: false })
    }
  }

  return { project }
}
