import { useEffect, useCallback, useMemo, useState } from 'react'
import { _lighthouseGroupRef } from './Lighthouse'
import {
  offscreenCapture,
  DEFAULT_CAPTURE_CONFIG,
  type CaptureConfig,
} from './LighthouseCaptureTypes'

// Module-level getter — App.tsx reads this to trigger capture
let _captureFn: (() => string | null) | null = null
export function getLighthouseCapture(): (() => string | null) | null {
  return _captureFn
}

// ---- YAML 运行时加载（仅 dev 模式，prod 端 fetch 失败静默回退） ----

let _yamlPromise: Promise<Partial<CaptureConfig>> | null = null
let _yamlCache: Partial<CaptureConfig> | null = null

function loadYamlConfig(): Promise<Partial<CaptureConfig>> {
  if (_yamlPromise) return _yamlPromise
  _yamlPromise = fetch('/__debug/config')
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
    .then((cfg) => {
      _yamlCache = cfg
      return cfg
    })
  return _yamlPromise
}

function getBuildTimeConfig(): Partial<CaptureConfig> {
  if (typeof __LIGHTHOUSE_CONFIG__ !== 'undefined' && __LIGHTHOUSE_CONFIG__) {
    return __LIGHTHOUSE_CONFIG__
  }
  return {}
}

/**
 * LighthouseCapture — 使用独立 WebGLRenderer 离屏渲染灯塔截图。
 *
 * 配置优先级（高→低）：
 *   1. config prop（调用方显式传入）
 *   2. YAML 运行时配置（dev 模式 GET /__debug/config）
 *   3. YAML 编译时配置（Vite define 注入，prod 构建时读取）
 *   4. DEFAULT_CAPTURE_CONFIG
 *
 * 原 captureLighthouse():1473-1520 — 逐字保留算法，参数化版本。
 *
 * 援引：Three.js WebGLRenderer.toDataURL（官方 API）
 */
interface CaptureProps {
  onCaptureReady: (capture: () => string | null) => void
  /** 可选参数覆盖 — 最高优先级 */
  config?: Partial<CaptureConfig>
}

export default function LighthouseCapture({ onCaptureReady, config: configOverride }: CaptureProps) {
  const [yamlConfig, setYamlConfig] = useState<Partial<CaptureConfig>>(_yamlCache ?? {})

  useEffect(() => {
    loadYamlConfig().then(setYamlConfig)
  }, [])

  const mergedConfig = useMemo<CaptureConfig>(
    () => ({
      ...DEFAULT_CAPTURE_CONFIG,
      ...getBuildTimeConfig(),
      ...yamlConfig,
      ...configOverride,
    }),
    [yamlConfig, configOverride],
  )

  const capture = useCallback((): string | null => {
    return offscreenCapture(mergedConfig, _lighthouseGroupRef)
  }, [mergedConfig])

  useEffect(() => {
    _captureFn = capture
    onCaptureReady(capture)
    return () => { _captureFn = null }
  }, [capture, onCaptureReady])

  return null
}
