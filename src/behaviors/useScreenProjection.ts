import { useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'
import { touchActorFrame } from '../composition/actorRuntime'
import {
  centralStarScreenAnchorId,
  makeCoreAnchor,
  planetScreenAnchorId,
  readPlanetWorldPoint,
  setCoreAnchor,
  setCoreAnchors,
  vector3FromPoint,
  type ScreenPoint,
} from '../composition/coreAnchors'
import type { AnchorInput } from '../composition/anchorStore'

/**
 * useScreenProjection �?将行星世界坐�?+ 中央恒星投影到屏幕坐标�?
 *
 * �?Planets.tsx �?useFrame 中调�?project()�?
 * 模块级预分配 Vector3，无额外堆分配�?
 *
 * 援引：Three.js Vector3.project() �?官方 API
 */

const _ndc = new Vector3()

/** 中央恒星世界位置 */
const CENTRAL_STAR_WORLD = new Vector3(0, -1.0, SCENE_CENTER_Z)
/** 中央恒星内层光晕世界半径（与 CentralStar.tsx INNER_GLOW_RADIUS 一致） */
const CENTRAL_STAR_WORLD_RADIUS = 0.42

export function useScreenProjection() {
  const { camera, gl } = useThree()

  const project = () => {
    touchActorFrame('projection', Math.round(performance.now()), true)
    const w = gl.domElement.clientWidth
    const h = gl.domElement.clientHeight
    const pcam = camera as PerspectiveCamera
    const fovY = (pcam.fov * Math.PI) / 180
    const halfTan = Math.tan(fovY / 2)

    // ---- 行星投影 ----
    const coords: [ScreenPoint, ScreenPoint, ScreenPoint] = [
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
      { x: 0, y: 0, visible: false },
    ]
    const anchorWrites: AnchorInput[] = []

    for (let i = 0; i < 3; i++) {
      const point = readPlanetWorldPoint(i)
      if (!point) {
        anchorWrites.push(makeCoreAnchor(planetScreenAnchorId(i), coords[i], 'screenPx', 'projection', false))
        continue
      }
      const pos = vector3FromPoint(point, _ndc)
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
      anchorWrites.push(makeCoreAnchor(planetScreenAnchorId(i), coords[i], 'screenPx', 'projection', coords[i].visible))
    }
    setCoreAnchors(anchorWrites)

    // ---- 中央恒星投影 ----
    CENTRAL_STAR_WORLD.z = SCENE_CENTER_Z
    _ndc.copy(CENTRAL_STAR_WORLD).project(camera)
    const csVisible = _ndc.z < 1
    if (csVisible) {
      const csx = ((_ndc.x + 1) / 2) * w
      const csy = ((-_ndc.y + 1) / 2) * h
      const cd = pcam.position.distanceTo(CENTRAL_STAR_WORLD)
      const csr = (CENTRAL_STAR_WORLD_RADIUS * h) / (2 * cd * halfTan)
      const screen = { x: csx, y: csy, r: Math.round(csr), visible: true }
      setCoreAnchor(centralStarScreenAnchorId, screen, 'screenPx', 'projection', true)
    } else {
      const screen = { x: 0, y: 0, r: 0, visible: false }
      setCoreAnchor(centralStarScreenAnchorId, screen, 'screenPx', 'projection', false)
    }
  }

  return { project }
}
