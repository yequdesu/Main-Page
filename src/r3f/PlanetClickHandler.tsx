import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector3, Vector2, Raycaster, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { TIMELINE } from '../composition/timeline'
import { readPlanetParticleIndex, readPlanetWorldPoint, vector3FromPoint } from '../composition/coreAnchors'
import { voyagerState } from '../actors/voyagerState'
import { PLANET_LINKS } from '../types'

// Pre-allocated
const _projectScratch = new Vector3()
const _cameraSpace = new Vector3()
const _clickNdc = new Vector2()
const _voyagerRaycaster = new Raycaster()

/**
 * PlanetClickHandler — 屏幕投影的行星与飞行器点击检测。
 *
 * R3F 默认 raycasting 对 0.015 半径球体不可靠，使用屏幕空间 NDC 投影
 * 匹配原版 Hover 检测逻辑。
 *
 * 援引：原 LighthouseScene.vue onClickCanvas():1419-1458
 */
export default function PlanetClickHandler() {
  const { camera, gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    if (!canvas) return

    const onClickCanvas = (e: MouseEvent) => {
      const sp = useScrollStore.getState().scrollProgress
      if (sp < TIMELINE.act3Shift.start || useScrollStore.getState().structureProgress > 0) return

      const store = useScrollStore.getState()

      const rect = canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

      // Screen-space distance detection (same as hover)
      let bestDist = 1e9, bestPlanetIdx = -1
      for (let i = 0; i < 3; i++) {
        const pos = readPlanetWorldPoint(i)
        if (!pos) continue

        vector3FromPoint(pos, _projectScratch).project(camera as PerspectiveCamera)
        const dx = (_projectScratch.x - ndcX) * (rect.width / rect.height)
        const dy = _projectScratch.y - ndcY
        const dist = Math.hypot(dx, dy)
        if (dist < bestDist) { bestDist = dist; bestPlanetIdx = i }
      }

      if (voyagerState.available && voyagerState.opacity > 0.02) {
        _projectScratch.copy(voyagerState.position).project(camera)
        _cameraSpace.copy(voyagerState.position).applyMatrix4(camera.matrixWorldInverse)
        const distancePx = Math.hypot((_projectScratch.x - ndcX) * rect.width / 2, (_projectScratch.y - ndcY) * rect.height / 2)
        const radiusPx = voyagerState.hitRadius * rect.height / (2 * Math.tan((camera as PerspectiveCamera).fov * Math.PI / 360) * Math.max(0.01, -_cameraSpace.z))
        _voyagerRaycaster.setFromCamera(_clickNdc.set(ndcX, ndcY), camera)
        const coreHit = _voyagerRaycaster.intersectObjects(voyagerState.hitTargets, false).length > 0
        // 近景只命中天线/基座实际网格；远景保留核心周围的小目标点击余量。
        const hit = coreHit || (!store.focusedVoyager && distancePx < Math.max(16, radiusPx))
        if (_projectScratch.z >= -1 && _projectScratch.z <= 1 && hit
          && (bestDist >= 0.16 || distancePx < bestDist * rect.height / 2)) {
          e.stopPropagation()
          if (!store.focusedVoyager) store.focusVoyager()
          return
        }
      }

      if (bestDist < 0.16 && bestPlanetIdx >= 0) {
        e.stopPropagation() // prevent window onClick fast-forward
        const particleIdx = readPlanetParticleIndex(bestPlanetIdx)
        if (particleIdx !== undefined) {
          if (store.focusedPlanetIdx === particleIdx) {
            // Second click → open URL
            window.open(PLANET_LINKS[bestPlanetIdx].url, '_blank', 'noopener')
          } else {
            // First click → focus
            store.setFocusedPlanet(particleIdx)
          }
        }
      } else {
        // Click missed planets → clear focus
        if (store.focusedPlanetIdx >= 0 || store.focusedVoyager) {
          store.clearFocus()
        }
      }
    }

    canvas.addEventListener('click', onClickCanvas)
    return () => canvas.removeEventListener('click', onClickCanvas)
  }, [camera, gl])

  return null
}
