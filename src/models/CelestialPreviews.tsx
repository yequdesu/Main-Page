import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { createStarPreview, createPlanetPreview, createRingedPlanetPreview } from './celestialPreview'

interface PreviewProps {
  standalone?: boolean
  previewTime?: () => number
  onAssetReady?: () => void
}

function ProceduralAsset({ create, previewTime, onAssetReady }: PreviewProps & { create: typeof createStarPreview }) {
  const asset = useMemo(create, [create])
  useEffect(() => () => asset.dispose(), [asset])
  // 工厂被热更新后，通知工作台重新索引新的节点，而不是操作已卸载的旧实例。
  useEffect(() => { onAssetReady?.() }, [asset, onAssetReady])
  // Studio 的会话时钟驱动所有视口；此处不读写主页 store，也不自行开启渲染循环。
  useFrame(() => asset.update(previewTime?.() ?? 0))
  return <primitive object={asset.root} dispose={null} />
}

export function CentralStarPreview(props: PreviewProps) {
  return <ProceduralAsset {...props} create={createStarPreview} />
}

export function PlanetPreview(props: PreviewProps) {
  return <ProceduralAsset {...props} create={createPlanetPreview} />
}

export function RingedPlanetPreview(props: PreviewProps) {
  return <ProceduralAsset {...props} create={createRingedPlanetPreview} />
}
