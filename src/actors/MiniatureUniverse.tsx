import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  FrontSide,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Group,
  type MeshBasicMaterial,
} from 'three'
import { useScrollStore } from '../stores/scrollStore'
import {
  getDirectedFaceAlignmentRotation,
  getMiniatureTransform,
  MINIATURE_CUBE_HALF_SIZE,
  MINIATURE_CUBE_SIZE,
  MINIATURE_PIVOT,
} from '../behaviors/miniatureUniverse'
import {
  miniatureFaceRectAnchorId,
  miniatureScreenBoundsAnchorId,
  setCoreAnchor,
} from '../composition/coreAnchors'
import { useAnchorStore } from '../composition/anchorStore'
import { TIMELINE } from '../composition/timeline'
import { chargeGates, CHARGE_GATE_POINTS, integrateHoldVelocity } from '../behaviors/chargeGates'

interface MiniatureUniverseProps {
  children: ReactNode
}

function bitCount(value: number): number {
  let count = 0
  for (let bit = value; bit > 0; bit >>= 1) count += bit & 1
  return count
}

function cornerPosition(index: number): [number, number, number] {
  const half = MINIATURE_CUBE_HALF_SIZE
  return [
    index & 1 ? half : -half,
    index & 2 ? half : -half,
    index & 4 ? half : -half,
  ]
}

export function buildMiniatureWireGeometry(): BufferGeometry {
  const positions: number[] = []
  const pathDistances: number[] = []

  for (let corner = 0; corner < 8; corner++) {
    const level = bitCount(corner)
    for (let axis = 0; axis < 3; axis++) {
      const axisMask = 1 << axis
      if (corner & axisMask) continue
      const target = corner | axisMask
      positions.push(...cornerPosition(corner), ...cornerPosition(target))
      pathDistances.push(level / 3, (level + 1) / 3)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aPathDistance', new BufferAttribute(new Float32Array(pathDistances), 1))
  geometry.computeBoundingSphere()
  return geometry
}

const wireVertexShader = /* glsl */`
  attribute float aPathDistance;
  varying float vPathDistance;

  void main() {
    vPathDistance = aPathDistance;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const wireFragmentShader = /* glsl */`
  precision highp float;
  uniform float uDrawProgress;
  uniform float uOpacity;
  varying float vPathDistance;

  void main() {
    if (vPathDistance > uDrawProgress) discard;
    gl_FragColor = vec4(0.86, 0.92, 1.0, uOpacity);
  }
`

export default function MiniatureUniverse({ children }: MiniatureUniverseProps) {
  const universeRef = useRef<Group>(null)
  const whiteMaterialRef = useRef<MeshBasicMaterial>(null)
  const wireGeometry = useMemo(buildMiniatureWireGeometry, [])
  const wireMaterial = useMemo(() => new ShaderMaterial({
    vertexShader: wireVertexShader,
    fragmentShader: wireFragmentShader,
    uniforms: {
      uDrawProgress: { value: 0 },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }), [])
  const spinEuler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), [])
  const faceEuler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), [])
  const faceQuaternion = useMemo(() => new Quaternion(), [])
  const lookMatrix = useMemo(() => new Matrix4(), [])
  const centerWorld = useMemo(() => new Vector3(), [])
  const cameraLocal = useMemo(() => new Vector3(), [])
  const quarterQuaternion = useMemo(() => new Quaternion(), [])
  const yAxis = useMemo(() => new Vector3(0, 1, 0), [])
  const rewindPose = useMemo(() => new Quaternion(), [])
  const rewindBlend = useRef(0)
  const holdMotion = useRef({ offset: [0, 0, 0], velocity: [0, 0, 0], previous: 0, released: false })
  const projectedCorners = useMemo(() => [
    new Vector3(), new Vector3(), new Vector3(), new Vector3(),
  ], [])
  const projectedBoundsCorners = useMemo(() => Array.from(
    { length: 8 },
    () => new Vector3(),
  ), [])

  useEffect(() => () => {
    wireGeometry.dispose()
    wireMaterial.dispose()
    useAnchorStore.getState().clearProducer('miniature')
  }, [wireGeometry, wireMaterial])

  useFrame((state, delta) => {
    const universe = universeRef.current
    if (!universe) return
    const sp = useScrollStore.getState().scrollProgress
    const transform = getMiniatureTransform(sp)

    const motion = holdMotion.current
    const dt = Math.min(.1, delta)
    const gate = CHARGE_GATE_POINTS[0]
    const reversing = sp < motion.previous - 1e-7
    const approach = Math.max(0, Math.min(1, (sp - (gate - .04)) / .04))
    const weight = approach * approach * (3 - 2 * approach)
    if (reversing || sp < gate - .04) {
      if (chargeGates.cubePose || motion.offset.some(v => v !== 0)) {
        rewindPose.copy(universe.quaternion)
        rewindBlend.current = 1
      }
      // Pause history must never change the authored camera/miniature path.
      motion.offset = [0, 0, 0]; motion.velocity = [0, 0, 0]
      motion.released = false; chargeGates.cubePose = null
    } else if (sp <= gate && approach > 0) {
      const time = state.clock.elapsedTime
      const speeds = [.075 * Math.cos(time * .23), .28, .06 * Math.sin(time * .19 + 1)]
      for (let i = 0; i < 3; i++) {
        const step = integrateHoldVelocity(motion.velocity[i], speeds[i] * weight, dt)
        motion.velocity[i] = step.velocity; motion.offset[i] += step.distance
      }
      chargeGates.cubePose = transform.rotation.map((v, i) => v + motion.offset[i]) as [number, number, number]
      motion.released = false
    }
    motion.previous = sp

    universe.scale.setScalar(transform.scale)
    spinEuler.set(...transform.rotation)
    universe.quaternion.setFromEuler(spinEuler)

    if (chargeGates.cubePose) {
      if (sp > gate) {
        for (let i = 0; i < 3; i++) {
          const step = integrateHoldVelocity(motion.velocity[i], 0, dt)
          motion.velocity[i] = step.velocity; chargeGates.cubePose[i] += step.distance
        }
      }
      spinEuler.set(...chargeGates.cubePose)
      universe.quaternion.setFromEuler(spinEuler)
    }

    if (transform.faceAlignProgress > 0) {
      universe.getWorldPosition(centerWorld)
      lookMatrix.lookAt(state.camera.position, centerWorld, state.camera.up)
      faceQuaternion.setFromRotationMatrix(lookMatrix)
      faceEuler.setFromQuaternion(faceQuaternion, 'XYZ')
      if (chargeGates.cubePose) {
        if (!motion.released) {
          // Choose the closest cube-symmetric face now; alignment happens in
          // the normal whitening interval, never in an extra waiting phase.
          let best = -1
          for (let turn = 0; turn < 4; turn++) {
            quarterQuaternion.setFromAxisAngle(yAxis, turn * Math.PI / 2)
            quarterQuaternion.premultiply(faceQuaternion)
            const score = Math.abs(universe.quaternion.dot(quarterQuaternion))
            if (score > best) { best = score; chargeGates.cubeFaceTurn = turn }
          }
          motion.released = true
        }
        quarterQuaternion.setFromAxisAngle(yAxis, chargeGates.cubeFaceTurn * Math.PI / 2)
        faceQuaternion.multiply(quarterQuaternion)
        universe.quaternion.slerp(faceQuaternion, transform.faceAlignProgress)
      } else {
        spinEuler.set(...getDirectedFaceAlignmentRotation(
          transform.rotation, [faceEuler.x, faceEuler.y, faceEuler.z], transform.faceAlignProgress,
        ))
        universe.quaternion.setFromEuler(spinEuler)
      }
    }

    if (rewindBlend.current > 0) {
      rewindBlend.current = Math.max(0, rewindBlend.current - dt / .3)
      const t = rewindBlend.current
      universe.quaternion.slerp(rewindPose, t * t * (3 - 2 * t))
    }
    wireMaterial.uniforms.uDrawProgress.value = transform.wireDrawProgress
    wireMaterial.uniforms.uOpacity.value = transform.wireOpacity
    if (whiteMaterialRef.current) whiteMaterialRef.current.opacity = transform.whiteFillProgress

    universe.updateWorldMatrix(true, false)
    const canvasRect = state.gl.domElement.getBoundingClientRect()

    if (sp >= TIMELINE.cubeAbsorptionTrails.start - 0.005 && sp <= TIMELINE.cubeWhiteFill.end) {
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      for (let index = 0; index < projectedBoundsCorners.length; index++) {
        const projected = projectedBoundsCorners[index]
        projected.set(...cornerPosition(index)).applyMatrix4(universe.matrixWorld).project(state.camera)
        const x = canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width
        const y = canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      setCoreAnchor(
        miniatureScreenBoundsAnchorId,
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        'cssPx',
        'miniature',
        true,
      )
    }

    if (sp < TIMELINE.cubeWhiteFill.start || sp > TIMELINE.squareSeedShrink.end) return
    const half = MINIATURE_CUBE_HALF_SIZE
    // Alignment can finish on any of the four side faces, not only local -Z.
    state.camera.getWorldPosition(cameraLocal)
    universe.worldToLocal(cameraLocal)
    const axis = Math.abs(cameraLocal.x) > Math.abs(cameraLocal.z) ? 0 : 2
    const sign = Math.sign(cameraLocal.getComponent(axis)) || 1
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (let index = 0; index < projectedCorners.length; index++) {
      const projected = projectedCorners[index]
      projected.set((index & 1 ? half : -half), (index & 2 ? half : -half), (index & 1 ? half : -half))
        .setComponent(axis, sign * half).applyMatrix4(universe.matrixWorld).project(state.camera)
      const x = canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width
      const y = canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }

    const side = Math.max(maxX - minX, maxY - minY)
    const centerX = (minX + maxX) * 0.5
    const centerY = (minY + maxY) * 0.5
    setCoreAnchor(
      miniatureFaceRectAnchorId,
      { x: centerX - side * 0.5, y: centerY - side * 0.5, width: side, height: side },
      'cssPx',
      'miniature',
      true,
    )
  })

  return (
    <group ref={universeRef} position={MINIATURE_PIVOT}>
      <lineSegments geometry={wireGeometry} material={wireMaterial} renderOrder={12} />
      <mesh renderOrder={11}>
        <boxGeometry args={[MINIATURE_CUBE_SIZE, MINIATURE_CUBE_SIZE, MINIATURE_CUBE_SIZE]} />
        <meshBasicMaterial
          ref={whiteMaterialRef}
          color="#ffffff"
          transparent
          opacity={0}
          depthTest
          depthWrite={false}
          side={FrontSide}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      <group position={[-MINIATURE_PIVOT[0], -MINIATURE_PIVOT[1], -MINIATURE_PIVOT[2]]}>
        {children}
      </group>
    </group>
  )
}
