import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { GRID_SHIFT_START } from './ScrollRig'
import { _planetWorldPositions, _mainPlanetIndices } from '../actors/DustField'
import { PLANET_LINKS } from '../types'

// Pre-allocated
const _projectScratch = new Vector3()

/**
 * PlanetClickHandler — NDC 投影行星点击检测（逐字保留自原 onClickCanvas）。
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
      if (sp < GRID_SHIFT_START) return

      // Reset auto-unfocus timer on any click (handled in DustField useFrame)
      const store = useScrollStore.getState()

      const rect = canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

      // Screen-space distance detection (same as hover)
      let bestDist = 1e9, bestPlanetIdx = -1
      for (let i = 0; i < _planetWorldPositions.length; i++) {
        const pos = _planetWorldPositions[i]
        if (!pos) continue

        _projectScratch.copy(pos).project(camera as PerspectiveCamera)
        const dx = (_projectScratch.x - ndcX) * (window.innerWidth / window.innerHeight)
        const dy = _projectScratch.y - ndcY
        const dist = Math.hypot(dx, dy)
        if (dist < bestDist) { bestDist = dist; bestPlanetIdx = i }
      }

      if (bestDist < 0.16 && bestPlanetIdx >= 0) {
        e.stopPropagation() // prevent window onClick fast-forward
        const particleIdx = _mainPlanetIndices[bestPlanetIdx]
        if (particleIdx !== undefined) {
          if (store.focusedPlanetIdx === particleIdx) {
            // Second click → open URL
            window.open(PLANET_LINKS[bestPlanetIdx].url, '_blank', 'noopener')
          } else {
            // First click → focus
            store.setFocusedPlanet(particleIdx)
            store.setFocusStartTime(0) // will be set by DustField useFrame
          }
        }
      } else {
        // Click missed planets → clear focus
        if (store.focusedPlanetIdx >= 0) {
          store.clearFocus()
        }
      }
    }

    canvas.addEventListener('click', onClickCanvas)
    return () => canvas.removeEventListener('click', onClickCanvas)
  }, [camera, gl])

  return null
}
