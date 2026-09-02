import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, EdgesGeometry, type Group, type LineBasicMaterial } from 'three'
import { useScrollStore } from '../stores/scrollStore'
import {
  getMiniatureTransform,
  MINIATURE_CUBE_SIZE,
  MINIATURE_PIVOT,
} from '../behaviors/miniatureUniverse'

interface MiniatureUniverseProps {
  children: ReactNode
}

export default function MiniatureUniverse({ children }: MiniatureUniverseProps) {
  const universeRef = useRef<Group>(null)
  const wireMaterialRef = useRef<LineBasicMaterial>(null)
  const wireGeometry = useMemo(() => {
    const box = new BoxGeometry(MINIATURE_CUBE_SIZE, MINIATURE_CUBE_SIZE, MINIATURE_CUBE_SIZE)
    const edges = new EdgesGeometry(box)
    box.dispose()
    return edges
  }, [])

  useEffect(() => () => wireGeometry.dispose(), [wireGeometry])

  useFrame(() => {
    const universe = universeRef.current
    if (!universe) return
    const transform = getMiniatureTransform(useScrollStore.getState().scrollProgress)
    universe.scale.setScalar(transform.scale)
    universe.rotation.set(...transform.rotation)
    if (wireMaterialRef.current) wireMaterialRef.current.opacity = transform.wireOpacity
  })

  return (
    <group ref={universeRef} position={MINIATURE_PIVOT}>
      <lineSegments geometry={wireGeometry} renderOrder={10}>
        <lineBasicMaterial
          ref={wireMaterialRef}
          color="#dbeafe"
          transparent
          opacity={0}
          depthTest
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <group position={[-MINIATURE_PIVOT[0], -MINIATURE_PIVOT[1], -MINIATURE_PIVOT[2]]}>
        {children}
      </group>
    </group>
  )
}
