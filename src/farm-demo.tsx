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
  const columns = 40
  const rows = 40
  for (let i = 0; i < columns * rows; i++) {
    const layer = i % 3
    const column = i % columns
    const row = Math.floor(i / columns)
    const u = (column + .18 + random(i + 2) * .64) / columns
    const v = (row + .18 + random(i * 3 + 9) * .64) / rows
    const extent = layer === 0 ? 15.0 : layer === 1 ? 15.6 : 16.2
    const baseHeight = layer === 0 ? 1.35 : layer === 1 ? 1.05 : .9
    seeds.push({ x: (u - .5) * extent, z: (v - .5) * extent, height: baseHeight + random(i + 41) * .9, lean: (random(i + 73) - .5) * .22, phase: random(i + 101) * Math.PI * 2, sway: .75 + random(i + 21) * .7, color: PALETTE[i % PALETTE.length] })
  }
  return seeds
}

function WheatEar({ seed, index, refCallback }: { seed: Seed; index: number; refCallback: (group: THREE.Group | null, index: number) => void }) {
  const stem = useMemo(() => new THREE.CylinderGeometry(.018, .028, 1, 5), [])
  const grain = useMemo(() => new THREE.ConeGeometry(.052, .15, 5), [])
  const awn = useMemo(() => new THREE.ConeGeometry(.009, .29, 4), [])
  const stemMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8d6424' }), [])
  const grainMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: seed.color }), [seed.color])
  const awnMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#efd079' }), [])
  useEffect(() => () => { stem.dispose(); grain.dispose(); awn.dispose(); stemMaterial.dispose(); grainMaterial.dispose(); awnMaterial.dispose() }, [stem, grain, awn, stemMaterial, grainMaterial, awnMaterial])
  return <group ref={group => refCallback(group, index)} position={[seed.x, -3.15, seed.z]}>
    <mesh geometry={stem} material={stemMaterial} scale={[1, seed.height, 1]} position={[0, seed.height * .5, 0]} />
    {Array.from({ length: 7 }, (_, grainIndex) => {
      const y = seed.height * (.48 + grainIndex * .075)
      const side = grainIndex % 2 ? 1 : -1
      return <group key={grainIndex} position={[side * (.04 + grainIndex * .004), y, 0]} rotation={[0, 0, side * .34]}>
        <mesh geometry={grain} material={grainMaterial} rotation={[0, 0, Math.PI / 2]} scale={[1, .82, 1]} />
        <mesh geometry={awn} material={awnMaterial} position={[side * .055, .03, 0]} rotation={[0, 0, side * .6]} />
      </group>
    })}
    <mesh geometry={awn} material={awnMaterial} position={[0, seed.height * 1.02, 0]} rotation={[0, 0, seed.lean * 1.8]} />
  </group>
}

function WheatField({ speed }: { speed: number }) {
  const seeds = useMemo(makeSeeds, [])
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed
    seeds.forEach((seed, i) => {
      const gust = Math.sin(t * .8 + seed.phase + seed.x * .31 + seed.z * .17) * .13
        + Math.sin(t * .31 + seed.phase * 1.7 + seed.z * .11) * .07
      const bend = seed.lean + gust * seed.sway
      const group = groups.current[i]
      if (!group) return
      group.position.x = seed.x + bend * seed.height * .25
      group.position.y = -3.15
      group.rotation.set(0, seed.phase, bend)
    })
  })
  return <group>{seeds.map((seed, index) => <WheatEar key={index} seed={seed} index={index} refCallback={(group, i) => { groups.current[i] = group }} />)}</group>
}

function WheatCarpet({ speed }: { speed: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.ConeGeometry(.035, 1, 4), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b7832c' }), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const patches = useMemo(() => Array.from({ length: 3600 }, (_, i) => ({
    x: (i % 60 - 29.5) * .62,
    z: (Math.floor(i / 60) - 29.5) * .62,
    h: .28 + random(i + 900) * .38,
    phase: random(i + 1200) * Math.PI * 2,
  })), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame(({ clock }) => {
    if (!mesh.current) return
    const t = clock.elapsedTime * speed
    patches.forEach((patch, i) => {
      const bend = Math.sin(t * .7 + patch.phase + patch.x * .2 + patch.z * .15) * .12
      dummy.position.set(patch.x + bend * patch.h, -3.18, patch.z)
      dummy.rotation.set(0, patch.phase, bend)
      dummy.scale.set(1, patch.h, 1)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[geometry, material, patches.length]} frustumCulled={false} />
}

function CubeFrame() {
  const geometry = useMemo(() => new THREE.BoxGeometry(30, 16, 30), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry])
  useEffect(() => () => { geometry.dispose(); edges.dispose() }, [geometry, edges])
  return <lineSegments geometry={edges} position={[0, 2, 0]}><lineBasicMaterial color="#e4d9b0" transparent opacity={.82} /></lineSegments>
}

function DuskBackdrop() {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; void main(){
      vec3 top=vec3(0.025,0.055,0.13), mid=vec3(0.12,0.10,0.19), horizon=vec3(0.78,0.28,0.10);
      float h=smoothstep(0.18,0.62,vUv.y); vec3 c=mix(horizon,mid,h); c=mix(c,top,smoothstep(0.55,1.0,vUv.y));
      float band=smoothstep(0.0,0.12,abs(vUv.y-0.42)); c*=mix(0.82,1.0,band); gl_FragColor=vec4(c,1.0);
    }`,
    depthWrite: false,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  return <mesh position={[0, 3.5, -18]}><planeGeometry args={[70, 40]} /><primitive object={material} attach="material" /></mesh>
}

function FieldFloor() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(42, 42, 16, 16)
    const colors = ['#7b551d', '#946b25', '#a8792a', '#6c4919']
    const color = new THREE.Color()
    const values = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < g.attributes.position.count; i++) {
      color.set(colors[i % colors.length])
      values[i * 3] = color.r; values[i * 3 + 1] = color.g; values[i * 3 + 2] = color.b
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(values, 3))
    return g
  }, [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.25, 0]} geometry={geometry} material={material} />
}

function FarmScene({ speed }: { speed: number }) {
  const { camera } = useThree()
  useEffect(() => { camera.position.set(0, .5, 25); camera.lookAt(0, .35, 0) }, [camera])
  return <>
    <color attach="background" args={['#081224']} />
    <DuskBackdrop />
    <fog attach="fog" args={['#160f1c', 22, 40]} />
    <ambientLight intensity={1.2} color="#5b6680" />
    <directionalLight position={[-7, 9, 8]} intensity={2.2} color="#ffd77d" />
    <directionalLight position={[8, 2, -7]} intensity={.5} color="#c47f4c" />
    <group>
      <FieldFloor />
      <WheatCarpet speed={speed} />
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
        <span>1600 DETAILED LOW-POLY EARS</span>
      </nav>
    </footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<Demo />)
