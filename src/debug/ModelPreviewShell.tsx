import { useState, Suspense, useCallback } from 'react'
import { Leva } from 'leva'
import { MODEL_REGISTRY } from '../models'
import LighthousePreviewPanel from './LighthousePreviewPanel'
import ModelPreviewPanel from './ModelPreviewPanel'

/**
 * ModelPreviewShell — 调试页面顶层路由。
 *
 * 原生 HTML select 切换模型（不用 Leva select，避免 React key 冲突）。
 * 根据 MODEL_REGISTRY 的 useCapturePanel 标记决定渲染专用面板或通用预览。
 *
 * 本地 useState 管理当前模型选择，不污染全局 store。
 *
 * 援引：Leva 面板模式 — pmndrs 社区
 */

const MODEL_KEYS = Object.keys(MODEL_REGISTRY)

export default function ModelPreviewShell() {
  const [modelKey, setModelKey] = useState<string>(() => MODEL_KEYS[0] ?? 'lighthouse-capture')

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setModelKey(e.target.value)
  }, [])

  const entry = MODEL_REGISTRY[modelKey]

  if (!entry) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#050811', color: '#ef4444',
        fontFamily: "'Courier New', 'Consolas', monospace",
        fontSize: 14,
      }}>
        未知模型: {modelKey}
      </div>
    )
  }

  // 专用面板（Lighthouse 截图 — LighthousePreviewPanel 自带 Leva）
  if (entry.useCapturePanel) {
    return (
      <>
        {/* 原生模型选择器（悬浮于左上角） */}
        <select
          value={modelKey}
          onChange={handleSelect}
          style={{
            position: 'fixed', top: 8, left: 8, zIndex: 9999,
            background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
            borderRadius: 4, padding: '4px 8px', fontSize: 12,
            fontFamily: "'Courier New', 'Consolas', monospace",
          }}
        >
          {MODEL_KEYS.map((k) => (
            <option key={k} value={k}>{MODEL_REGISTRY[k].label}</option>
          ))}
        </select>
        <LighthousePreviewPanel />
      </>
    )
  }

  // 通用模型预览
  return (
    <>
      <Leva
        flat
        fill
        titleBar={{ title: '模型预览' }}
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
      <select
        value={modelKey}
        onChange={handleSelect}
        style={{
          position: 'fixed', top: 8, left: 8, zIndex: 9999,
          background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
          borderRadius: 4, padding: '4px 8px', fontSize: 12,
          fontFamily: "'Courier New', 'Consolas', monospace",
        }}
      >
        {MODEL_KEYS.map((k) => (
          <option key={k} value={k}>{MODEL_REGISTRY[k].label}</option>
        ))}
      </select>
      <Suspense fallback={
        <div style={{
          width: '100vw', height: '100vh', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#050811', color: '#94a3b8',
          fontFamily: "'Courier New', 'Consolas', monospace",
          fontSize: 14,
        }}>
          加载模型…
        </div>
      }>
        <ModelPreviewPanel modelKey={modelKey} />
      </Suspense>
    </>
  )
}
