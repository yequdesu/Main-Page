import { useRef, useEffect, Suspense, Component, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, GizmoHelper, GizmoViewport, useProgress, Html } from '@react-three/drei'
import { Box3, Vector3, Mesh, type Group, type Material, type Object3D } from 'three'
import { MODEL_REGISTRY } from '../models'
import type { EnvPreset } from '../models'
import { useModelPreviewControls } from './ModelPreviewControls'
import { useLevaCaptureConfig } from './useLevaCaptureConfig'
import type { HelperState, ViewportMode, SceneTreeNode } from './StudioShell'

// ============================================================
// Environment presets → drei <Environment> + ambient intensity
// ============================================================

const ENV_DREI_PRESETS: Record<EnvPreset, { preset: string; ambientIntensity: number }> = {
  studio: { preset: 'studio', ambientIntensity: 1.0 },
  night:  { preset: 'night',  ambientIntensity: 0.4 },
  dawn:   { preset: 'dawn',   ambientIntensity: 0.7 },
  sunset: { preset: 'sunset', ambientIntensity: 0.6 },
}

// ============================================================
// Loader
// ============================================================

function Loader() {
  const { progress, active } = useProgress()
  return (
    <Html center>
      <div style={{
        color: '#94a3b8', fontFamily: "'Courier New', 'Consolas', monospace",
        fontSize: 14, textAlign: 'center', userSelect: 'none',
      }}>
        {active ? `加载中... ${progress.toFixed(0)}%` : '就绪'}
      </div>
    </Html>
  )
}

// ============================================================
// Error Boundary
// ============================================================

interface ErrorBoundaryState { error: Error | null }
class ModelErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div style={{ color: '#ef4444', fontFamily: "'Courier New', 'Consolas', monospace", fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
            <p>模型加载失败</p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>{this.state.error.message}</p>
          </div>
        </Html>
      )
    }
    return this.props.children
  }
}

// ============================================================
// RendererStats — 写 renderer.info 到 canvas dataset
// ============================================================

function RendererStats() {
  const { gl } = useThree()
  useFrame(() => {
    const canvas = gl.domElement
    canvas.setAttribute('data-drawcalls', String(gl.info.render.calls))
    canvas.setAttribute('data-triangles', String(gl.info.render.triangles))
  })
  return null
}

// ============================================================
// StudioLights — 通用场景灯光 + 可选 Lighthouse 截图控件
// ============================================================

function StudioLights({ env, showCaptureControls }: { env: EnvPreset; showCaptureControls: boolean }) {
  const config = useModelPreviewControls()
  // Lighthouse 截图专属控件 — 条件调用以注入 Leva
  if (showCaptureControls) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLevaCaptureConfig()
  }
  const ambientIntensity = ENV_DREI_PRESETS[env].ambientIntensity
  return (
    <>
      <ambientLight color={config.ambientColor} intensity={ambientIntensity * config.ambientIntensity} />
      <directionalLight color={config.keyColor} intensity={config.keyIntensity} position={[config.keyX, config.keyY, config.keyZ]} />
      <directionalLight color={config.fillColor} intensity={config.fillIntensity} position={[config.fillX, config.fillY, config.fillZ]} />
    </>
  )
}

// ============================================================
// HelperOverlay — Grid / Axes / BBox / Wireframe
// ============================================================

const _bbox = new Box3()
const _bboxCenter = new Vector3()
const _bboxSize = new Vector3()

function BoundingBoxHelper({ object3d }: { object3d: Object3D | null }) {
  if (!object3d) return null
  _bbox.setFromObject(object3d)
  if (_bbox.isEmpty()) return null
  _bbox.getCenter(_bboxCenter)
  _bbox.getSize(_bboxSize)
  return (
    <mesh position={_bboxCenter.toArray()} renderOrder={999}>
      <boxGeometry args={[_bboxSize.x, _bboxSize.y, _bboxSize.z]} />
      <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.4} depthTest={false} />
    </mesh>
  )
}

function WireframeOverlay({ object3d, active }: { object3d: Object3D | null; active: boolean }) {
  const prevRef = useRef(false)
  useEffect(() => {
    if (!object3d) return
    if (prevRef.current === active) return
    prevRef.current = active
    object3d.traverse((child) => {
      if (child instanceof Mesh) {
        const mat = child.material as Material
        if ('wireframe' in mat && typeof mat.wireframe === 'boolean') {
          mat.wireframe = active
        }
      }
    })
  }, [object3d, active])
  return null
}

function HelperOverlay({ helpers, modelRef }: { helpers: HelperState; modelRef: React.RefObject<Group | null> }) {
  return (
    <>
      {helpers.grid && <gridHelper args={[20, 20, '#1e293b', '#0f172a']} renderOrder={998} />}
      {helpers.axes && <axesHelper args={[5]} renderOrder={998} />}
      {helpers.bbox && <BoundingBoxHelper object3d={modelRef.current} />}
      <WireframeOverlay object3d={modelRef.current} active={helpers.wireframe} />
    </>
  )
}

// ============================================================
// ModelRenderer
// ============================================================

function buildSceneTree(obj: Object3D): SceneTreeNode[] {
  return obj.children
    .filter((c) => c.type !== 'GridHelper' && c.type !== 'AxesHelper')
    .map((c) => ({
      name: c.name || c.type,
      uuid: c.uuid,
      type: c.type,
      children: buildSceneTree(c),
    }))
}

function ModelRenderer({
  modelKey, modelRef, onSceneTreeUpdate, entry,
}: {
  modelKey: string
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
  entry: typeof MODEL_REGISTRY[string] | undefined
}) {
  const config = useModelPreviewControls()

  // 模型加载后扫描场景树（延迟一帧等 children 挂载）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (modelRef.current) {
        onSceneTreeUpdate(buildSceneTree(modelRef.current))
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [modelKey, modelRef, onSceneTreeUpdate])

  if (!entry) return null
  const ModelComponent = entry.component

  return (
    <group
      ref={modelRef}
      position={[config.modelX, config.modelY, config.modelZ]}
      scale={config.modelScale}
      rotation={[config.modelRotX, config.modelRotY, config.modelRotZ]}
    >
      <ModelErrorBoundary>
        <Suspense fallback={<Loader />}>
          <ModelComponent />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  )
}

// ============================================================
// SingleViewportCanvas
// ============================================================

function SingleViewportCanvas({
  env, helpers, modelKey, entry, modelRef, onSceneTreeUpdate, cameraOverride, showCaptureControls,
}: {
  env: EnvPreset
  helpers: HelperState
  modelKey: string
  entry: typeof MODEL_REGISTRY[string] | undefined
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
  cameraOverride?: { fov: number; position: [number, number, number] }
  showCaptureControls: boolean
}) {
  const defaultCam = cameraOverride ?? { fov: 45, position: [5, 3, 8] }

  return (
    <Canvas
      flat
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: defaultCam.fov, near: 0.01, far: 1000, position: defaultCam.position }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
        logarithmicDepthBuffer: true,
      }}
    >
      <color attach="background" args={['#050811']} />
      <RendererStats />

      <Environment preset={ENV_DREI_PRESETS[env].preset as any} background={false} />
      <StudioLights env={env} showCaptureControls={showCaptureControls} />
      <HelperOverlay helpers={helpers} modelRef={modelRef} />

      <GizmoHelper alignment="top-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#94a3b8" />
      </GizmoHelper>

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.1}
        minDistance={0.1}
        maxDistance={500}
      />

      <ModelRenderer
        modelKey={modelKey}
        modelRef={modelRef}
        onSceneTreeUpdate={onSceneTreeUpdate}
        entry={entry}
      />
    </Canvas>
  )
}

// ============================================================
// StudioViewport — 中栏入口
// ============================================================

interface StudioViewportProps {
  modelKey: string
  env: EnvPreset
  helpers: HelperState
  viewportMode: ViewportMode
  selectedNode: Object3D | null
  modelRef: React.RefObject<Group | null>
  onSceneTreeUpdate: (tree: SceneTreeNode[]) => void
}

const QUAD_CAMERAS: Record<string, { fov: number; position: [number, number, number] }> = {
  front: { fov: 45, position: [0, 0, 10] },
  side:  { fov: 45, position: [10, 0, 0] },
  top:   { fov: 45, position: [0, 10, 0] },
}

export default function StudioViewport({
  modelKey, env, helpers, viewportMode, selectedNode, modelRef, onSceneTreeUpdate,
}: StudioViewportProps) {
  const entry = MODEL_REGISTRY[modelKey]
  const cameraOverride = entry?.defaultCamera
  const showCaptureControls = entry?.debugControls === 'lighthouse-capture'
  const canvasProps = { env, helpers, modelKey, entry, modelRef, onSceneTreeUpdate, showCaptureControls }

  return (
    <div className="studio-viewport">
      {viewportMode === 'single' && (
        <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} />
      )}
      {viewportMode === 'split' && (
        <div className="viewport-split">
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} />
          </div>
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} helpers={{ ...helpers, wireframe: true }} />
          </div>
        </div>
      )}
      {viewportMode === 'quad' && (
        <div className="viewport-quad">
          {(['front', 'side', 'top'] as const).map((view) => (
            <div key={view} style={{ position: 'relative' }}>
              <SingleViewportCanvas {...canvasProps} cameraOverride={QUAD_CAMERAS[view]} />
            </div>
          ))}
          <div style={{ position: 'relative' }}>
            <SingleViewportCanvas {...canvasProps} cameraOverride={cameraOverride} />
          </div>
        </div>
      )}
    </div>
  )
}
