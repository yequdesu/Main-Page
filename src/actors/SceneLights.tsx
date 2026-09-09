import { STAR_FAR_LIGHT_COLOR } from './assets/celestialLighting'
import { useRef, useEffect } from 'react'
import { type AmbientLight } from 'three'

/**
 * SceneLights — 全局灯光，始终挂载（不受 Act visible 影响）。
 *
 * 环境光保留跨幕强度编排，方向光色调与恒星远场柔光一致。
 * 这些灯光必须在整个场景生命周期中保持活跃，
 * 不能放在 Act visible group 内（visible=false 会导致灯光熄灭）。
 *
 * 导出 _ambientLight 供 ScrollInvalidator 白化过渡时调整强度。
 */
export let _ambientLight: AmbientLight | null = null

export default function SceneLights() {
  const ambRef = useRef<AmbientLight>(null!)

  useEffect(() => {
    _ambientLight = ambRef.current
    return () => { _ambientLight = null }
  }, [])

  return (
    <>
      <ambientLight ref={ambRef} color="#222d3d" intensity={1.4} />
      <directionalLight color={STAR_FAR_LIGHT_COLOR} intensity={1.8} position={[15, 10, -10]} />
      <directionalLight color={STAR_FAR_LIGHT_COLOR} intensity={0.5} position={[-15, 12, -35]} />
    </>
  )
}
