import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { OrthographicCamera, Vector3 } from 'three'
import { createStellarActivity } from '../../actors/assets/stellarActivity'
import { createStellarActivityChannels } from '../../behaviors/stellarActivity'
import type { ProminenceMorphology } from '../../behaviors/stellarMorphology'
import { MAX_AGE, PREVIEW_AGE } from './model'

export interface Playback { playing: boolean; seek: number | null }
export interface PreviewProps {
  kind: ProminenceMorphology
  seed: number
  playback: Playback
  speed: number
  view: 'front' | 'oblique'
  viewRevision: number
  markers: boolean
  redraw: boolean
  feet: [number, number, number][]
  onTime: (age: number) => void
  onEnd: () => void
}

function Scene({ kind, seed, playback, speed, view, viewRevision, markers, redraw, feet, onTime, onEnd }: PreviewProps) {
  const { camera, size, invalidate } = useThree()
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const age = useRef(PREVIEW_AGE), reported = useRef(-1)
  const channels = useMemo(createStellarActivityChannels, [])
  const asset = useMemo(() => createStellarActivity(channels), [channels])
  const feetArray = useMemo(() => new Float32Array(feet.flat()), [feet])
  const target = useMemo(() => new Vector3(0, 0.78, 0), [])

  useEffect(() => () => asset.dispose(), [asset])
  useEffect(() => { asset.setRedrawDiagnostic(redraw); invalidate() }, [asset, redraw, invalidate])
  useEffect(() => {
    Object.assign(channels.prominences[0], { seed, morphology: kind, opacity: 1 })
    age.current = PREVIEW_AGE; reported.current = -1
    invalidate()
  }, [channels, kind, seed, invalidate])
  useEffect(() => {
    if (playback.seek !== null) age.current = playback.seek
    reported.current = -1
    invalidate()
  }, [playback, invalidate])
  useEffect(() => {
    const ortho = camera as OrthographicCamera
    ortho.zoom = Math.min(size.width / 5.2, size.height / 2.5)
    ortho.position.copy(target).add(view === 'front' ? new Vector3(0, 0, 8) : new Vector3(3.8, 1.7, 7))
    ortho.lookAt(target)
    ortho.updateProjectionMatrix()
    controls.current?.target.copy(target)
    controls.current?.update()
    invalidate()
  }, [camera, size.width, size.height, view, viewRevision, target, invalidate])

  useFrame((_, delta) => {
    if (playback.playing && !document.hidden) age.current = Math.min(MAX_AGE, age.current + Math.min(delta, 0.05) * speed)
    const ortho = camera as OrthographicCamera
    asset.layoutLocal(size.width, size.height, (ortho.top - ortho.bottom) / ortho.zoom)
    channels.prominences[0].age = age.current
    asset.update()
    if (reported.current < 0 || Math.abs(age.current - reported.current) >= 0.1 || age.current === MAX_AGE) {
      reported.current = age.current; onTime(age.current)
    }
    if (playback.playing && age.current < MAX_AGE && !document.hidden) invalidate()
    else if (playback.playing && age.current >= MAX_AGE) onEnd()
  })
  return <>
    <primitive object={asset.root} dispose={null} />
    <gridHelper args={[6, 18, '#2a3948', '#14202c']} position={[0, -0.04, 0]} />
    {markers && <points renderOrder={4}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[feetArray, 3]} /></bufferGeometry>
      <pointsMaterial color="#a3c5dc" size={4} sizeAttenuation={false} transparent opacity={0.85} depthWrite={false} />
    </points>}
    <OrbitControls ref={controls} target={target} enablePan={false} enableDamping={false} minZoom={35} maxZoom={420} minPolarAngle={0.15} maxPolarAngle={Math.PI * 0.57} />
  </>
}

export default function Preview(props: PreviewProps) {
  return <Canvas flat orthographic frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 0.78, 8], zoom: 100, near: 0.1, far: 100 }}
    fallback={<div className="preview-fallback">当前环境无法启动 3D 预览。下方六类结构的 SVG 概览仍可使用种子生成。</div>}
    aria-label="磁拱环三维预览，可拖动旋转和滚轮缩放">
    <color attach="background" args={['#080e17']} />
    <Scene {...props} />
  </Canvas>
}
