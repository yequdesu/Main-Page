import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three'
import {
  getWindChimeCenterPoint,
  getWindChimeCenterPhysicalPoint,
  getWindChimeLineEndY,
  getWindChimeLinePoint,
  getWindChimePlanetPhysicalPoint,
  getWindChimePlanetPoint,
  getWindChimeProgress,
  WC_LINE_SEGMENTS,
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
    const result: Line[] = []
    for (let i = 0; i < 4; i++) {
      const positions = new Float32Array((WC_LINE_SEGMENTS + 1) * 3)
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(positions, 3))
      const material = new LineBasicMaterial({
        color: '#ffffff',
        transparent: layer.transparent,
        opacity: 0,
        depthTest: layer.depthTest,
        depthWrite: layer.depthWrite,
      })
      const line = new Line(geometry, material)
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
        ;(line.material as LineBasicMaterial).dispose()
      })
    }
  }, [lines])

  useFrame((state) => {
    const sp = useScrollStore.getState().scrollProgress
    const { smoothP } = getWindChimeProgress(sp)
    const curY = getWindChimeLineEndY(smoothP)
    const time = state.clock.elapsedTime
    const debugLines = []

    touchActorFrame('windChime', Math.round(performance.now()), smoothP > 0)

    for (let i = 0; i < 4; i++) {
      const point = i < 3
        ? getWindChimePlanetPhysicalPoint(i, smoothP, time)
        : getWindChimeCenterPhysicalPoint(smoothP, time)
      const basePoint = i < 3 ? getWindChimePlanetPoint(i, smoothP) : getWindChimeCenterPoint(smoothP)
      const line = lines[i]
      const position = line.geometry.getAttribute('position') as BufferAttribute
      const positions = position.array as Float32Array

      for (let segment = 0; segment <= WC_LINE_SEGMENTS; segment++) {
        const t = segment / WC_LINE_SEGMENTS
        const linePoint = getWindChimeLinePoint(i, smoothP, time, t, basePoint, { ...point, y: curY })
        const offset = segment * 3
        positions[offset] = linePoint.x
        positions[offset + 1] = linePoint.y
        positions[offset + 2] = linePoint.z
      }

      position.needsUpdate = true
      line.geometry.computeBoundingSphere()
      line.visible = smoothP > 0.001
      ;(line.material as LineBasicMaterial).opacity = Math.min(0.95, smoothP * 0.95)

      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        projectPoint.set(point.x, curY, point.z).project(camera)
        debugLines.push({
          index: i,
          hasAnchor: true,
          usedFallback: false,
          baseWorld: { x: basePoint.x, y: curY, z: basePoint.z },
          world: { x: point.x, y: curY, z: point.z },
          screen: {
            x: (projectPoint.x * 0.5 + 0.5) * gl.domElement.clientWidth,
            y: (-projectPoint.y * 0.5 + 0.5) * gl.domElement.clientHeight,
          },
          opacity: (line.material as LineBasicMaterial).opacity,
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
