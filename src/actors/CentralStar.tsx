import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SpriteMaterial, MeshBasicMaterial, AdditiveBlending, LinearFilter, type Mesh } from 'three'
import { SCENE_CENTER_Z, clamped, smoothstep, GRID_SHIFT_START } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'

/**
 * 中央恒星 — 核心球 + 光晕球 + Canvas 精灵 halo。
 *
 * 原 act3.build() StarNode:1190-1243。
 * 三层结构：核心提供亮白实体，光晕球提供近场散射，精灵提供远场柔光。
 *
 * 援引：Drei Sparkles（Canvas Sprite for soft glow）
 */
export default function CentralStar() {
  const haloTexture = useMemo(() => {
    const size = 128
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255,240,210,0.6)')
    gradient.addColorStop(0.15, 'rgba(255,220,170,0.35)')
    gradient.addColorStop(0.4, 'rgba(255,180,100,0.08)')
    gradient.addColorStop(0.7, 'rgba(255,140,60,0.01)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const tex = new CanvasTexture(c)
    tex.minFilter = LinearFilter
    return tex
  }, [])

  const spriteMatRef = useRef<SpriteMaterial | null>(null)
  const glowMeshRef = useRef<Mesh | null>(null)

  useFrame((state) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime
    const act3Progress = clamped(sp, GRID_SHIFT_START, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const pulse = 1 + Math.sin(time * 1.8) * 0.06 + Math.sin(time * 3.3) * 0.04

    // Inner glow: opacity + scale pulse (逐字保留自原 act3.animate)
    if (glowMeshRef.current) {
      const mat = glowMeshRef.current.material as MeshBasicMaterial
      mat.opacity = smooth3 * 0.30 * pulse
      glowMeshRef.current.scale.setScalar(pulse)
    }

    // Halo sprite: opacity (0.55 vs 0.35, 逐字保留自原版)
    if (spriteMatRef.current) {
      spriteMatRef.current.opacity = smooth3 * 0.55 * pulse
    }
  })

  return (
    <group position={[0, -1.0, SCENE_CENTER_Z]} renderOrder={1}>
      {/* 核心：暖白实体球 */}
      <mesh>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshBasicMaterial color="#fff8e7" />
      </mesh>

      {/* 内层光晕：透明金色包裹（脉冲呼吸） */}
      <mesh ref={glowMeshRef}>
        <sphereGeometry args={[0.70, 32, 32]} />
        <meshBasicMaterial color="#ffe8c0" transparent opacity={0.30} depthWrite={false} />
      </mesh>

      {/* 外层光晕：Canvas 径向渐变精灵 */}
      <sprite renderOrder={1} scale={[5.5, 5.5, 1]}>
        <spriteMaterial
          ref={(mat) => { spriteMatRef.current = mat }}
          map={haloTexture}
          blending={AdditiveBlending}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
        />
      </sprite>
    </group>
  )
}
