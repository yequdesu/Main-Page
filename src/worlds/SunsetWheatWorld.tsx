import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, BoxGeometry, DoubleSide, ShaderMaterial, Vector3, type Group } from 'three'
import { useActorRuntime } from '../composition/actorRuntime'
import type { Act1WorldProps } from './act1World'
import { buildWheatTiles, buildWheatSeeds, WHEAT_FLOOR } from './wheatField'
import { wheatVertex, worldVertex, worldFragment } from './wheatShaders'

export default function SunsetWheatWorld({ bounds, active }: Act1WorldProps) {
  useActorRuntime('sunsetWheatWorld', active)
  const root = useRef<Group>(null)
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height))
  const assets = useMemo(() => {
    const half = bounds.halfSize
    const makeMaterial = (kind: number, wheat = false) => new ShaderMaterial({
      vertexShader: wheat ? wheatVertex : worldVertex,
      fragmentShader: worldFragment.replace('uniform float uKind;', `const float uKind = ${kind.toFixed(1)};`),
      uniforms: {
        uTime: { value: 0 }, uHalf: { value: half }, uFloor: { value: WHEAT_FLOOR },
        uKind: { value: kind }, uOffset: { value: new Vector3() },
        uCameraLocal: { value: new Vector3() }, uSunDirection: { value: new Vector3(-.16,.01,-1).normalize() },
      },
      side: kind === 2 ? BackSide : DoubleSide, depthTest: true, depthWrite: true,
      transparent: false, toneMapped: false, fog: false,
    })
    const seeds = buildWheatSeeds()
    const batches = buildWheatTiles(seeds)
    const sky = new BoxGeometry(half * 2 - .02, half * 2 - .02, half * 2 - .02)
    const ground = new BoxGeometry(half * 2 - .04, half + WHEAT_FLOOR, half * 2 - .04)
    ground.translate(0, (WHEAT_FLOOR - half) * .5, 0)
    return { batches, sky, ground, materials: [makeMaterial(0, true), makeMaterial(1), makeMaterial(2)],
      cameraPosition: new Vector3() }
  }, [bounds])
  useEffect(() => {
    assets.materials[2].uniforms.uSunDirection.value.set(-.16 * Math.min(1, aspect), .01, -1).normalize()
  }, [assets, aspect])
  useEffect(() => () => {
    assets.batches.forEach(g => g.dispose())
    for (const g of [assets.sky, assets.ground]) g.dispose()
    assets.materials.forEach(m => m.dispose())
  }, [assets])
  useFrame(({ clock, camera, invalidate }) => {
    if (!active || !root.current) return
    root.current.updateWorldMatrix(true, false)
    camera.getWorldPosition(assets.cameraPosition)
    assets.materials[2].uniforms.uCameraLocal.value.copy(assets.cameraPosition)
    root.current.worldToLocal(assets.materials[2].uniforms.uCameraLocal.value)
    assets.materials[0].uniforms.uTime.value = clock.elapsedTime
    invalidate()
  })
  return <group ref={root} name="sunset-wheat-world" dispose={null}>
    <mesh name="wheat-sky" geometry={assets.sky} material={assets.materials[2]} raycast={() => {}} />
    <mesh name="wheat-ground" geometry={assets.ground} material={assets.materials[1]} raycast={() => {}} />
    {assets.batches.map((geometry, i) => <mesh key={i} name={`wheat-tile-${i}`} geometry={geometry} material={assets.materials[0]} frustumCulled raycast={() => {}} />)}
  </group>
}
