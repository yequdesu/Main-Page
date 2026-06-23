import { useState, useCallback, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { Leva } from 'leva'
import Lighthouse, { _lighthouseGroupRef } from '../actors/Lighthouse'
import { useLevaCaptureConfig } from './useLevaCaptureConfig'
import { offscreenCapture, DEFAULT_CAPTURE_CONFIG, type CaptureConfig } from '../actors/LighthouseCaptureTypes'
import './LighthousePreviewPanel.css'

/**
 * LighthousePreviewPanel — 灯塔截图参数实时调试面板。
 *
 * 双栏布局：
 *   左侧 — R3F Canvas，渲染灯塔 + 由 Leva 驱动的灯光/相机
 *   右侧 — Leva 控制面板 + 离屏烘焙截图预览 + Save/Recover
 *
 * 通过 debug.html 入口访问，不参与生产构建。
 * 配置端点：GET /__debug/config（加载 YAML），POST /__debug/save-config（保存），
 *           DELETE /__debug/config（恢复默认值）。
 *
 * 援引：Leva + R3F 集成模式 — pmndrs 生态
 */

// ============================================================
// 配置加载（模块级，fetch 仅执行一次）
// ============================================================

let _configPromise: Promise<Partial<CaptureConfig>> | null = null

function fetchConfig(): Promise<Partial<CaptureConfig>> {
  if (!_configPromise) {
    _configPromise = fetch('/__debug/config')
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}))
  }
  return _configPromise
}

/** 清除模块级缓存，供 Recover 后重新加载使用 */
function clearConfigCache() {
  _configPromise = null
}

// ============================================================
// CameraController — 将 Leva config 同步到 R3F camera
// ============================================================

function CameraController({ config }: { config: CaptureConfig }) {
  const { camera } = useThree()
  const pcam = camera as PerspectiveCamera

  useEffect(() => {
    pcam.fov = config.cameraFov
    pcam.position.set(0, config.cameraY, config.cameraZ)
    pcam.lookAt(0, -1.7, -16)
    pcam.updateProjectionMatrix()
  }, [config, pcam])

  return null
}

// ============================================================
// PreviewLights — 由 Leva config 驱动的场景灯光
// ============================================================

function PreviewLights({ config }: { config: CaptureConfig }) {
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
// LighthousePreviewPanel
// ============================================================

export default function LighthousePreviewPanel() {
  // ---- 从服务端 YAML 加载初始配置（阻塞首次渲染） ----
  const [initialConfig, setInitialConfig] = useState<Partial<CaptureConfig> | null>(null)

  useEffect(() => {
    fetchConfig().then(setInitialConfig)
  }, [])

  // 等待配置加载完成再渲染 Leva 控件，确保初始值与服务端一致
  if (initialConfig === null) return null

  return <LighthousePreviewInner initialConfig={initialConfig} />
}

// ============================================================
// LighthousePreviewInner — 配置就绪后的实际内容
// ============================================================

function LighthousePreviewInner({ initialConfig }: { initialConfig: Partial<CaptureConfig> }) {
  const config = useLevaCaptureConfig(initialConfig)
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null)
  const [autoCapture, setAutoCapture] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const debounceRef = useRef<number | undefined>(undefined)

  // ---- 离屏烘焙 ----
  const doCapture = useCallback(() => {
    const url = offscreenCapture(config, _lighthouseGroupRef)
    setCapturedUrl(url)
  }, [config])

  // 自动捕获（防抖 300ms）
  useEffect(() => {
    if (!autoCapture) return
    clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(doCapture, 300)
    return () => clearTimeout(debounceRef.current)
  }, [config, autoCapture, doCapture])

  // ---- 保存到 YAML ----
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/__debug/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        setSaveStatus('ok')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('err')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch {
      setSaveStatus('err')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setSaving(false)
    }
  }, [config])

  // ---- 恢复默认值 ----
  const handleRecover = useCallback(async () => {
    try {
      await fetch('/__debug/config', { method: 'DELETE' })
    } catch { /* 404 也无所谓 */ }
    clearConfigCache()
    window.location.reload()
  }, [])

  // ---- 清理 ----
  useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  const [canvasReady, setCanvasReady] = useState(false)

  // YAML 配置文件存在检测
  const hasFile = Object.keys(initialConfig).length > 0

  return (
    <div className="lighthouse-preview-panel">
      {/* ---- 左侧：实时 3D 场景 ---- */}
      <div className="preview-canvas">
        <Canvas
          camera={{ fov: config.cameraFov, near: 0.1, far: 50, position: [0, 0, 9] }}
          onCreated={() => setCanvasReady(true)}
        >
          <color attach="background" args={['#050811']} />

          <CameraController config={config} />
          <PreviewLights config={config} />

          <Lighthouse />
        </Canvas>
      </div>

      {/* ---- 右侧：Leva + 烘焙预览 ---- */}
      <div className="preview-controls">
        <Leva
          flat
          fill
          titleBar={{ title: '截图参数' }}
          theme={{
            colors: {
              elevation1: '#0f172a',
              elevation2: '#1e293b',
              elevation3: '#334155',
              accent1: '#64748b',
              accent2: '#94a3b8',
              accent3: '#cbd5e1',
              highlight1: '#475569',
              highlight2: '#64748b',
              highlight3: '#94a3b8',
            },
            fontSizes: { root: '11px', toolTip: '11px' },
            fonts: { mono: `'Courier New', 'Consolas', monospace` },
          }}
        />

        <div className="bake-section">
          <h3>烘焙预览</h3>

          <div className="auto-toggle">
            <input
              type="checkbox"
              id="auto-capture"
              checked={autoCapture}
              onChange={(e) => setAutoCapture(e.target.checked)}
            />
            <label htmlFor="auto-capture">参数变更时自动烘焙（300ms 防抖）</label>
          </div>

          <button onClick={doCapture} disabled={!canvasReady}>
            {canvasReady ? '手动烘焙 (Capture)' : '等待 Canvas 就绪…'}
          </button>

          <p>{config.captureW} × {config.captureH} · PNG dataURL</p>

          {capturedUrl && (
            <img src={capturedUrl} alt="Lighthouse capture preview" />
          )}
        </div>

        {/* ---- 配置文件操作 ---- */}
        <div className="bake-section">
          <h3>配置文件</h3>
          <p>
            {hasFile
              ? '已加载 src/debug/lighthouse-capture.yaml'
              : '使用默认值（DEFAULT_CAPTURE_CONFIG）'}
          </p>

          <button onClick={handleSave} disabled={saving}>
            {saving ? '保存中…'
              : saveStatus === 'ok' ? '✓ 已保存'
              : saveStatus === 'err' ? '✗ 保存失败'
              : '保存当前参数 (Save)'}
          </button>

          <button onClick={handleRecover} style={{ marginTop: 8, background: '#1e293b' }}>
            恢复默认值 (Recover)
          </button>
        </div>
      </div>
    </div>
  )
}
