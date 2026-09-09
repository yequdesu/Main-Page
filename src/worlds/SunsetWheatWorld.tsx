import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, BoxGeometry, DoubleSide, ShaderMaterial, Vector3, type Group, type Mesh } from 'three'
import { useActorRuntime } from '../composition/actorRuntime'
import type { Act1WorldProps } from './act1World'
import { buildWheatBatch, buildWheatSeeds, WHEAT_FLOOR, wheatScreenDetail } from './wheatField'
import { wheatVertex, worldVertex, worldFragment } from './wheatShaders'

export default function SunsetWheatWorld({ bounds, active }: Act1WorldProps) {
  useActorRuntime('sunsetWheatWorld', active)
  const root = useRef<Group>(null)
  const canopyRef = useRef<Mesh>(null)
  const wheatRefs = useRef<(Mesh | null)[]>([])
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height))
  const assets = useMemo(() => {
    const half = bounds.halfSize
    const makeMaterial = (kind: number, wheat = false) => new ShaderMaterial({
      vertexShader: wheat ? wheatVertex : worldVertex, fragmentShader: worldFragment,
      uniforms: {
        uTime: { value: 0 }, uHalf: { value: half }, uFloor: { value: WHEAT_FLOOR },
        uKind: { value: kind }, uOffset: { value: new Vector3() }, uDetail: { value: 1 },
        uCameraLocal: { value: new Vector3() }, uSunDirection: { value: new Vector3(-.16,.01,-1).normalize() },
      },
      side: kind === 2 ? BackSide : DoubleSide, depthTest: true, depthWrite: true,
      transparent: false, toneMapped: false, fog: false,
    })
    const seeds = buildWheatSeeds()
    const batches = [0, 1, 2].map(lod => buildWheatBatch(seeds, lod))
    const sky = new BoxGeometry(half * 2 - .02, half * 2 - .02, half * 2 - .02)
    const ground = new BoxGeometry(half * 2 - .04, half + WHEAT_FLOOR, half * 2 - .04)
    ground.translate(0, (WHEAT_FLOOR - half) * .5, 0)
    // Closed skirts meet the soil when the individual stems are no longer drawn.
    const canopy = new BoxGeometry(half * 2 - .04, 1.88, half * 2 - .04, 96, 1, 96)
    canopy.translate(0, WHEAT_FLOOR + .94, 0)
    return { batches, sky, ground, canopy, materials: [makeMaterial(0, true), makeMaterial(1), makeMaterial(2), makeMaterial(3)],
      cameraPosition: new Vector3(), center: new Vector3(), scale: new Vector3() }
  }, [bounds])
  useEffect(() => {
    assets.materials[2].uniforms.uSunDirection.value.set(-.16 * Math.min(1, aspect), .01, -1).normalize()
  }, [assets, aspect])
  useEffect(() => () => {
    assets.batches.forEach(g => g.dispose())
    for (const g of [assets.sky, assets.ground, assets.canopy]) g.dispose()
    assets.materials.forEach(m => m.dispose())
  }, [assets])
  useFrame(({ clock, camera, size, invalidate }) => {
    if (!active || !root.current) return
    root.current.updateWorldMatrix(true, false)
    camera.getWorldPosition(assets.cameraPosition)
    assets.materials[2].uniforms.uCameraLocal.value.copy(assets.cameraPosition)
    root.current.worldToLocal(assets.materials[2].uniforms.uCameraLocal.value)
    root.current.getWorldPosition(assets.center)
    root.current.getWorldScale(assets.scale)
    const distance = Math.max(.01, assets.center.distanceTo(assets.cameraPosition))
    const pixelsPerStalk = size.height * camera.projectionMatrix.elements[5] * assets.scale.x / distance
    const detail = wheatScreenDetail(pixelsPerStalk)
    assets.materials[0].uniforms.uDetail.value = detail
    assets.materials[0].uniforms.uTime.value = clock.elapsedTime
    assets.materials[3].uniforms.uTime.value = clock.elapsedTime
    wheatRefs.current.forEach(mesh => { if (mesh) mesh.visible = detail > .001 })
    if (canopyRef.current) canopyRef.current.visible = detail < .999
    invalidate()
  })
  return <group ref={root} name="sunset-wheat-world" dispose={null}>
    <mesh name="wheat-sky" geometry={assets.sky} material={assets.materials[2]} raycast={() => {}} />
    <mesh name="wheat-ground" geometry={assets.ground} material={assets.materials[1]} raycast={() => {}} />
    <mesh ref={canopyRef} name="wheat-canopy" geometry={assets.canopy} material={assets.materials[3]} frustumCulled={false} raycast={() => {}} />
    {assets.batches.map((geometry, i) => <mesh key={i} ref={mesh => { wheatRefs.current[i] = mesh }} name={`wheat-lod-${i}`} geometry={geometry} material={assets.materials[0]} frustumCulled={false} raycast={() => {}} />)}
  </group>
}
