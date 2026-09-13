import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import {
  AnimationMixer,
  Box3,
  BoxHelper,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Spherical,
  Vector3,
  type AnimationClip,
  type Object3D,
} from 'three'
import { MODEL_REGISTRY, type EnvPreset, type ModelRegistryEntry } from '../models'
import type { ModelPreviewConfig } from './ModelPreviewControls'
import { cloneForViewport, fitCamera, indexScene, localBounds, nodeIsVisible } from './studioModel'
import { captureViewport } from './captureViewport'
import {
  VIEW_LABELS,
  type AnimationState,
  type CameraPose,
  type HelperState,
  type SceneTreeNode,
  type ViewHandle,
  type ViewId,
  type ViewportMode,
} from './studioTypes'

export interface ModelReady {
  tree: SceneTreeNode[]
  objects: Map<string, Object3D>
  clips: string[]
}
interface Props {
  modelKey: string
  viewportMode: ViewportMode
  config: ModelPreviewConfig
  env: EnvPreset
  helpers: HelperState
  selectedId: string | null
  hiddenIds: string[]
  isolatedId: string | null
  activeView: ViewId
  animation: AnimationState
  previewTime: () => number
  initialPoses?: Partial<Record<ViewId, CameraPose>>
  onActiveView: (id: ViewId) => void
  onSelect: (id: string | null) => void
  onModelReady: (model: ModelReady) => void
  onCameraChange: (id: ViewId, pose: CameraPose, user: boolean) => void
  register: (id: ViewId, handle: ViewHandle | null) => void
}
const DIRECTIONS = {
  perspective: [5, 3, 8],
  wireframe: [5, 3, 8],
  front: [0, 0, 1],
  side: [1, 0, 0],
  top: [0, 1, 0],
} as const
const ENV_LIGHTS = {
  studio: { ambient: 1, key: '#ffffff', fill: '#dce8ff' },
  night: { ambient: 0.4, key: '#b8d3ff', fill: '#8c9eff' },
  dawn: { ambient: 0.7, key: '#ffd7b0', fill: '#bdceff' },
  sunset: { ambient: 0.6, key: '#ffb178', fill: '#cfb5ff' },
}
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="viewport-message" role="status">
        加载模型 {Math.round(progress)}%
      </div>
    </Html>
  )
}
class ModelErrorBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    return this.state.error ? (
      <Html center>
        <div className="viewport-message" role="alert">
          <strong>模型加载失败</strong>
          <p>{this.state.error.message}</p>
          <button onClick={this.props.retry}>重试加载</button>
        </div>
      </Html>
    ) : (
      this.props.children
    )
  }
}
function GLBModel({ path, onClips }: { path: string; onClips: (clips: AnimationClip[]) => void }) {
  const asset = useGLTF(path)
  const instance = useMemo(() => cloneForViewport(asset.scene), [asset.scene])
  useLayoutEffect(() => {
    onClips(asset.animations)
  }, [asset.animations, onClips])
  useEffect(() => () => instance.dispose(), [instance])
  return <primitive object={instance.root} dispose={null} />
}
interface LoadedModel {
  root: Group
  raw: Group
  objects: Map<string, Object3D>
  tree: SceneTreeNode[]
}
function LoadedAsset({
  entry,
  config,
  onReady,
  onSelect,
  onClips,
  previewTime,
}: {
  entry: ModelRegistryEntry
  config: ModelPreviewConfig
  onReady: (model: LoadedModel) => void
  onSelect: Props['onSelect']
  onClips: (clips: AnimationClip[]) => void
  previewTime: () => number
}) {
  const root = useRef<Group>(null!)
  const normalizer = useRef<Group>(null!)
  const raw = useRef<Group>(null!)
  const Model = entry.component
  const reportReady = useCallback(() => {
    raw.current.updateWorldMatrix(true, true)
    const bounds = localBounds(raw.current)
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new Vector3())
    const extent = bounds.getSize(new Vector3())
    const scale = 4 / Math.max(extent.x, extent.y, extent.z, 0.001)
    normalizer.current.scale.setScalar(scale)
    normalizer.current.position.copy(center).multiplyScalar(-scale)
    root.current.updateWorldMatrix(true, true)
    onReady({ root: root.current, raw: raw.current, ...indexScene(raw.current) })
  }, [onReady])
  useLayoutEffect(() => {
    // 程序化预览在每次实例创建后报告就绪（含 HMR）；其他资产沿用挂载后索引。
    if (!entry.previewAnimation) reportReady()
  }, [entry.previewAnimation, reportReady])
  return (
    <group
      ref={root}
      position={[config.modelX, config.modelY, config.modelZ]}
      scale={config.modelScale}
      rotation={[config.modelRotX, config.modelRotY, config.modelRotZ]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(event.object.userData.studioNodeId ?? null)
      }}
    >
      <group ref={normalizer}>
        <group ref={raw}>
          {entry.glbPath ? <GLBModel path={entry.glbPath} onClips={onClips} /> : (
            <Model standalone previewTime={previewTime} onAssetReady={reportReady} />
          )}
        </group>
      </group>
    </group>
  )
}

function Scene({
  id,
  primary,
  props,
  retry,
  retryModel,
}: {
  id: ViewId
  primary: boolean
  props: Props
  retry: number
  retryModel: () => void
}) {
  const { camera: baseCamera, gl, scene, size, invalidate } = useThree()
  const camera = baseCamera as PerspectiveCamera | OrthographicCamera
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null!)
  const [loaded, setLoaded] = useState<LoadedModel | null>(null)
  const [clips, setClips] = useState<AnimationClip[]>([])
  const latest = useRef(props)
  latest.current = props
  const selectionBox = useRef<BoxHelper | null>(null)
  const wholeBox = useRef<BoxHelper | null>(null)
  const stats = useRef({ frames: 0, calls: 0, triangles: 0, lastRender: 0 })
  const entry = MODEL_REGISTRY[props.modelKey]
  const orthographic = id !== 'perspective' && id !== 'wireframe'
  const config = props.config
  const restored = useRef(false)
  const fitted = useRef(false)
  const pose = useCallback(() => {
    const offset = camera.position.clone().sub(controls.current?.target ?? new Vector3())
    const spherical = new Spherical().setFromVector3(offset)
    return {
      distance: spherical.radius,
      azimuth: (spherical.theta * 180) / Math.PI,
      elevation: 90 - (spherical.phi * 180) / Math.PI,
      target: controls.current.target.toArray(),
      zoom: camera.zoom,
    }
  }, [camera])
  const reportPose = useCallback(
    (user = false) => latest.current.onCameraChange(id, pose(), user),
    [id, pose],
  )
  const fit = useCallback(
    (selected = false, reset = false) => {
      if (!loaded || !controls.current) return
      const object =
        selected && latest.current.selectedId
          ? (loaded.objects.get(latest.current.selectedId) ?? loaded.root)
          : loaded.root
      object.updateWorldMatrix(true, true)
      const direction =
        reset || orthographic
          ? new Vector3(...DIRECTIONS[id])
          : camera.position.clone().sub(controls.current.target)
      const center = fitCamera(
        camera,
        entry.previewAnimation
          ? localBounds(object).applyMatrix4(object.matrixWorld)
          : new Box3().setFromObject(object),
        size.width / Math.max(size.height, 1),
        direction,
      )
      if (!center) return
      controls.current.target.copy(center)
      controls.current.update()
      invalidate()
      reportPose()
    },
    [loaded, camera, id, orthographic, size.width, size.height, invalidate, reportPose, entry.previewAnimation],
  )
  const onReady = useCallback((model: LoadedModel) => {
    setLoaded(model)
  }, [])
  useEffect(() => {
    if (loaded && primary)
      props.onModelReady({ tree: loaded.tree, objects: loaded.objects, clips: clips.map((c) => c.name) })
  }, [loaded, primary, clips, props.onModelReady])
  useEffect(() => {
    if (loaded) {
      fit(false, !fitted.current)
      fitted.current = true
    }
  }, [fit, loaded])
  useEffect(() => {
    if (!loaded) return
    const handle: ViewHandle = {
      root: loaded.root,
      lighthouse: entry.debugControls === 'lighthouse-capture' ? (loaded.raw.children[0] as Group) : null,
      fit,
      pose,
      stats: stats.current,
      setPose: (next) => {
        if (!controls.current) return
        if (next.target) controls.current.target.fromArray(next.target)
        if (orthographic && next.zoom) {
          camera.zoom = next.zoom
          camera.updateProjectionMatrix()
        }
        const offset = new Vector3().setFromSpherical(
          new Spherical(
            Math.max(0.01, next.distance),
            ((90 - Math.max(-89.9, Math.min(89.9, next.elevation))) * Math.PI) / 180,
            (next.azimuth * Math.PI) / 180,
          ),
        )
        camera.position.copy(controls.current.target).add(offset)
        camera.lookAt(controls.current.target)
        controls.current.update()
        invalidate()
        reportPose()
      },
      capture: (options) => captureViewport(gl, scene, camera, options),
    }
    if (!restored.current) {
      const initial = latest.current.initialPoses?.[id]
      if (initial) handle.setPose(initial)
      restored.current = true
    }
    props.register(id, handle)
    return () => props.register(id, null)
  }, [
    loaded,
    entry.debugControls,
    orthographic,
    fit,
    pose,
    gl,
    scene,
    camera,
    invalidate,
    reportPose,
    id,
    props.register,
  ])

  useEffect(() => {
    if (!loaded) return
    loaded.objects.forEach((object, path) => {
      object.visible =
        object.userData.studioInitialVisible !== false &&
        nodeIsVisible(path, props.hiddenIds, props.isolatedId)
      if (object instanceof Mesh) {
        const mats = Array.isArray(object.material) ? object.material : [object.material]
        mats.forEach((mat) => {
          if ('wireframe' in mat) mat.wireframe = id === 'wireframe' || props.helpers.wireframe
        })
      }
    })
    invalidate()
  }, [loaded, props.hiddenIds, props.isolatedId, props.helpers.wireframe, id, invalidate])
  useEffect(() => {
    if (!loaded) return
    const boxes: BoxHelper[] = []
    const selected = props.selectedId ? loaded.objects.get(props.selectedId) : null
    if (selected) {
      selectionBox.current = new BoxHelper(selected, '#67c9de')
      boxes.push(selectionBox.current)
    }
    if (props.helpers.bbox) {
      wholeBox.current = new BoxHelper(loaded.root, '#94a3b8')
      boxes.push(wholeBox.current)
    }
    boxes.forEach((box) => {
      box.userData.studioHelper = true
      box.renderOrder = 999
      scene.add(box)
    })
    invalidate()
    return () => {
      boxes.forEach((box) => {
        scene.remove(box)
        box.geometry.dispose()
        box.material.dispose()
      })
      selectionBox.current = null
      wholeBox.current = null
    }
  }, [loaded, props.selectedId, props.helpers.bbox, scene, invalidate])
  const mixer = useMemo(() => (loaded ? new AnimationMixer(loaded.raw) : null), [loaded])
  useEffect(() => {
    // 自动旋转的启停明确接入 demand 循环，停止后同步最终相机数值。
    invalidate()
    if (!config.autoRotate) reportPose()
  }, [config.autoRotate, invalidate, reportPose])
  useEffect(() => {
    if (!mixer || !props.animation.clip) return
    const clip = clips.find((c) => c.name === props.animation.clip)
    if (!clip) return
    const action = mixer.clipAction(clip)
    action.play()
    action.paused = !latest.current.animation.playing
    invalidate()
    return () => {
      action.stop()
    }
  }, [mixer, clips, props.animation.clip, invalidate])
  useEffect(() => {
    const clip = clips.find((c) => c.name === props.animation.clip)
    if (mixer && clip) {
      mixer.clipAction(clip).paused = !props.animation.playing
      invalidate()
    }
  }, [mixer, clips, props.animation.clip, props.animation.playing, invalidate])
  useEffect(
    () => () => {
      if (mixer && loaded) {
        mixer.stopAllAction()
        mixer.uncacheRoot(loaded.raw)
      }
    },
    [mixer, loaded],
  )
  useEffect(() => {
    // 程序化动画从暂停、停止或速度变化进入下一帧；播放期间才持续请求渲染。
    if (entry.previewAnimation) invalidate()
  }, [entry.previewAnimation, props.animation, invalidate])
  useFrame((_, delta) => {
    if (config.autoRotate && !orthographic) invalidate()
    if (mixer && props.animation.playing && props.animation.clip) {
      mixer.update(Math.min(delta, 0.1) * props.animation.speed)
      invalidate()
    }
    if (entry.previewAnimation && props.animation.playing && props.animation.clip) invalidate()
    selectionBox.current?.update()
    wholeBox.current?.update()
    gl.render(scene, camera)
    const record = stats.current
    record.frames++
    record.calls = gl.info.render.calls
    record.triangles = gl.info.render.triangles
    record.lastRender = performance.now()
  }, 1)
  const env = ENV_LIGHTS[props.env]
  return (
    <>
      <color attach="background" args={[config.backgroundColor]} />
      <ambientLight color={config.ambientColor} intensity={config.ambientIntensity * env.ambient} />
      <directionalLight
        color={config.keyColor === '#aed2ff' ? env.key : config.keyColor}
        intensity={config.keyIntensity}
        position={[config.keyX, config.keyY, config.keyZ]}
      />
      <directionalLight
        color={config.fillColor === '#ffffff' ? env.fill : config.fillColor}
        intensity={config.fillIntensity}
        position={[config.fillX, config.fillY, config.fillZ]}
      />
      <group userData={{ studioHelper: true }}>
        {props.helpers.grid && <gridHelper args={[12, 12, '#394558', '#202b3c']} position={[0, -2.05, 0]} />}
        {props.helpers.axes && <axesHelper args={[3]} />}
      </group>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enableRotate={!orthographic}
        autoRotate={!orthographic && config.autoRotate}
        autoRotateSpeed={config.autoRotateSpeed}
        minDistance={0.1}
        maxDistance={500}
        onEnd={() => reportPose(true)}
      />
      <ModelErrorBoundary key={`${props.modelKey}:${retry}`} retry={retryModel}>
        <Suspense fallback={<Loader />}>
          <LoadedAsset
            entry={entry}
            config={config}
            onReady={onReady}
            onSelect={props.onSelect}
            onClips={setClips}
            previewTime={props.previewTime}
          />
        </Suspense>
      </ModelErrorBoundary>
    </>
  )
}
function View({ id, props }: { id: ViewId; props: Props }) {
  const [retry, setRetry] = useState(0)
  const orthographic = id !== 'perspective' && id !== 'wireframe'
  const retryModel = () => {
    const path = MODEL_REGISTRY[props.modelKey].glbPath
    if (path) useGLTF.clear(path)
    setRetry((value) => value + 1)
  }
  return (
    <section
      className={`studio-view ${props.activeView === id ? 'active' : ''}`}
      aria-label={`${VIEW_LABELS[id]}视口`}
      onPointerDownCapture={() => props.onActiveView(id)}
    >
      <div className="view-heading">
        <button aria-pressed={props.activeView === id} onClick={() => props.onActiveView(id)}>
          {VIEW_LABELS[id]}
          {orthographic ? ' · 正交' : ''}
        </button>
        <span>{id === 'wireframe' ? '独立线框材质' : '拖动查看 · 滚轮缩放'}</span>
      </div>
      <Canvas
        key={`${props.modelKey}:${id}`}
        flat
        frameloop="demand"
        dpr={[1, 2]}
        orthographic={orthographic}
        camera={{
          position: [...DIRECTIONS[id]],
          fov: 45,
          near: 0.01,
          far: 1000,
          ...(id === 'top' ? { up: [0, 0, -1] as [number, number, number] } : {}),
        }}
        fallback={<p role="alert">此浏览器无法创建 WebGL 视口。</p>}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Scene id={id} primary={id === 'perspective'} props={props} retry={retry} retryModel={retryModel} />
      </Canvas>
    </section>
  )
}
export default function StudioViewport(props: Props) {
  const views: ViewId[] =
    props.viewportMode === 'quad'
      ? ['front', 'side', 'top', 'perspective']
      : props.viewportMode === 'split'
        ? ['perspective', 'wireframe']
        : ['perspective']
  return (
    <div className={`studio-viewport viewport-${props.viewportMode}`}>
      {views.map((id) => (
        <View key={id} id={id} props={props} />
      ))}
    </div>
  )
}
