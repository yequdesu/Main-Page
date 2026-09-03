import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import { TIMELINE } from '../composition/timeline'
import {
  act3ContourTargetAnchorId,
  centralStarScreenAnchorId,
  planetScreenAnchorId,
  planetScreenRadiusAnchorId,
  readAnchorValue,
  setCoreAnchor,
  type Act3ContourTarget,
  type ScreenCircle,
  type ScreenPoint,
} from '../composition/coreAnchors'
import { useAnchorStore } from '../composition/anchorStore'
import { ACT3_TERMINAL_CENTER, ACT3_TERMINAL_LAYOUT } from '../behaviors/act3TerminalLayout'
import { useActorRuntime } from '../composition/actorRuntime'

const ORBIT_SEGMENTS = 96

export default function Act3ContourProjection() {
  const { camera, gl } = useThree()
  const lastSignatureRef = useRef('')
  const scrollProgress = useScrollStore((state) => state.scrollProgress)
  const active = scrollProgress >= TIMELINE.squareTitleTyping.start &&
    scrollProgress <= TIMELINE.squareAct3Crossfade.end
  useActorRuntime('act3ContourProjection', active)

  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    if (sp < TIMELINE.squareTitleTyping.start || sp > TIMELINE.squareAct3Crossfade.end) return

    const width = gl.domElement.clientWidth
    const height = gl.domElement.clientHeight
    if (width <= 0 || height <= 0) return

    const central = readAnchorValue<ScreenCircle>(centralStarScreenAnchorId)
    if (!central?.visible || central.r <= 0) return

    const planets: ScreenCircle[] = []
    for (let index = 0; index < 3; index++) {
      const point = readAnchorValue<ScreenPoint>(planetScreenAnchorId(index))
      const radius = readAnchorValue<number>(planetScreenRadiusAnchorId(index))
      if (point?.visible && radius && radius > 0) {
        planets.push({ x: point.x, y: point.y, r: radius, visible: true })
      }
    }
    if (planets.length < 3) return

    const signature = [
      width,
      height,
      ...camera.matrixWorld.elements.map((value) => value.toFixed(4)),
      central.x.toFixed(1), central.y.toFixed(1), central.r.toFixed(1),
      ...planets.flatMap((body) => [body.x.toFixed(1), body.y.toFixed(1), body.r.toFixed(1)]),
    ].join('|')
    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature

    const orbits = ACT3_TERMINAL_LAYOUT.planets.map((planet) => {
      const points: Array<{ x: number; y: number }> = []
      for (let segment = 0; segment <= ORBIT_SEGMENTS; segment++) {
        const angle = (segment / ORBIT_SEGMENTS) * Math.PI * 2
        const projected = new Vector3(
          ACT3_TERMINAL_CENTER.x + Math.cos(angle) * planet.orbitRadius,
          ACT3_TERMINAL_CENTER.y,
          ACT3_TERMINAL_CENTER.z + Math.sin(angle) * planet.orbitRadius,
        ).project(camera)
        points.push({
          x: (projected.x * 0.5 + 0.5) * width,
          y: (-projected.y * 0.5 + 0.5) * height,
        })
      }
      return { points }
    })

    const target: Act3ContourTarget = {
      width,
      height,
      central,
      planets,
      orbits: [...orbits],
    }
    setCoreAnchor(act3ContourTargetAnchorId, target, 'cssPx', 'act3ContourProjection')
  }, -15)

  useEffect(() => () => {
    useAnchorStore.getState().clearProducer('act3ContourProjection')
  }, [])

  return null
}
