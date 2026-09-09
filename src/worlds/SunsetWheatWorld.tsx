import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, BoxGeometry, CircleGeometry, DoubleSide, IcosahedronGeometry, ShaderMaterial, Vector3, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useActorRuntime } from '../composition/actorRuntime'
import type { Act1WorldProps } from './act1World'
import { buildWheatBatch, buildWheatSeeds, WHEAT_FLOOR, wheatRandom } from './wheatField'
import { wheatVertex, worldVertex, worldFragment } from './wheatShaders'

export default function SunsetWheatWorld({ bounds, active }: Act1WorldProps) {
  useActorRuntime('sunsetWheatWorld', active)
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height))
  const assets = useMemo(() => {
    const half = bounds.halfSize
    const makeMaterial = (kind: number, wheat = false) => new ShaderMaterial({
      vertexShader: wheat ? wheatVertex : worldVertex, fragmentShader: worldFragment,
      uniforms: { uTime: { value: 0 }, uHalf: { value: half }, uFloor: { value: WHEAT_FLOOR }, uKind: { value: kind }, uOffset: { value: new Vector3() } },
      side: kind === 2 ? BackSide : DoubleSide, depthTest: true, depthWrite: true,
      transparent: false, toneMapped: false, fog: false,
    })
    const seeds = buildWheatSeeds()
    const batches = [0, 1, 2].map(lod => buildWheatBatch(seeds, lod))
    const sky = new BoxGeometry(half * 2 - .02, half * 2 - .02, half * 2 - .02)
    const ground = new BoxGeometry(half * 2 - .04, half + WHEAT_FLOOR, half * 2 - .04)
    ground.translate(0, (WHEAT_FLOOR - half) * .5, 0)
    const sun = new CircleGeometry(3.6, 48)
    sun.translate(-12, 1.4, -31.7)
    const pieces: BufferGeometry[] = []
    for (let i = 0; i < 26; i++) {
      const cluster = Math.floor(i / 5)
      const g = new IcosahedronGeometry(1, 0)
      g.scale(2 + wheatRandom(i) * 3.8, .16 + wheatRandom(i + 91) * .32, .3)
      g.rotateZ((wheatRandom(i + 33) - .5) * .055)
      g.translate(-24 + cluster * 10 + (i % 5 - 2) * 2.5,
        7 + wheatRandom(cluster + 735) * 14 + (wheatRandom(i + 52) - .5) * .65, -30.5)
      pieces.push(g)
    }
    const clouds = mergeGeometries(pieces)!
    pieces.forEach(p => p.dispose())
    return { batches, sky, ground, sun, clouds, materials: [makeMaterial(0, true), makeMaterial(1), makeMaterial(2), makeMaterial(3), makeMaterial(4)] }
  }, [bounds])
  // Recompose the internal sun on narrow screens, never move the shared camera.
  useEffect(() => {
    assets.materials[3].uniforms.uOffset.value.x = 12 - 10 * Math.min(1, aspect)
  }, [assets, aspect])
  useEffect(() => () => {
    assets.batches.forEach(g => g.dispose())
    for (const g of [assets.sky, assets.ground, assets.sun, assets.clouds]) g.dispose()
    assets.materials.forEach(m => m.dispose())
  }, [assets])
  useFrame(({ clock, invalidate }) => {
    if (!active) return
    assets.materials[0].uniforms.uTime.value = clock.elapsedTime
    invalidate()
  })
  return <group name="sunset-wheat-world" dispose={null}>
    <mesh name="wheat-sky" geometry={assets.sky} material={assets.materials[2]} raycast={() => {}} />
    <mesh name="wheat-ground" geometry={assets.ground} material={assets.materials[1]} raycast={() => {}} />
    <mesh name="wheat-sun" geometry={assets.sun} material={assets.materials[3]} frustumCulled={false} raycast={() => {}} />
    <mesh name="wheat-clouds" geometry={assets.clouds} material={assets.materials[4]} raycast={() => {}} />
    {assets.batches.map((geometry, i) => <mesh key={i} name={`wheat-lod-${i}`} geometry={geometry} material={assets.materials[0]} frustumCulled={false} raycast={() => {}} />)}
  </group>
}
