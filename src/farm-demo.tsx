import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import './debug/FarmDemo.css'

export type Act1SceneId = 'lighthouse' | 'farm'
export interface Act1SceneProps { miniatureRoot?: THREE.Group; time: number; sceneProgress: number; cubeBounds: THREE.Box3 }

type Seed = { x: number; z: number; height: number; lean: number; phase: number; sway: number; color: string }
const PALETTE = ['#c49335', '#d6aa49', '#e0bd62', '#ad7928', '#efd079']
const random = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function makeSeeds(): Seed[] {
  const seeds: Seed[] = []
  for (let i = 0; i < 520; i++) {
    const layer = i % 3
    const u = random(i + 2), v = random(i * 3 + 9)
    const extent = layer === 0 ? 7.5 : layer === 1 ? 10.5 : 13
    seeds.push({ x: (u - .5) * extent, z: (v - .5) * extent, height: 1.45 + random(i + 41) * (layer === 0 ? 1.3 : .9), lean: (random(i + 73) - .5) * .22, phase: random(i + 101) * Math.PI * 2, sway: .75 + random(i + 21) * .7, color: PALETTE[i % PALETTE.length] })
  }
  return seeds
}

function WheatField({ speed }: { speed: number }) {
  const seeds = useMemo(makeSeeds, [])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const blade = useMemo(() => new THREE.ConeGeometry(.065, 1, 4), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d6aa49', toneMapped: false }), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useEffect(() => () => { blade.dispose(); material.dispose() }, [blade, material])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    const t = clock.elapsedTime * speed
    seeds.forEach((seed, i) => {
      const gust = Math.sin(t * .8 + seed.phase + seed.x * .31 + seed.z * .17) * .13
        + Math.sin(t * .31 + seed.phase * 1.7 + seed.z * .11) * .07
      const bend = seed.lean + gust * seed.sway
      dummy.position.set(seed.x + bend * seed.height * .25, -3.1 + seed.height * .5, seed.z)
      dummy.rotation.set(0, seed.phase, bend)
      dummy.scale.set(1, seed.height, 1)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
      color.set(seed.color); mesh.current!.setColorAt(i, color)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[blade, material, seeds.length]} frustumCulled={false} />
}

function CubeFrame() {
  const geometry = useMemo(() => new THREE.BoxGeometry(26, 15, 26), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry])
  useEffect(() => () => { geometry.dispose(); edges.dispose() }, [geometry, edges])
  return <lineSegments geometry={edges} position={[0, 3, 0]}><lineBasicMaterial color="#e4d9b0" transparent opacity={.7} /></lineSegments>
}

function FarmScene({ speed }: { speed: number }) {
  const { camera } = useThree()
  useEffect(() => { camera.position.set(0, 1.1, 19); camera.lookAt(0, -1.4, 0) }, [camera])
  return <>
    <color attach="background" args={['#081224']} />
    <fog attach="fog" args={['#081224', 18, 34]} />
    <ambientLight intensity={1.2} color="#5b6680" />
    <directionalLight position={[-7, 9, 8]} intensity={2.2} color="#ffd77d" />
    <directionalLight position={[8, 2, -7]} intensity={.5} color="#c47f4c" />
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.25, 0]}><planeGeometry args={[26, 26]} /><meshBasicMaterial color="#3b2c1e" /></mesh>
      <WheatField speed={speed} />
      <CubeFrame />
    </group>
  </>
}

function Demo() {
  const [speed, setSpeed] = useState(1)
  const [key, setKey] = useState(0)
  return <main className="farm-demo">
    <Canvas key={key} camera={{ fov: 42, near: .1, far: 60 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <FarmScene speed={speed} />
    </Canvas>
    <header><span>ACT 1 SCENE STUDY / FARM</span><span>LOW-POLY WHEAT FIELD</span></header>
    <footer>
      <div>金色麦田 · 低机位黄昏 · 立方体内部风场</div>
      <nav>
        <button onClick={() => setKey(value => value + 1)}>重新生成</button>
        <label>风速 <input type="range" min=".2" max="2" step=".1" value={speed} onChange={event => setSpeed(Number(event.target.value))} /></label>
        <span>520 LOW-POLY INSTANCES</span>
      </nav>
    </footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<Demo />)
