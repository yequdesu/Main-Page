import { forwardRef, type Ref } from 'react'
import { type Mesh } from 'three'

/**
 * 主行星 — 高面数球体，支持 onClick 交互。
 *
 * 原 buildDust() 中的主行星创建逻辑。
 * renderOrder=1, depthWrite=true。
 *
 * 援引：R3F onClick（原生事件支持）
 */
interface PlanetProps {
  onClick?: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  visible?: boolean
}

const Planet = forwardRef<Mesh, PlanetProps>(
  function Planet({ onClick, visible = true }, ref) {
    return (
      <mesh
        ref={ref}
        renderOrder={1}
        visible={visible}
        onClick={onClick}
      >
        <sphereGeometry args={[0.015, 32, 32]} />
        <meshBasicMaterial color="#f0f8ff" transparent opacity={0} depthWrite />
      </mesh>
    )
  }
)

export default Planet
