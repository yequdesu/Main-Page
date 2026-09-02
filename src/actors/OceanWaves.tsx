import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DoubleSide,
  HalfFloatType,
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
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
import { buildReefObstacleMask, OCEAN_BOUNDS } from '../behaviors/reefObstacleMask'
import {
  shallowWaterFragmentShader,
  shallowWaterVertexShader,
} from '../shaders/ShallowWaterSimulationShader'
import {
  stylizedOceanFragmentShader,
  stylizedOceanVertexShader,
} from '../shaders/StylizedOceanShader'

const SIMULATION_RESOLUTION = 512
const SURFACE_SEGMENTS = 256
const FIXED_SIMULATION_STEP = 1 / 60
const MAX_SUBSTEPS = 4
const OCEAN_BASE_Y = -2.18
const OCEAN_WIDTH = OCEAN_BOUNDS.maxX - OCEAN_BOUNDS.minX
const OCEAN_DEPTH = OCEAN_BOUNDS.maxZ - OCEAN_BOUNDS.minZ
const DEFAULT_BEAM_ORIGIN = new Vector3(0, LIGHTHOUSE_LAMP_WORLD_Y, SCENE_CENTER_Z)
const DEFAULT_BEAM_DIRECTION = new Vector3(0, 0, 1)

function createSimulationTarget(): WebGLRenderTarget {
  const target = new WebGLRenderTarget(SIMULATION_RESOLUTION, SIMULATION_RESOLUTION, {
    format: RGBAFormat,
    type: HalfFloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  })
  target.texture.generateMipmaps = false
  return target
}

interface SimulationResources {
  scene: Scene
  camera: OrthographicCamera
  material: ShaderMaterial
  quad: Mesh
  targetA: WebGLRenderTarget
  targetB: WebGLRenderTarget
  read: WebGLRenderTarget
  write: WebGLRenderTarget
  accumulator: number
  elapsedTime: number
  needsReset: boolean
}

function createSimulationResources(obstacleTexture: DataTexture): SimulationResources {
  const targetA = createSimulationTarget()
  const targetB = createSimulationTarget()
  const material = new ShaderMaterial({
    vertexShader: shallowWaterVertexShader,
    fragmentShader: shallowWaterFragmentShader,
    uniforms: {
      uState: { value: targetA.texture },
      uObstacle: { value: obstacleTexture },
      uTexel: { value: new Vector2(1 / SIMULATION_RESOLUTION, 1 / SIMULATION_RESOLUTION) },
      uTime: { value: 0 },
      uReset: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  return {
    scene,
    camera,
    material,
    quad,
    targetA,
    targetB,
    read: targetA,
    write: targetB,
    accumulator: 0,
    elapsedTime: 0,
    needsReset: true,
  }
}

/**
 * Horizontal ocean surface driven by a GPU shallow-water height field. The
 * imported reef footprint is a numerical obstacle, so waves reflect and
 * diffract around the actual model instead of being hidden by curtains.
 */
export default function OceanWaves() {
  useActorRuntime('waves', true)
  const { gl } = useThree()
  const gltf = useLoader(GLTFLoader, LIGHTHOUSE_MODEL_URL)
  const surfaceLayer = getWebglLayer('webgl.oceanSurface')
  const surfaceRef = useRef<Mesh>(null)

  const obstacleTexture = useMemo(() => {
    const mask = buildReefObstacleMask(gltf.scene, {
      resolution: SIMULATION_RESOLUTION,
      modelScale: LIGHTHOUSE_MODEL_SCALE,
      centerZ: SCENE_CENTER_Z,
      dilation: 3,
    })
    const texture = new DataTexture(
      mask,
      SIMULATION_RESOLUTION,
      SIMULATION_RESOLUTION,
      RedFormat,
      UnsignedByteType,
    )
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
  }, [gltf.scene])

  const simulation = useMemo(
    () => createSimulationResources(obstacleTexture),
    [obstacleTexture],
  )

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
      uniforms: {
        uState: { value: simulation.read.texture },
        uObstacle: { value: obstacleTexture },
        uTexel: { value: new Vector2(1 / SIMULATION_RESOLUTION, 1 / SIMULATION_RESOLUTION) },
        uHeightScale: { value: 1.65 },
        uBeamOrigin: { value: DEFAULT_BEAM_ORIGIN.clone() },
        uBeamDirection: { value: DEFAULT_BEAM_DIRECTION.clone() },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
      transparent: surfaceLayer.transparent,
      depthTest: surfaceLayer.depthTest,
      depthWrite: surfaceLayer.depthWrite,
      side: DoubleSide,
      fog: true,
    })

    return { geometry: oceanGeometry, material: oceanMaterial }
  }, [obstacleTexture, simulation.read.texture, surfaceLayer.depthTest, surfaceLayer.depthWrite, surfaceLayer.transparent])

  useEffect(() => {
    const previousTarget = gl.getRenderTarget()
    const previousClearColor = gl.getClearColor(new Color()).clone()
    const previousClearAlpha = gl.getClearAlpha()
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(simulation.targetA)
    gl.clear(true, false, false)
    gl.setRenderTarget(simulation.targetB)
    gl.clear(true, false, false)
    gl.setRenderTarget(previousTarget)
    gl.setClearColor(previousClearColor, previousClearAlpha)
    simulation.needsReset = true

    return () => {
      simulation.targetA.dispose()
      simulation.targetB.dispose()
      simulation.quad.geometry.dispose()
      simulation.material.dispose()
      obstacleTexture.dispose()
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, gl, material, obstacleTexture, simulation])

  useFrame((state, delta) => {
    const sp = useScrollStore.getState().scrollProgress
    const active = sp < TIMELINE.miniatureShrink.end + 0.01
    touchActorFrame('waves', Math.round(state.clock.elapsedTime * 60), active)
    if (surfaceRef.current) surfaceRef.current.visible = active
    if (!active) return

    simulation.accumulator = Math.min(
      simulation.accumulator + Math.min(delta, 0.05),
      FIXED_SIMULATION_STEP * MAX_SUBSTEPS,
    )
    const previousTarget = gl.getRenderTarget()
    let substeps = 0

    while (simulation.accumulator >= FIXED_SIMULATION_STEP && substeps < MAX_SUBSTEPS) {
      simulation.elapsedTime += FIXED_SIMULATION_STEP
      simulation.material.uniforms.uState.value = simulation.read.texture
      simulation.material.uniforms.uTime.value = simulation.elapsedTime
      simulation.material.uniforms.uReset.value = simulation.needsReset ? 1 : 0
      gl.setRenderTarget(simulation.write)
      gl.render(simulation.scene, simulation.camera)

      const completed = simulation.write
      simulation.write = simulation.read
      simulation.read = completed
      simulation.needsReset = false
      simulation.accumulator -= FIXED_SIMULATION_STEP
      substeps++
    }
    gl.setRenderTarget(previousTarget)

    material.uniforms.uState.value = simulation.read.texture
    material.uniforms.uTime.value = state.clock.elapsedTime
    const act3Progress = clamped(sp, TIMELINE.act3Shift.start, 1)
    material.uniforms.uOpacity.value = 1 - smoothstep(act3Progress)

    const beamOrigin = readBeamWorldOrigin()
    const beamDirection = readBeamWorldDirection()
    const originUniform = material.uniforms.uBeamOrigin.value as Vector3
    const directionUniform = material.uniforms.uBeamDirection.value as Vector3
    if (beamOrigin) originUniform.set(beamOrigin.x, beamOrigin.y, beamOrigin.z)
    else originUniform.copy(DEFAULT_BEAM_ORIGIN)
    if (beamDirection) directionUniform.set(beamDirection.x, beamDirection.y, beamDirection.z).normalize()
    else directionUniform.copy(DEFAULT_BEAM_DIRECTION)
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
