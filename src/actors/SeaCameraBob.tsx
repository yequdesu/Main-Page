import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Euler, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { TIMELINE } from '../composition/timeline'
import { SCENE_CENTER_Z, clamped, smoothstep } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

const BASE_CAMERA_POS = new Vector3(0, 0.25, 8)
const BASE_LOOK_AT = new Vector3(0, -0.65, SCENE_CENTER_Z - 8)
const _targetPos = new Vector3()
const _targetLookAt = new Vector3()
const _baseQuat = new Quaternion()
const _motionQuat = new Quaternion()
const _motionEuler = new Euler(0, 0, 0, 'YXZ')

function seaBobStrength(sp: number): number {
  if (sp >= TIMELINE.act1OceanVoyage.end) return 0
  return 1 - smoothstep(clamped(sp, 0.28, TIMELINE.act1OceanVoyage.end))
}

function layeredWave(time: number, a: number, b: number, c: number): number {
  return (
    Math.sin(time * a) * 0.58 +
    Math.sin(time * b + 1.7) * 0.30 +
    Math.sin(time * c + 4.1) * 0.12
  )
}

function signedNoiseWave(time: number, a: number, b: number, phase: number): number {
  return Math.sin(time * a + phase) * 0.72 + Math.sin(time * b + phase * 1.91) * 0.28
}

export default function SeaCameraBob() {
  useActorRuntime('seaCameraBob', true)
  const restoredRef = useRef(false)

  useFrame(({ camera, clock }) => {
    const sp = useScrollStore.getState().scrollProgress
    const strength = seaBobStrength(sp)
    if (sp >= TIMELINE.act1OceanVoyage.end) {
      if (!restoredRef.current && sp < TIMELINE.act2SquareTransition.end) {
        camera.position.copy(BASE_CAMERA_POS)
        ;(camera as PerspectiveCamera).lookAt(BASE_LOOK_AT)
        restoredRef.current = true
      }
      touchActorFrame('seaCameraBob', Math.round(clock.elapsedTime * 60), false)
      return
    }
    restoredRef.current = false

    const time = clock.elapsedTime
    const swell = layeredWave(time, 0.58, 0.94, 1.43)
    const crossSwell = signedNoiseWave(time, 0.42, 0.77, 2.4)
    const chop = signedNoiseWave(time, 1.35, 2.16, 0.8)
    const heave = swell * 0.72 + chop * 0.28
    const sway = crossSwell * 0.68 + Math.sin(time * 0.29 + 4.2) * 0.32
    const surge = Math.sin(time * 0.36 + 1.1) * 0.60 + Math.sin(time * 0.83 + 5.6) * 0.40
    const pitch = swell * 0.62 + Math.sin(time * 1.08 + 2.2) * 0.38
    const roll = crossSwell * 0.74 + chop * 0.26
    const yaw = Math.sin(time * 0.31 + 3.0) * 0.65 + Math.sin(time * 0.66 + 0.4) * 0.35

    _targetPos.set(
      BASE_CAMERA_POS.x + sway * 0.20 * strength,
      BASE_CAMERA_POS.y + heave * 0.27 * strength,
      BASE_CAMERA_POS.z + surge * 0.17 * strength,
    )
    _targetLookAt.set(
      BASE_LOOK_AT.x + yaw * 0.54 * strength + sway * 0.12 * strength,
      BASE_LOOK_AT.y + pitch * 0.26 * strength,
      BASE_LOOK_AT.z,
    )

    camera.position.copy(_targetPos)
    ;(camera as PerspectiveCamera).lookAt(_targetLookAt)
    _baseQuat.copy(camera.quaternion)
    _motionEuler.set(
      pitch * 0.009 * strength,
      yaw * 0.006 * strength,
      roll * 0.028 * strength,
    )
    _motionQuat.setFromEuler(_motionEuler)
    camera.quaternion.copy(_baseQuat).multiply(_motionQuat)
    touchActorFrame('seaCameraBob', Math.round(time * 60), strength > 0.001)
  })

  return null
}
