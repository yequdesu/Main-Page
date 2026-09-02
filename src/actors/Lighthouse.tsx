import { useEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import {
  AdditiveBlending,
  DataTexture,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RGBAFormat,
  type Group,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { SCENE_CENTER_Z } from '../r3f/ScrollRig'

// Module-level ref shared with LighthouseCapture for offscreen rendering.
export let _lighthouseGroupRef: Group | null = null

const LIGHTHOUSE_MODEL_URL = '/models/lighthouse.glb?v=51c4a32b'
const LIGHTHOUSE_MODEL_SCALE = 0.28
const LIGHTHOUSE_LAMP_LOCAL_Y = 9.4912
const LIGHTHOUSE_MODEL_WORLD_Y = -2.05
export const LIGHTHOUSE_LAMP_WORLD_Y =
  LIGHTHOUSE_MODEL_WORLD_Y + LIGHTHOUSE_LAMP_LOCAL_Y * LIGHTHOUSE_MODEL_SCALE

RectAreaLightUniformsLib.init()

// The waist of the GLB is the tapered band between local Y 3.57 and 4.11.
// Keep these planes on that band, just outside its four cardinal faces, so
// they sit in the modeled window openings instead of floating above the body.
const WINDOW_LIGHTS = [
  { position: [0, 3.84, 1.035], rotationY: 0 },
  { position: [1.035, 3.84, 0], rotationY: Math.PI / 2 },
  { position: [0, 3.84, -1.035], rotationY: Math.PI },
  { position: [-1.035, 3.84, 0], rotationY: -Math.PI / 2 },
] as const

// Four hard light bands keep the imported white model graphic and low-poly.
const LIGHTHOUSE_TOON_GRADIENT = new DataTexture(
  new Uint8Array([
    24, 24, 24, 255,
    86, 86, 86, 255,
    164, 164, 164, 255,
    255, 255, 255, 255,
  ]),
  4,
  1,
  RGBAFormat,
)
LIGHTHOUSE_TOON_GRADIENT.minFilter = NearestFilter
LIGHTHOUSE_TOON_GRADIENT.magFilter = NearestFilter
LIGHTHOUSE_TOON_GRADIENT.generateMipmaps = false
LIGHTHOUSE_TOON_GRADIENT.needsUpdate = true

function createModelMaterial(meshName: string): Material {
  if (meshName === 'Sphere') {
    return new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
    })
  }

  const isReef = meshName === 'Plane'
  const isDarkDetail = /Circle\.00[1-6]/.test(meshName)
  const color = isReef ? '#35414b' : isDarkDetail ? '#303740' : '#69737d'

  return new MeshToonMaterial({
    color,
    gradientMap: LIGHTHOUSE_TOON_GRADIENT,
  })
}

/**
 * Imported lighthouse + reef model. The GLB contains geometry only; materials
 * are assigned here so the asset follows the site's stylised lighting.
 */
export function LighthouseScene({ source }: { source: Group }) {
  const groupRef = useRef<Group>(null)

  const model = useMemo(() => {
    const clone = source.clone(true)
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.material = createModelMaterial(child.name)
      child.castShadow = false
      child.receiveShadow = false
    })
    return clone
  }, [source])

  useEffect(() => {
    _lighthouseGroupRef = groupRef.current
    const materials: Material[] = []

    groupRef.current?.traverse((child) => {
      if (!(child instanceof Mesh)) return
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of childMaterials) {
        if (materials.includes(material)) continue
        materials.push(material)
      }
    })

    return () => {
      _lighthouseGroupRef = null
      for (const material of materials) material.dispose()
    }
  }, [model])

  return (
    <group
      ref={groupRef}
      position={[0, LIGHTHOUSE_MODEL_WORLD_Y, SCENE_CENTER_Z]}
      scale={LIGHTHOUSE_MODEL_SCALE}
    >
      <primitive object={model} />
      {WINDOW_LIGHTS.map(({ position, rotationY }, index) => (
        <group key={`window-light-${index}`} position={position} rotation={[0, rotationY, 0]}>
          <mesh renderOrder={2}>
            <planeGeometry args={[0.32, 0.42]} />
            <meshBasicMaterial
              color="#ffd99a"
              transparent
              opacity={0.7}
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <rectAreaLight
            color="#ffd7a0"
            intensity={0.55}
            width={0.48}
            height={0.52}
            position={[0, 0, -0.035]}
            rotation={[0, Math.PI, 0]}
          />
        </group>
      ))}
    </group>
  )
}

export default function Lighthouse() {
  const gltf = useLoader(GLTFLoader, LIGHTHOUSE_MODEL_URL)
  return <LighthouseScene source={gltf.scene} />
}

useLoader.preload(GLTFLoader, LIGHTHOUSE_MODEL_URL)
