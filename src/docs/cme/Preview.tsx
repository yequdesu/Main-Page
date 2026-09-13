import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { OrthographicCamera, Vector3 } from 'three'
import { createStellarActivity } from '../../actors/assets/stellarActivity'
import { createStellarActivityChannels } from '../../behaviors/stellarActivity'
import { CME_TAIL } from '../../behaviors/stellarParticleDensity'
import { CME_END } from './model'

export interface CmePreviewProps {
  seed: number
  playback: { playing: boolean; seek: number | null }
  speed: number
  artistic: boolean
  rotation: boolean
  mist: number
  view: 'wide' | 'close' | 'oblique' | 'drift'
  revision: number
  onTime: (age: number) => void
  onEnd: () => void
}
function Scene({ seed, playback, speed, artistic, rotation, mist, view, revision, onTime, onEnd }: CmePreviewProps) {
  const { camera, size, invalidate } = useThree()
  const channels = useMemo(createStellarActivityChannels, [])
  const asset = useMemo(() => createStellarActivity(channels), [channels])
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const age = useRef(0), reported = useRef(-1)
  const target = useMemo(() => new Vector3(), [])
  useEffect(() => () => asset.dispose(), [asset])
  useEffect(() => { channels.cme.seed = seed; channels.cme.opacity = 1; reported.current = -1; invalidate() }, [seed, channels, invalidate])
  useEffect(() => { if (playback.seek !== null) age.current = playback.seek; reported.current = -1; invalidate() }, [playback, invalidate])
  useEffect(() => { asset.setCmeRotation(rotation); invalidate() }, [asset, rotation, invalidate])
  useEffect(() => { asset.setEjectionAppearance(artistic, mist); invalidate() }, [asset, artistic, mist, invalidate])
  useEffect(() => {
    const c = camera as OrthographicCamera
    target.set(0, view === 'drift' ? 6 : view === 'close' ? 1.7 : 2.8, 0)
    c.zoom = Math.min(size.width / (view === 'drift' ? 15 : view === 'close' ? 5.7 : 9), size.height / (view === 'drift' ? 14 : view === 'close' ? 3.7 : 6.2))
    c.position.copy(target).add(view === 'oblique' ? new Vector3(4, 2, 9) : new Vector3(0, 0, 10))
    c.lookAt(target); c.updateProjectionMatrix()
    controls.current?.target.copy(target); controls.current?.update(); invalidate()
  }, [camera, size.width, size.height, view, revision, target, invalidate])
  useFrame((_, delta) => {
    if (playback.playing && !document.hidden) age.current = Math.min(CME_END, age.current + Math.min(delta, 0.05) * speed)
    const c = camera as OrthographicCamera
    asset.layoutLocal(size.width, size.height, (c.top - c.bottom) / c.zoom)
    channels.cme.age = age.current
    channels.cme.opacity = age.current <= CME_TAIL.eventEnd ? 1 : 0
    asset.update()
    if (reported.current < 0 || Math.abs(age.current - reported.current) > 0.06 || age.current === CME_END) { reported.current = age.current; onTime(age.current) }
    if (playback.playing && age.current < CME_END && !document.hidden) invalidate()
    else if (playback.playing && age.current >= CME_END) onEnd()
  })
  return <>
    <primitive object={asset.root} dispose={null} />
    <gridHelper args={[16, 32, '#334051', '#162332']} position={[0, -0.05, 0]} />
    <OrbitControls ref={controls} enablePan={false} enableDamping={false} minZoom={10} maxZoom={350} minPolarAngle={0.1} maxPolarAngle={Math.PI * 0.55} />
  </>
}
export default function Preview(props: CmePreviewProps) {
  return <Canvas flat orthographic frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 2.8, 10], zoom: 80, near: 0.1, far: 100 }} aria-label="CME 三维过程预览，可拖动旋转和缩放" fallback={<p>当前环境无法启动 WebGL，仍可阅读下方过程与公式。</p>}>
    <color attach="background" args={['#080e17']} /><Scene {...props} />
  </Canvas>
}
