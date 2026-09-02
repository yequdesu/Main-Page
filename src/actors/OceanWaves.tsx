import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  ClampToEdgeWrapping,
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
} from '../behaviors/reefObstacleMask'
import {
  stylizedOceanFragmentShader,
  stylizedOceanVertexShader,
} from '../shaders/StylizedOceanShader'

const REEF_FIELD_RESOLUTION = 512
const SURFACE_SEGMENTS = 256
const OCEAN_BASE_Y = -2.18
const OCEAN_WIDTH = OCEAN_BOUNDS.maxX - OCEAN_BOUNDS.minX
const OCEAN_DEPTH = OCEAN_BOUNDS.maxZ - OCEAN_BOUNDS.minZ
const DEFAULT_BEAM_ORIGIN = new Vector3(0, LIGHTHOUSE_LAMP_WORLD_Y, SCENE_CENTER_Z)
const DEFAULT_BEAM_DIRECTION = new Vector3(0, 0, 1)

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

  const { geometry, material } = useMemo(() => {
    const oceanGeometry = new PlaneGeometry(
      OCEAN_WIDTH,
      OCEAN_DEPTH,
      SURFACE_SEGMENTS,
      SURFACE_SEGMENTS,
    )
    oceanGeometry.rotateX(-Math.PI / 2)
    oceanGeometry.translate(0, OCEAN_BASE_Y, SCENE_CENTER_Z)
    oceanGeometry.computeBoundingSphere()

    const oceanMaterial = new ShaderMaterial({
      vertexShader: stylizedOceanVertexShader,
      fragmentShader: stylizedOceanFragmentShader,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uReefField: { value: reefFieldTexture },
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

    return { geometry: oceanGeometry, material: oceanMaterial }
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
  }, [geometry, material, reefFieldTexture])

  useFrame((state) => {
    const sp = useScrollStore.getState().scrollProgress
    const active = sp < TIMELINE.miniatureShrink.end + 0.01
    touchActorFrame('waves', Math.round(state.clock.elapsedTime * 60), active)
    if (surfaceRef.current) surfaceRef.current.visible = active
    if (!active) return

    material.uniforms.uTime.value = state.clock.elapsedTime
    const act3Progress = clamped(sp, TIMELINE.act3Shift.start, 1)
    material.uniforms.uOpacity.value = 1 - smoothstep(act3Progress)

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
    <mesh
      ref={surfaceRef}
      geometry={geometry}
      material={material}
      renderOrder={surfaceLayer.renderOrder}
    />
  )
}
