/**
 * useLevaCaptureConfig — Leva 控制的 LighthouseCapture 参数面板。
 *
 * 按文件夹分组：相机 / 渲染 / 环境光 / 主光 / 补光 / 位移。
 * 接受 initialConfig 覆盖默认值（来自服务端 YAML 配置）。
 * 返回响应式 CaptureConfig，每次拖拽滑块触发 React 重新渲染。
 *
 * 仅 debug 模式使用（debug.html 入口），不参与生产构建。
 *
 * 援引：Leva useControls 范例 — leva.vercel.app
 */
import { useControls, folder } from 'leva'
import { DEFAULT_CAPTURE_CONFIG, type CaptureConfig } from '../actors/LighthouseCaptureTypes'

export function useLevaCaptureConfig(initialConfig?: Partial<CaptureConfig>): CaptureConfig {
  const defaults = { ...DEFAULT_CAPTURE_CONFIG, ...initialConfig }

  const values = useControls('Lighthouse Capture', {
    相机: folder(
      {
        cameraFov: { value: defaults.cameraFov, min: 1, max: 120, step: 0.5, label: 'FOV' },
        cameraZ: { value: defaults.cameraZ, min: 2, max: 30, step: 0.1, label: '相机 Z' },
        cameraY: { value: defaults.cameraY, min: -5, max: 5, step: 0.1, label: '相机 Y' },
      },
      { collapsed: false },
    ),

    渲染: folder(
      {
        captureW: { value: defaults.captureW, min: 64, max: 2048, step: 64, label: '宽度' },
        captureH: { value: defaults.captureH, min: 64, max: 2048, step: 64, label: '高度' },
        antialias: { value: defaults.antialias, label: '抗锯齿' },
      },
      { collapsed: true },
    ),

    环境光: folder(
      {
        ambientColor: { value: defaults.ambientColor, label: '颜色' },
        ambientIntensity: { value: defaults.ambientIntensity, min: 0, max: 5, step: 0.1, label: '强度' },
      },
      { collapsed: false },
    ),

    '主光 (Key)': folder(
      {
        keyColor: { value: defaults.keyColor, label: '颜色' },
        keyIntensity: { value: defaults.keyIntensity, min: 0, max: 5, step: 0.1, label: '强度' },
        keyX: { value: defaults.keyX, min: -20, max: 20, step: 0.5, label: 'X' },
        keyY: { value: defaults.keyY, min: -20, max: 20, step: 0.5, label: 'Y' },
        keyZ: { value: defaults.keyZ, min: -20, max: 20, step: 0.5, label: 'Z' },
      },
      { collapsed: false },
    ),

    '补光 (Fill)': folder(
      {
        fillColor: { value: defaults.fillColor, label: '颜色' },
        fillIntensity: { value: defaults.fillIntensity, min: 0, max: 5, step: 0.1, label: '强度' },
        fillX: { value: defaults.fillX, min: -20, max: 20, step: 0.5, label: 'X' },
        fillY: { value: defaults.fillY, min: -20, max: 20, step: 0.5, label: 'Y' },
        fillZ: { value: defaults.fillZ, min: -20, max: 20, step: 0.5, label: 'Z' },
      },
      { collapsed: false },
    ),

    位移: folder(
      {
        cloneY: { value: defaults.cloneY, min: -3, max: 1, step: 0.01, label: 'Y 偏移' },
      },
      { collapsed: true },
    ),

    轮廓辉光: folder(
      {
        edgeGlowIntensity: { value: defaults.edgeGlowIntensity, min: 0, max: 2, step: 0.05, label: '强度' },
        edgeGlowColor: { value: defaults.edgeGlowColor, label: '颜色' },
        edgeGlowFalloff: { value: defaults.edgeGlowFalloff, min: 1, max: 6, step: 0.1, label: '衰减' },
      },
      { collapsed: true },
    ),
  })

  return values as CaptureConfig
}
