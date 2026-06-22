import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, SpriteMaterial, MeshBasicMaterial, AdditiveBlending, LinearFilter, type Mesh, type Group } from 'three'
import { SCENE_CENTER_Z, clamped, smoothstep } from '../r3f/ScrollRig'
import { useScrollStore } from '../stores/scrollStore'
import { getWindChimeProgress, ANCHOR_Y } from './WindChimeLines'

// ============================================================
// CentralStar — 可调参数
// ============================================================

// -- 几何 --
/** 核心半径  ↑=恒星更大更亮  ↓=恒星更小更收敛 */
const CORE_RADIUS = 0.42
const CORE_SEGMENTS = 32
/** 内层光晕半径  ↑=近场散射更扩散  ↓=光晕紧贴核心 */
const INNER_GLOW_RADIUS = 0.70
const INNER_GLOW_SEGMENTS = 32
const GROUP_POSITION_Y = -1.0

// -- 颜色 --
/** 核心色（暖白）  改色相→恒星色调变化 */
const CORE_COLOR = '#fff8e7'
/** 内层光晕色（暖金）  改色相→光晕冷暖偏移 */
const INNER_GLOW_COLOR = '#ffe8c0'

// -- 内层光晕动画 --
/** 光晕不透明度系数  ↑=光晕更亮更明显  ↓=光晕更暗更收敛 */
const GLOW_OPACITY_COEFF = 0.30       // × smooth3 × pulse
/** 呼吸频率1  ↑=脉动更快  ↓=脉动更慢 */
const PULSE_FREQ_1 = 1.8
/** 呼吸振幅1  ↑=亮度波动更大  ↓=更接近静态 */
const PULSE_AMP_1 = 0.06
/** 呼吸频率2  ↑=高频微抖更快  ↓=更平滑 */
const PULSE_FREQ_2 = 3.3
/** 呼吸振幅2  ↑=微抖更明显  ↓=更平滑 */
const PULSE_AMP_2 = 0.04

// -- 外层 Sprite（金色近场） --
/** Sprite 缩放  ↑=近场柔光扩散更远  ↓=收窄 */
const SPRITE_SCALE = 5.5
/** Sprite 不透明度系数  ↑=近场柔光更亮  ↓=更暗 */
const SPRITE_OPACITY_COEFF = 0.55      // × smooth3 × pulse

// -- 远场 Sprite（灰白，大扩散） --
/** 远场缩放  ↑=扩散范围更大  ↓=收窄 */
const FAR_SPRITE_SCALE = 20.0
/** 远场不透明度系数  ↑=远场更亮  ↓=更暗 */
const FAR_SPRITE_OPACITY_COEFF = 0.32   // × smooth3 × pulse

// -- halo 纹理 --
const HALO_TEX_SIZE = 128
/** 金色近场径向渐变  [位置, rgba] */
const HALO_COLOR_STOPS: [number, string][] = [
  [0,    'rgba(255,240,210,0.6)'],
  [0.15, 'rgba(255,220,170,0.35)'],
  [0.4,  'rgba(255,180,100,0.08)'],
  [0.7,  'rgba(255,140,60,0.01)'],
  [1,    'rgba(0,0,0,0)'],
]
/** 灰白远场径向渐变  [位置, rgba] */
const FAR_HALO_COLOR_STOPS: [number, string][] = [
  [0,    'rgba(180,190,210,0.18)'],
  [0.1,  'rgba(160,170,195,0.10)'],
  [0.3,  'rgba(140,150,180,0.03)'],
  [0.6,  'rgba(120,130,160,0.005)'],
  [1,    'rgba(0,0,0,0)'],
]

/** 共享纹理工厂 — 根据色阶表创建 CanvasTexture */
function makeHaloTexture(stops: [number, string][]): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = HALO_TEX_SIZE
  const ctx = c.getContext('2d')!
  const gradient = ctx.createRadialGradient(
    HALO_TEX_SIZE / 2, HALO_TEX_SIZE / 2, 0,
    HALO_TEX_SIZE / 2, HALO_TEX_SIZE / 2, HALO_TEX_SIZE / 2,
  )
  for (const [pos, color] of stops) {
    gradient.addColorStop(pos, color)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, HALO_TEX_SIZE, HALO_TEX_SIZE)
  const tex = new CanvasTexture(c)
  tex.minFilter = LinearFilter
  return tex
}

/**
 * 中央恒星 — 4 层结构：核心 + 内层光晕 + 近场金色 Sprite + 远场灰白 Sprite。
 *
 * 原 act3.build() StarNode:1190-1243。
 *
 * 援引：Drei Sparkles（Canvas Sprite for soft glow）
 */
export default function CentralStar() {
  const haloTex = useMemo(() => makeHaloTexture(HALO_COLOR_STOPS), [])
  const farHaloTex = useMemo(() => makeHaloTexture(FAR_HALO_COLOR_STOPS), [])

  const groupRef = useRef<Group>(null)
  const spriteMatRef = useRef<SpriteMaterial | null>(null)
  const farSpriteMatRef = useRef<SpriteMaterial | null>(null)
  const glowMeshRef = useRef<Mesh | null>(null)

  useFrame((state) => {
    const sp = useScrollStore.getState().scrollProgress
    const time = state.clock.elapsedTime

    // 风铃下落：恒星 Y 独立计算（避免渲染顺序问题）
    if (groupRef.current) {
      const wc = getWindChimeProgress(sp)
      if (wc.active) {
        groupRef.current.position.y = ANCHOR_Y + (GROUP_POSITION_Y - ANCHOR_Y) * wc.smoothP
      } else {
        groupRef.current.position.y = GROUP_POSITION_Y
      }
    }

    const GLOW_START = 0.94
    const act3Progress = clamped(sp, GLOW_START, 1.0)
    const smooth3 = smoothstep(act3Progress)
    const pulse = 1 + Math.sin(time * PULSE_FREQ_1) * PULSE_AMP_1 + Math.sin(time * PULSE_FREQ_2) * PULSE_AMP_2

    if (glowMeshRef.current) {
      const mat = glowMeshRef.current.material as MeshBasicMaterial
      mat.opacity = smooth3 * GLOW_OPACITY_COEFF * pulse
      glowMeshRef.current.scale.setScalar(pulse)
    }

    if (spriteMatRef.current) {
      spriteMatRef.current.opacity = smooth3 * SPRITE_OPACITY_COEFF * pulse
    }

    if (farSpriteMatRef.current) {
      farSpriteMatRef.current.opacity = smooth3 * FAR_SPRITE_OPACITY_COEFF * pulse
    }
  })

  return (
    <group ref={groupRef} position={[0, GROUP_POSITION_Y, SCENE_CENTER_Z]} renderOrder={1}>
      {/* 1. 核心：暖白实体球 */}
      <mesh renderOrder={1}>
        <sphereGeometry args={[CORE_RADIUS, CORE_SEGMENTS, CORE_SEGMENTS]} />
        <meshBasicMaterial color={CORE_COLOR} />
      </mesh>

      {/* 2. 内层光晕：透明金色包裹（脉冲呼吸） */}
      <mesh ref={glowMeshRef} renderOrder={1}>
        <sphereGeometry args={[INNER_GLOW_RADIUS, INNER_GLOW_SEGMENTS, INNER_GLOW_SEGMENTS]} />
        <meshBasicMaterial color={INNER_GLOW_COLOR} transparent opacity={GLOW_OPACITY_COEFF} depthWrite={false} />
      </mesh>

      {/* 3. 近场 Sprite：金色径向渐变 */}
      <sprite renderOrder={1} scale={[SPRITE_SCALE, SPRITE_SCALE, 1]}>
        <spriteMaterial
          ref={(mat) => { spriteMatRef.current = mat }}
          map={haloTex}
          blending={AdditiveBlending}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest
        />
      </sprite>

      {/* 4. 远场 Sprite：灰白径向渐变，大范围扩散 */}
      <sprite renderOrder={1} scale={[FAR_SPRITE_SCALE, FAR_SPRITE_SCALE, 1]}>
        <spriteMaterial
          ref={(mat) => { farSpriteMatRef.current = mat }}
          map={farHaloTex}
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
