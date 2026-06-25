/**
 * useModelPreviewControls — 通用模型预览 Leva 参数面板。
 *
 * 提供相机、灯光、变换、视觉、环境的实时参数调节。
 * 与 useLevaCaptureConfig 的模式一致，但面向通用模型预览场景。
 *
 * 仅 debug 模式使用（debug.html 入口），不参与生产构建。
 *
 * 援引：Leva useControls 范例 — leva.vercel.app
 *       Drei 模型预览模式 — pmndrs 社区
 */
import { useControls, folder } from 'leva'

export interface ModelPreviewConfig {
  // 相机
  cameraDistance: number
  cameraAzimuth: number
  cameraElevation: number

  // 环境光
  ambientColor: string
  ambientIntensity: number

  // 主光
  keyColor: string
  keyIntensity: number
  keyX: number
  keyY: number
  keyZ: number

  // 补光
  fillColor: string
  fillIntensity: number
  fillX: number
  fillY: number
  fillZ: number

  // 模型变换
  modelX: number
  modelY: number
  modelZ: number
  modelScale: number
  modelRotX: number
  modelRotY: number
  modelRotZ: number

  // 视觉
  wireframe: boolean
  autoRotate: boolean
  autoRotateSpeed: number

  // 环境
  backgroundColor: string
}

export const DEFAULT_PREVIEW_CONFIG: ModelPreviewConfig = {
  cameraDistance: 8,
  cameraAzimuth: 0,
  cameraElevation: 0.3,

  ambientColor: '#222d3d',
  ambientIntensity: 1.0,
  keyColor: '#aed2ff',
  keyIntensity: 1.8,
  keyX: 8,
  keyY: 6,
  keyZ: -4,
  fillColor: '#ffffff',
  fillIntensity: 0.5,
  fillX: -6,
  fillY: 6,
  fillZ: -18,

  modelX: 0,
  modelY: 0,
  modelZ: 0,
  modelScale: 1.0,
  modelRotX: 0,
  modelRotY: 0,
  modelRotZ: 0,

  wireframe: false,
  autoRotate: false,
  autoRotateSpeed: 0.5,

  backgroundColor: '#050811',
}

export function useModelPreviewControls(
  initial?: Partial<ModelPreviewConfig>,
): ModelPreviewConfig {
  const defaults = { ...DEFAULT_PREVIEW_CONFIG, ...initial }

  const values = useControls('Model Preview', {
    相机: folder(
      {
        cameraDistance: {
          value: defaults.cameraDistance, min: 1, max: 50, step: 0.5, label: '距离',
        },
        cameraAzimuth: {
          value: defaults.cameraAzimuth, min: -Math.PI, max: Math.PI, step: 0.05, label: '方位角',
        },
        cameraElevation: {
          value: defaults.cameraElevation, min: -Math.PI / 2, max: Math.PI / 2, step: 0.05, label: '仰角',
        },
      },
      { collapsed: false },
    ),

    主光: folder(
      {
        keyColor: { value: defaults.keyColor, label: '颜色' },
        keyIntensity: { value: defaults.keyIntensity, min: 0, max: 10, step: 0.1, label: '强度' },
        keyX: { value: defaults.keyX, min: -30, max: 30, step: 0.5, label: 'X' },
        keyY: { value: defaults.keyY, min: -30, max: 30, step: 0.5, label: 'Y' },
        keyZ: { value: defaults.keyZ, min: -30, max: 30, step: 0.5, label: 'Z' },
      },
      { collapsed: false },
    ),

    补光: folder(
      {
        fillColor: { value: defaults.fillColor, label: '颜色' },
        fillIntensity: { value: defaults.fillIntensity, min: 0, max: 5, step: 0.1, label: '强度' },
        fillX: { value: defaults.fillX, min: -30, max: 30, step: 0.5, label: 'X' },
        fillY: { value: defaults.fillY, min: -30, max: 30, step: 0.5, label: 'Y' },
        fillZ: { value: defaults.fillZ, min: -30, max: 30, step: 0.5, label: 'Z' },
      },
      { collapsed: true },
    ),

    环境光: folder(
      {
        ambientColor: { value: defaults.ambientColor, label: '颜色' },
        ambientIntensity: { value: defaults.ambientIntensity, min: 0, max: 5, step: 0.1, label: '强度' },
      },
      { collapsed: true },
    ),

    变换: folder(
      {
        modelScale: { value: defaults.modelScale, min: 0.01, max: 10, step: 0.05, label: '缩放' },
        modelX: { value: defaults.modelX, min: -20, max: 20, step: 0.1, label: 'X' },
        modelY: { value: defaults.modelY, min: -20, max: 20, step: 0.1, label: 'Y' },
        modelZ: { value: defaults.modelZ, min: -30, max: 10, step: 0.1, label: 'Z' },
        modelRotX: { value: defaults.modelRotX, min: -Math.PI, max: Math.PI, step: 0.05, label: '旋转 X' },
        modelRotY: { value: defaults.modelRotY, min: -Math.PI, max: Math.PI, step: 0.05, label: '旋转 Y' },
        modelRotZ: { value: defaults.modelRotZ, min: -Math.PI, max: Math.PI, step: 0.05, label: '旋转 Z' },
      },
      { collapsed: true },
    ),

    视觉: folder(
      {
        wireframe: { value: defaults.wireframe, label: '线框模式' },
        autoRotate: { value: defaults.autoRotate, label: '自动旋转' },
        autoRotateSpeed: { value: defaults.autoRotateSpeed, min: 0.1, max: 5, step: 0.1, label: '旋转速度' },
      },
      { collapsed: false },
    ),

    环境: folder(
      {
        backgroundColor: { value: defaults.backgroundColor, label: '背景色' },
      },
      { collapsed: true },
    ),
  })

  return values as ModelPreviewConfig
}
