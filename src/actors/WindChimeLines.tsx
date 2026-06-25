import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CylinderGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import {
  getWindChimeCenterPoint,
  getWindChimeLineEndY,
  getWindChimePlanetPoint,
  getWindChimeProgress,
  WC_ANCHOR_Y,
} from '../behaviors/useWindChime'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { R3F_FRAME_PRIORITY } from '../composition/frameScheduler'
import { useScrollStore } from '../stores/scrollStore'

declare global {
  interface Window {
    __WIND_CHIME_DEBUG__?: unknown
  }
}

export default function WindChimeLines() {
  useActorRuntime('windChime', true)
  const { camera, gl } = useThree()
  const layer = getWebglLayer('webgl.windChime')
  const projectPoint = useRef(new Vector3()).current

  const lines = useMemo(() => {
    const result: Mesh[] = []
    for (let i = 0; i < 4; i++) {
      const geometry = new CylinderGeometry(0.012, 0.012, 1, 8, 1)
      const material = new MeshBasicMaterial({
        color: '#ffffff',
        transparent: layer.transparent,
        opacity: 0,
        depthTest: layer.depthTest,
        depthWrite: layer.depthWrite,
      })
      const line = new Mesh(geometry, material)
      line.renderOrder = layer.renderOrder
      line.visible = false
      result.push(line)
    }
    return result
  }, [layer.depthTest, layer.depthWrite, layer.renderOrder, layer.transparent])

  useEffect(() => {
    return () => {
      lines.forEach((line) => {
        line.geometry.dispose()
        ;(line.material as MeshBasicMaterial).dispose()
      })
    }
  }, [lines])

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    const { smoothP } = getWindChimeProgress(sp)
    const curY = getWindChimeLineEndY(smoothP)
    const debugLines = []

    touchActorFrame('windChime', Math.round(performance.now()), smoothP > 0)

    for (let i = 0; i < 4; i++) {
      const point = i < 3 ? getWindChimePlanetPoint(i, smoothP) : getWindChimeCenterPoint(smoothP)
      const line = lines[i]
      const length = Math.max(0.001, WC_ANCHOR_Y - curY)

      line.position.set(point.x, curY + length / 2, point.z)
      line.scale.set(1, length, 1)
      line.visible = smoothP > 0.001
      ;(line.material as MeshBasicMaterial).opacity = Math.min(0.95, smoothP * 0.95)

      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        projectPoint.set(point.x, curY, point.z).project(camera)
        debugLines.push({
          index: i,
          hasAnchor: true,
          usedFallback: false,
          world: { x: point.x, y: curY, z: point.z },
          screen: {
            x: (projectPoint.x * 0.5 + 0.5) * gl.domElement.clientWidth,
            y: (-projectPoint.y * 0.5 + 0.5) * gl.domElement.clientHeight,
          },
          opacity: (line.material as MeshBasicMaterial).opacity,
        })
      }
    }

    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      const debug = { sp, smoothP, curY, lines: debugLines }
      window.__WIND_CHIME_DEBUG__ = debug
      document.documentElement.dataset.windChimeDebug = JSON.stringify(debug)
    }
  }, R3F_FRAME_PRIORITY.windChimeConsume)

  return (
    <group>
      {lines.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  )
}
