import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  MeshBasicMaterial,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { getCircleConnector } from '../behaviors/motionTrail'
import {
  buildRandomAbsorptionTrailBatch,
  getAbsorptionTrailFrame,
  type AbsorptionCircle,
} from '../behaviors/miniatureAbsorptionTrails'
import {
  getMiniatureTransform,
  MINIATURE_CUBE_HALF_SIZE,
  MINIATURE_PIVOT,
} from '../behaviors/miniatureUniverse'
import { SQUARE_WAVE_SEED_SCALE } from '../behaviors/squareWaveTransition'
import { useAnchorStore, type Anchor } from '../composition/anchorStore'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import {
  miniatureFaceRectAnchorId,
  miniatureScreenBoundsAnchorId,
} from '../composition/coreAnchors'
import type { LayoutBox, Point2 } from '../composition/coordinate'
import { getWebglLayer } from '../composition/layerRegistry'
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'
import { useScrollStore } from '../stores/scrollStore'

const CIRCLE_SEGMENTS = 12
const MAX_TRACKS = 192
const MAX_CIRCLES_PER_TRACK = 14
const MAX_VERTICES_PER_TRACK = MAX_CIRCLES_PER_TRACK * CIRCLE_SEGMENTS * 3 +
  (MAX_CIRCLES_PER_TRACK - 1) * 6
const MAX_VERTICES = MAX_TRACKS * MAX_VERTICES_PER_TRACK

function createRuntimeSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    if (values[0] !== 0) return values[0]
  }
  return Math.max(1, Math.floor(Math.random() * 0xffff_ffff))
}

function getTargetBounds(
  scrollProgress: number,
  boundsAnchor: Anchor<LayoutBox> | undefined,
  faceRectAnchor: Anchor<LayoutBox> | undefined,
): LayoutBox | undefined {
  let bounds = boundsAnchor?.value
  if (scrollProgress > TIMELINE.cubeWhiteFill.end && faceRectAnchor?.value) {
    const faceRect = faceRectAnchor.value
    const seedShrink = smoothstep01(progress('squareSeedShrink', scrollProgress))
    const scale = 1 + (SQUARE_WAVE_SEED_SCALE - 1) * seedShrink
    const centerX = faceRect.x + faceRect.width * 0.5
    const centerY = faceRect.y + faceRect.height * 0.5
    bounds = {
      x: centerX - faceRect.width * scale * 0.5,
      y: centerY - faceRect.height * scale * 0.5,
      width: faceRect.width * scale,
      height: faceRect.height * scale,
    }
  }
  return bounds
}

export default function MiniatureAbsorptionTrails() {
  const meshRef = useRef<Mesh>(null)
  const batch = useMemo(() => buildRandomAbsorptionTrailBatch(createRuntimeSeed()), [])
  const layer = getWebglLayer('webgl.miniatureAbsorptionTrails')
  const positionArray = useMemo(() => new Float32Array(MAX_VERTICES * 3), [])
  const geometry = useMemo(() => {
    const next = new BufferGeometry()
    const position = new BufferAttribute(positionArray, 3)
    position.setUsage(DynamicDrawUsage)
    next.setAttribute('position', position)
    next.setDrawRange(0, 0)
    return next
  }, [positionArray])
  const material = useMemo(() => new MeshBasicMaterial({
    color: '#f2f6ff',
    transparent: layer.transparent,
    opacity: 1,
    depthTest: layer.depthTest,
    depthWrite: layer.depthWrite,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  }), [layer.depthTest, layer.depthWrite, layer.transparent])
  const cameraForward = useMemo(() => new Vector3(), [])
  const cameraRight = useMemo(() => new Vector3(), [])
  const cameraUp = useMemo(() => new Vector3(), [])
  const planeCenter = useMemo(() => new Vector3(), [])
  const cubeCenter = useMemo(() => new Vector3(...MINIATURE_PIVOT), [])
  const centerOffset = useMemo(() => new Vector3(), [])
  useActorRuntime('miniatureAbsorptionTrails', false)

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame(({ camera, gl, clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const scrollProgress = useScrollStore.getState().scrollProgress
    const active = scrollProgress >= TIMELINE.cubeAbsorptionTrails.start &&
      scrollProgress < TIMELINE.cubeAbsorptionTrails.end
    if (!active) {
      mesh.visible = false
      geometry.setDrawRange(0, 0)
      touchActorFrame('miniatureAbsorptionTrails', Math.round(clock.elapsedTime * 60), false)
      return
    }

    const anchors = useAnchorStore.getState().anchors
    const bounds = getTargetBounds(
      scrollProgress,
      anchors[miniatureScreenBoundsAnchorId] as Anchor<LayoutBox> | undefined,
      anchors[miniatureFaceRectAnchorId] as Anchor<LayoutBox> | undefined,
    )
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      mesh.visible = false
      geometry.setDrawRange(0, 0)
      return
    }

    const canvasRect = gl.domElement.getBoundingClientRect()
    const width = Math.max(1, canvasRect.width)
    const height = Math.max(1, canvasRect.height)
    const pcam = camera as PerspectiveCamera
    camera.getWorldDirection(cameraForward).normalize()
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    const centerDepth = centerOffset.copy(cubeCenter).sub(camera.position).dot(cameraForward)
    const miniature = getMiniatureTransform(scrollProgress)
    const cubeRadius = MINIATURE_CUBE_HALF_SIZE * Math.sqrt(3) * miniature.scale
    const planeDepth = Math.max(pcam.near + 0.1, centerDepth + cubeRadius + 0.35)
    planeCenter.copy(camera.position).addScaledVector(cameraForward, planeDepth)
    const worldUnitsPerPixel = 2 * planeDepth * Math.tan((pcam.fov * Math.PI) / 360) / height
    let vertexCount = 0

    const pushVertex = (point: Point2) => {
      if (vertexCount >= MAX_VERTICES) return
      const xOffset = (point.x - canvasRect.left - width * 0.5) * worldUnitsPerPixel
      const yOffset = -(point.y - canvasRect.top - height * 0.5) * worldUnitsPerPixel
      const offset = vertexCount * 3
      positionArray[offset] = planeCenter.x + cameraRight.x * xOffset + cameraUp.x * yOffset
      positionArray[offset + 1] = planeCenter.y + cameraRight.y * xOffset + cameraUp.y * yOffset
      positionArray[offset + 2] = planeCenter.z + cameraRight.z * xOffset + cameraUp.z * yOffset
      vertexCount += 1
    }
    const pushTriangle = (a: Point2, b: Point2, c: Point2) => {
      pushVertex(a)
      pushVertex(b)
      pushVertex(c)
    }
    const pushCircle = (circle: AbsorptionCircle) => {
      if (circle.radius <= 0.01) return
      for (let segment = 0; segment < CIRCLE_SEGMENTS; segment += 1) {
        const angleA = segment / CIRCLE_SEGMENTS * Math.PI * 2
        const angleB = (segment + 1) / CIRCLE_SEGMENTS * Math.PI * 2
        pushTriangle(
          circle.point,
          {
            x: circle.point.x + Math.cos(angleA) * circle.radius,
            y: circle.point.y + Math.sin(angleA) * circle.radius,
          },
          {
            x: circle.point.x + Math.cos(angleB) * circle.radius,
            y: circle.point.y + Math.sin(angleB) * circle.radius,
          },
        )
      }
    }
    const pushTrack = (circles: readonly AbsorptionCircle[]) => {
      for (let index = 1; index < circles.length; index += 1) {
        const connector = getCircleConnector(circles[index - 1], circles[index])
        if (!connector) continue
        const a = connector.firstPositive
        const b = connector.secondPositive
        const c = connector.secondNegative
        const d = connector.firstNegative
        pushTriangle(a, b, c)
        pushTriangle(a, c, d)
      }
      for (const circle of circles) pushCircle(circle)
    }

    for (const spec of batch.specs) {
      const frame = getAbsorptionTrailFrame(
        spec,
        scrollProgress,
        window.innerWidth,
        window.innerHeight,
        bounds,
      )
      if (frame.active) pushTrack(frame.circles)
    }

    const position = geometry.getAttribute('position') as BufferAttribute
    position.needsUpdate = true
    geometry.setDrawRange(0, vertexCount)
    mesh.visible = vertexCount > 0
    touchActorFrame('miniatureAbsorptionTrails', Math.round(clock.elapsedTime * 60), vertexCount > 0)
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      renderOrder={layer.renderOrder}
      frustumCulled={false}
      visible={false}
    />
  )
}
