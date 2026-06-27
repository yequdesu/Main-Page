import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Mesh, Material, type Group } from 'three'
import { clamped, SCENE_CENTER_Z, smoothstep } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import { TIMELINE } from '../composition/timeline'

// Module-level ref �?shared with LighthouseCapture for offscreen rendering
export let _lighthouseGroupRef: Group | null = null

/**
 * 灯塔 �?�?buildLighthouse() 声明式迁移�?
 *
 * �?LighthouseScene.vue:267-366 �?30 �?Mesh 逐行转为 R3F JSX�?
 * 所�?position / rotation / scale 值逐字保留�?
 *
 * 白化完成 (sp≥WHITE_OUT_END) 后隐藏，与背景白化同步�?
 *
 * 援引：R3F 声明式场景图 �?pmndrs 官方 Getting Started
 */
export default function Lighthouse() {
  const groupRef = useRef<Group>(null)
  const materialsRef = useRef<Material[]>([])
  const meshesRef = useRef<Mesh[]>([])

  useEffect(() => {
    _lighthouseGroupRef = groupRef.current
    const materials: Material[] = []
    const meshes: Mesh[] = []
    groupRef.current?.traverse((child) => {
      if (!(child instanceof Mesh)) return
      child.userData.lighthouseBaseRenderOrder = child.renderOrder
      meshes.push(child)
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of childMaterials) {
        if (!materials.includes(material)) {
          material.userData.lighthouseBaseOpacity = material.opacity
          material.userData.lighthouseBaseTransparent = material.transparent
          material.userData.lighthouseBaseDepthWrite = material.depthWrite
          materials.push(material)
        }
      }
    })
    materialsRef.current = materials
    meshesRef.current = meshes
    return () => { _lighthouseGroupRef = null }
  }, [])

  // 白化过渡后隐藏灯�?�?sp �?0.55 �?visible=false
  useFrame(() => {
    const sp = useScrollStore.getState().scrollProgress
    if (groupRef.current) {
      const fadeOut = smoothstep(clamped(sp, TIMELINE.whiteOut.start, TIMELINE.whiteOut.end))
      const visibleOpacity = 1 - fadeOut
      groupRef.current.visible = visibleOpacity > 0.015
      for (const mesh of meshesRef.current) {
        const baseRenderOrder = mesh.userData.lighthouseBaseRenderOrder ?? 0
        mesh.renderOrder = visibleOpacity < 0.999 ? -20 : baseRenderOrder
      }
      for (const material of materialsRef.current) {
        const baseOpacity = material.userData.lighthouseBaseOpacity ?? 1
        const baseTransparent = material.userData.lighthouseBaseTransparent ?? material.transparent
        const baseDepthWrite = material.userData.lighthouseBaseDepthWrite ?? material.depthWrite
        material.opacity = baseOpacity * visibleOpacity
        material.transparent = baseTransparent || visibleOpacity < 0.999
        material.depthWrite = fadeOut > 0.68 ? false : baseDepthWrite
        material.needsUpdate = true
      }
    }
  })

  return (
    <group
      ref={groupRef}
      position={[0, -2.5, SCENE_CENTER_Z]}
      scale={0.7}
    >
      {/* 地基 �?材质与塔身一�?*/}
      <mesh position={[0, -0.9, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 1.4, 16]} />
        <meshStandardMaterial color="#4d535c" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* 遮罩 �?不透明 */}
      <mesh position={[0, -0.95, 0]}>
        <cylinderGeometry args={[0.75, 1.3, 1.6, 16]} />
        <meshBasicMaterial color="#050811" />
      </mesh>

      {/* 岩石底座 */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.4, 16]} />
        <meshStandardMaterial color="#40454f" roughness={0.9} />
      </mesh>

      {/* 过渡�?*/}
      <mesh position={[0, 0.12, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.55, 0.12, 16]} />
        <meshStandardMaterial color="#252930" roughness={0.8} />
      </mesh>

      {/* 塔身 */}
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.20, 0.30, 2.6, 20]} />
        <meshStandardMaterial color="#4d535c" roughness={0.5} metalness={0.1} />
      </mesh>

      {/* 装饰�?*/}
      <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.27, 0.022, 8, 20]} />
        <meshStandardMaterial color="#7a828f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.022, 8, 20]} />
        <meshStandardMaterial color="#7a828f" roughness={0.6} />
      </mesh>

      {/* 窗户 1 */}
      <group position={[0, 1.0, 0.24]} rotation={[0, 0.5, 0]}>
        <mesh>
          <boxGeometry args={[0.06, 0.12, 0.05]} />
          <meshBasicMaterial color="#111317" fog />
        </mesh>
        <mesh>
          <boxGeometry args={[0.04, 0.10, 0.055]} />
          <meshBasicMaterial color="#ffdf6d" fog />
        </mesh>
      </group>

      {/* 窗户 2 */}
      <group position={[0, 1.9, 0.19]} rotation={[0, -0.8, 0]}>
        <mesh>
          <boxGeometry args={[0.06, 0.12, 0.05]} />
          <meshBasicMaterial color="#111317" fog />
        </mesh>
        <mesh>
          <boxGeometry args={[0.04, 0.10, 0.055]} />
          <meshBasicMaterial color="#ffdf6d" fog />
        </mesh>
      </group>

      {/* 阳台 */}
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.32, 0.22, 0.12, 16]} />
        <meshStandardMaterial color="#252930" roughness={0.8} />
      </mesh>

      {/* 平台�?*/}
      <mesh position={[0, 2.67, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.03, 16]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* 栏杆�?*/}
      <group position={[0, 2.68, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
          <torusGeometry args={[0.33, 0.008, 6, 24]} />
          <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.33, 0.075, Math.sin(a) * 0.33]}>
              <cylinderGeometry args={[0.006, 0.006, 0.15, 6]} />
              <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
            </mesh>
          )
        })}
      </group>

      {/* 灯座�?*/}
      <mesh position={[0, 2.74, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.06, 16]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* 玻璃�?*/}
      <mesh position={[0, 2.96, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.44, 16, 1, true]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.1}
          metalness={0.9}
          emissive="#ffffff"
          emissiveIntensity={1.0}
          side={2} // DoubleSide
          transparent
          opacity={0.2}
        />
      </mesh>

      {/* 灯泡 */}
      <group position={[0, 2.96, 0]}>
        <mesh>
          <sphereGeometry args={[0.095, 20, 14]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={AdditiveBlending}
            fog
          />
        </mesh>
      </group>

      {/* 玻璃框架�?×6 */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        return (
          <mesh key={`frame-${i}`} position={[Math.cos(a) * 0.22, 2.96, Math.sin(a) * 0.22]}>
            <cylinderGeometry args={[0.012, 0.012, 0.44, 6]} />
            <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
          </mesh>
        )
      })}

      {/* 屋顶�?*/}
      <mesh position={[0, 3.18, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* 穹顶 */}
      <mesh position={[0, 3.20, 0]}>
        <sphereGeometry args={[0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* 尖顶底座 */}
      <mesh position={[0, 3.42, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* 黄铜�?*/}
      <mesh position={[0, 3.47, 0]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial color="#e5c158" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* 尖顶锥体 */}
      <mesh position={[0, 3.65, 0]}>
        <cylinderGeometry args={[0.005, 0.012, 0.35, 8]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.4} metalness={0.8} />
      </mesh>
    </group>
  )
}
