import { useRef, Suspense, Component } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useProgress, Html } from '@react-three/drei'
import { Mesh, type Group, type Material } from 'three'
import { useModelPreviewControls, type ModelPreviewConfig } from './ModelPreviewControls'
import { MODEL_REGISTRY, type ModelRegistryEntry } from '../models'
import './ModelPreviewPanel.css'

// ============================================================
// ModelErrorBoundary — 捕获 GLB 加载/渲染错误
// ============================================================

interface ErrorBoundaryState { error: Error | null }
class ModelErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <Html center>
          <div style={{
            color: '#ef4444', fontFamily: "'Courier New', 'Consolas', monospace",
            fontSize: 13, textAlign: 'center', maxWidth: 320,
          }}>
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
// PreviewLights — Leva 驱动的场景灯光
// ============================================================

function PreviewLights({ config }: { config: ModelPreviewConfig }) {
  return (
    <>
      <ambientLight color={config.ambientColor} intensity={config.ambientIntensity} />
      <directionalLight
        color={config.keyColor}
        intensity={config.keyIntensity}
        position={[config.keyX, config.keyY, config.keyZ]}
      />
      <directionalLight
        color={config.fillColor}
        intensity={config.fillIntensity}
        position={[config.fillX, config.fillY, config.fillZ]}
      />
    </>
  )
}

// ============================================================
// WireframeController — 遍历模型子节点切换线框
// ============================================================

function WireframeController({ wireframe, modelRef }: { wireframe: boolean; modelRef: React.RefObject<Group | null> }) {
  const prevWireframe = useRef(false)

  // 用 ref 跟踪上次值，仅在变化时遍历（性能）
  if (prevWireframe.current !== wireframe && modelRef.current) {
    prevWireframe.current = wireframe
    modelRef.current.traverse((child) => {
      if (child instanceof Mesh) {
        const mat = child.material as Material
        if ('wireframe' in mat && typeof mat.wireframe === 'boolean') {
          mat.wireframe = wireframe
        }
      }
    })
  }

  return null
}

// ============================================================
// Loader — drei useProgress 加载进度
// ============================================================

function Loader() {
  const { progress, active } = useProgress()
  return (
    <Html center>
      <div style={{
        color: '#94a3b8',
        fontFamily: "'Courier New', 'Consolas', monospace",
        fontSize: 14,
        textAlign: 'center',
        userSelect: 'none',
      }}>
        {active ? `加载中... ${progress.toFixed(0)}%` : '就绪'}
      </div>
    </Html>
  )
}

// ============================================================
// ModelRenderer — 根据 modelKey 渲染对应模型组件
// ============================================================

function ModelRenderer({
  modelKey, config, modelRef,
}: { modelKey: string; config: ModelPreviewConfig; modelRef: React.RefObject<Group | null> }) {
  const entry = MODEL_REGISTRY[modelKey]
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
// ModelInfoPanel — 模型元数据
// ============================================================

function ModelInfoPanel({ entry }: { entry: ModelRegistryEntry | undefined }) {
  if (!entry) return null
  return (
    <div className="model-info-section">
      <h3>模型信息</h3>
      <p><span className="info-label">名称：</span>{entry.label}</p>
      {entry.triCount != null && (
        <p><span className="info-label">三角面：</span>~{entry.triCount.toLocaleString()}</p>
      )}
      {entry.procedural && (
        <p><span className="info-label">类型：</span>程序化几何</p>
      )}
      {entry.glbPath && (
        <p><span className="info-label">路径：</span>{entry.glbPath}</p>
      )}
      {entry.attribution && (
        <p><span className="info-label">来源：</span>{entry.attribution}</p>
      )}
    </div>
  )
}

// ============================================================
// ModelPreviewPanel — 通用模型查看器
//
// 双栏布局：
//   左侧 — R3F Canvas（OrbitControls + 动态灯光 + 模型）
//   右侧 — 模型信息
//
// 相机由 OrbitControls 全权管理（makeDefault），不设 CameraController
// 避免与 OrbitControls 争抢，且自动适配不同模型的包围盒。
//
// 援引：drei OrbitControls + Leva 集成模式
//       R3F flat + frameloop="demand"（CLAUDE.md 约束）
// ============================================================

interface ModelPreviewPanelProps {
  modelKey: string
}

export default function ModelPreviewPanel({ modelKey }: ModelPreviewPanelProps) {
  const config = useModelPreviewControls()
  const entry = MODEL_REGISTRY[modelKey]
  const modelRef = useRef<Group>(null)

  return (
    <div className="model-preview-panel">
      {/* ---- 左侧：3D 场景 ---- */}
      <div className="preview-canvas">
        <Canvas
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 45, near: 0.01, far: 1000, position: [5, 3, 8] }}
          style={{ position: 'absolute', inset: 0 }}
          gl={{
            preserveDrawingBuffer: false,
            failIfMajorPerformanceCaveat: false,
            logarithmicDepthBuffer: true,
          }}
        >
          <color attach="background" args={[config.backgroundColor]} />

          <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            enableDamping
            dampingFactor={0.1}
            minDistance={0.1}
            maxDistance={500}
          />
          <PreviewLights config={config} />
          <WireframeController wireframe={config.wireframe} modelRef={modelRef} />

          <ModelRenderer modelKey={modelKey} config={config} modelRef={modelRef} />
        </Canvas>
      </div>

      {/* ---- 右侧：模型信息 ---- */}
      <div className="preview-controls">
        <ModelInfoPanel entry={entry} />
      </div>
    </div>
  )
}
