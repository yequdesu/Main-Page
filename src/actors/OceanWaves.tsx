import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  ClampToEdgeWrapping,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { useScrollStore } from '../stores/scrollStore'
import { SCENE_CENTER_Z, clamped, smoothstep } from '../r3f/ScrollRig'
import { TIMELINE } from '../composition/timeline'
import { getWebglLayer } from '../composition/layerRegistry'
import { touchActorFrame, useActorRuntime } from '../composition/actorRuntime'
import { readBeamWorldDirection, readBeamWorldOrigin } from '../composition/coreAnchors'
import {
  LIGHTHOUSE_LAMP_WORLD_Y,
  LIGHTHOUSE_MODEL_SCALE,
  LIGHTHOUSE_MODEL_URL,
} from './Lighthouse'
import {
  buildReefObstacleMask,
  buildReefProximityField,
  OCEAN_BOUNDS,
  OCEAN_CENTER_Z,
} from '../behaviors/reefObstacleMask'
import {
  MINIATURE_CUBE_HALF_SIZE,
  MINIATURE_PIVOT,
} from '../behaviors/miniatureUniverse'
import {
  stylizedOceanFragmentShader,
  stylizedOceanVolumeFragmentShader,
  stylizedOceanVolumeVertexShader,
  stylizedOceanVertexShader,
} from '../shaders/StylizedOceanShader'

const REEF_FIELD_RESOLUTION = 768
const SURFACE_SEGMENTS = 512
const OCEAN_BASE_Y = -2.18
const OCEAN_VOLUME_BOTTOM_Y = MINIATURE_PIVOT[1] - MINIATURE_CUBE_HALF_SIZE + 0.1
const OCEAN_VOLUME_DEPTH = OCEAN_BASE_Y - OCEAN_VOLUME_BOTTOM_Y
const OCEAN_WIDTH = OCEAN_BOUNDS.maxX - OCEAN_BOUNDS.minX
const OCEAN_DEPTH = OCEAN_BOUNDS.maxZ - OCEAN_BOUNDS.minZ
const DEFAULT_BEAM_ORIGIN = new Vector3(0, LIGHTHOUSE_LAMP_WORLD_Y, SCENE_CENTER_Z)
const DEFAULT_BEAM_DIRECTION = new Vector3(0, 0, 1)

interface OceanEdge {
  from: readonly [number, number]
  to: readonly [number, number]
}

function buildOceanVolumeGeometry(segments: number): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const surfaceEdges: number[] = []
  const indices: number[] = []
  const edges: OceanEdge[] = [
    { from: [OCEAN_BOUNDS.minX, OCEAN_BOUNDS.maxZ], to: [OCEAN_BOUNDS.maxX, OCEAN_BOUNDS.maxZ] },
    { from: [OCEAN_BOUNDS.maxX, OCEAN_BOUNDS.maxZ], to: [OCEAN_BOUNDS.maxX, OCEAN_BOUNDS.minZ] },
    { from: [OCEAN_BOUNDS.maxX, OCEAN_BOUNDS.minZ], to: [OCEAN_BOUNDS.minX, OCEAN_BOUNDS.minZ] },
    { from: [OCEAN_BOUNDS.minX, OCEAN_BOUNDS.minZ], to: [OCEAN_BOUNDS.minX, OCEAN_BOUNDS.maxZ] },
  ]

  for (const edge of edges) {
    const edgeVertexStart = positions.length / 3
    for (let index = 0; index <= segments; index++) {
      const t = index / segments
      const x = edge.from[0] + (edge.to[0] - edge.from[0]) * t
      const z = edge.from[1] + (edge.to[1] - edge.from[1]) * t
      positions.push(x, OCEAN_BASE_Y, z, x, OCEAN_VOLUME_BOTTOM_Y, z)
      surfaceEdges.push(1, 0)
    }
    for (let index = 0; index < segments; index++) {
      const topA = edgeVertexStart + index * 2
      const bottomA = topA + 1
      const topB = topA + 2
      const bottomB = topA + 3
      indices.push(topA, bottomA, topB, topB, bottomA, bottomB)
    }
  }

  const bottomStart = positions.length / 3
  positions.push(
    OCEAN_BOUNDS.minX, OCEAN_VOLUME_BOTTOM_Y, OCEAN_BOUNDS.maxZ,
    OCEAN_BOUNDS.maxX, OCEAN_VOLUME_BOTTOM_Y, OCEAN_BOUNDS.maxZ,
    OCEAN_BOUNDS.maxX, OCEAN_VOLUME_BOTTOM_Y, OCEAN_BOUNDS.minZ,
    OCEAN_BOUNDS.minX, OCEAN_VOLUME_BOTTOM_Y, OCEAN_BOUNDS.minZ,
  )
  surfaceEdges.push(0, 0, 0, 0)
  indices.push(
    bottomStart, bottomStart + 2, bottomStart + 1,
    bottomStart, bottomStart + 3, bottomStart + 2,
  )

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aSurfaceEdge', new BufferAttribute(new Float32Array(surfaceEdges), 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 2
  return geometry
}

/**
 * A fully three-dimensional procedural ocean. Broad Gerstner waves provide
 * the silhouette while a reef proximity field adds local compression,
 * reflected ripples and contact foam. All animation is continuous in time, so
 * the surface remains stable while the miniature scene rotates.
 */
export default function OceanWaves() {
  useActorRuntime('waves', true)
  const gltf = useLoader(GLTFLoader, LIGHTHOUSE_MODEL_URL)
  const surfaceLayer = getWebglLayer('webgl.oceanLines')
  const surfaceRef = useRef<Mesh>(null)
  const volumeRef = useRef<Mesh>(null)

  const reefFieldTexture = useMemo(() => {
    const mask = buildReefObstacleMask(gltf.scene, {
      resolution: REEF_FIELD_RESOLUTION,
      modelScale: LIGHTHOUSE_MODEL_SCALE,
      centerZ: SCENE_CENTER_Z,
      dilation: 3,
    })
    const field = buildReefProximityField(mask, REEF_FIELD_RESOLUTION, 52)
    const texture = new DataTexture(
      field,
      REEF_FIELD_RESOLUTION,
      REEF_FIELD_RESOLUTION,
      RGBAFormat,
      UnsignedByteType,
    )
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
  }, [gltf.scene])

  const { geometry, material, volumeGeometry, volumeMaterial } = useMemo(() => {
    const oceanGeometry = new PlaneGeometry(
      OCEAN_WIDTH,
      OCEAN_DEPTH,
      SURFACE_SEGMENTS,
      SURFACE_SEGMENTS,
    )
    oceanGeometry.rotateX(-Math.PI / 2)
    oceanGeometry.translate(0, OCEAN_BASE_Y, OCEAN_CENTER_Z)
    oceanGeometry.computeBoundingSphere()

    const oceanMaterial = new ShaderMaterial({
      vertexShader: stylizedOceanVertexShader,
      fragmentShader: stylizedOceanFragmentShader,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uReefField: { value: reefFieldTexture },
          uOceanOrigin: { value: new Vector2(OCEAN_BOUNDS.minX, OCEAN_BOUNDS.maxZ) },
          uOceanExtent: { value: new Vector2(OCEAN_WIDTH, OCEAN_DEPTH) },
          uTime: { value: 0 },
          uBeamOrigin: { value: DEFAULT_BEAM_ORIGIN.clone() },
          uBeamDirection: { value: DEFAULT_BEAM_DIRECTION.clone() },
          uOpacity: { value: 1 },
        },
      ]),
      transparent: surfaceLayer.transparent,
      depthTest: surfaceLayer.depthTest,
      depthWrite: surfaceLayer.depthWrite,
      side: DoubleSide,
      fog: true,
    })

    // The volume is an animated perimeter skirt plus a fixed bottom. Its top
    // row runs through the same displacement function as the surface edge, so
    // the miniature water body remains sealed at every point in the wave cycle.
    const oceanVolumeGeometry = buildOceanVolumeGeometry(SURFACE_SEGMENTS)

    const oceanVolumeMaterial = new ShaderMaterial({
      vertexShader: stylizedOceanVolumeVertexShader,
      fragmentShader: stylizedOceanVolumeFragmentShader,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uSurfaceY: { value: OCEAN_BASE_Y },
          uVolumeDepth: { value: OCEAN_VOLUME_DEPTH },
          uOceanOrigin: { value: new Vector2(OCEAN_BOUNDS.minX, OCEAN_BOUNDS.maxZ) },
          uOceanExtent: { value: new Vector2(OCEAN_WIDTH, OCEAN_DEPTH) },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
        },
      ]),
      transparent: surfaceLayer.transparent,
      depthTest: surfaceLayer.depthTest,
      depthWrite: surfaceLayer.depthWrite,
      side: DoubleSide,
      fog: true,
    })

    return {
      geometry: oceanGeometry,
      material: oceanMaterial,
      volumeGeometry: oceanVolumeGeometry,
      volumeMaterial: oceanVolumeMaterial,
    }
  }, [
    reefFieldTexture,
    surfaceLayer.depthTest,
    surfaceLayer.depthWrite,
    surfaceLayer.transparent,
  ])

  useEffect(() => () => {
    reefFieldTexture.dispose()
    geometry.dispose()
    material.dispose()
    volumeGeometry.dispose()
    volumeMaterial.dispose()
  }, [geometry, material, reefFieldTexture, volumeGeometry, volumeMaterial])

  useFrame((state) => {
    const sp = useScrollStore.getState().scrollProgress
    const active = sp < TIMELINE.miniatureShrink.end + 0.01
    touchActorFrame('waves', Math.round(state.clock.elapsedTime * 60), active)
    if (surfaceRef.current) surfaceRef.current.visible = active
    if (!active) {
      if (volumeRef.current) volumeRef.current.visible = false
      return
    }

    material.uniforms.uTime.value = state.clock.elapsedTime
    const act3Progress = clamped(sp, TIMELINE.act3Shift.start, 1)
    const sceneOpacity = 1 - smoothstep(act3Progress)
    const volumeReveal = smoothstep(clamped(
      sp,
      TIMELINE.miniatureShrink.start + 0.015,
      0.48,
    ))
    material.uniforms.uOpacity.value = sceneOpacity
    volumeMaterial.uniforms.uTime.value = state.clock.elapsedTime
    volumeMaterial.uniforms.uOpacity.value = sceneOpacity * volumeReveal
    // Keep the volume in the depth pass as soon as the miniature wireframe
    // starts drawing. Its color can still fade in later, but submerged/back
    // cube edges must never flash through the transparent water body.
    if (volumeRef.current) {
      volumeRef.current.visible = sp >= TIMELINE.miniatureShrink.start
    }

    const beamOrigin = readBeamWorldOrigin()
    const beamDirection = readBeamWorldDirection()
    const originUniform = material.uniforms.uBeamOrigin.value as Vector3
    const directionUniform = material.uniforms.uBeamDirection.value as Vector3
    if (beamOrigin) originUniform.set(beamOrigin.x, beamOrigin.y, beamOrigin.z)
    else originUniform.copy(DEFAULT_BEAM_ORIGIN)
    if (beamDirection) {
      directionUniform
        .set(beamDirection.x, beamDirection.y, beamDirection.z)
        .normalize()
    } else directionUniform.copy(DEFAULT_BEAM_DIRECTION)
  })

  return (
    <>
      <mesh
        ref={volumeRef}
        geometry={volumeGeometry}
        material={volumeMaterial}
        renderOrder={surfaceLayer.renderOrder - 1}
      />
      <mesh
        ref={surfaceRef}
        geometry={geometry}
        material={material}
        renderOrder={surfaceLayer.renderOrder}
      />
    </>
  )
}
