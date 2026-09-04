import { SCENE_CENTER_Z, ORBIT_RADII } from '../r3f/ScrollRig'
import { TIMELINE, progress, smoothstep01 } from '../composition/timeline'

export const ACT3_LAYOUT_SEED = 0xea7e2026
export const ACT3_TERMINAL_CENTER = { x: 0, y: -1, z: SCENE_CENTER_Z } as const
export const ACT3_MIN_FRAMING_ASPECT = 0.8
export const ACT3_BASE_FOV = 40

export interface Act3TerminalPlanet {
  orbitRadius: number
  orbitAngle: number
}

export interface Act3TerminalLayout {
  center: typeof ACT3_TERMINAL_CENTER
  planets: readonly [Act3TerminalPlanet, Act3TerminalPlanet, Act3TerminalPlanet]
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fixed, well-separated terminal angles. The seed controls a small angular
// offset while preserving the established three-body composition.
function buildTerminalPlanets(seed: number): Act3TerminalLayout['planets'] {
  const random = mulberry32(seed)
  const bases = [2.78, -1.07, 0.57] as const
  return bases.map((base, index) => ({
    orbitRadius: ORBIT_RADII[index],
    orbitAngle: base + (random() - 0.5) * 0.12,
  })) as unknown as Act3TerminalLayout['planets']
}

export const ACT3_TERMINAL_LAYOUT: Act3TerminalLayout = {
  center: ACT3_TERMINAL_CENTER,
  planets: buildTerminalPlanets(ACT3_LAYOUT_SEED),
}

export function createAct3Random(seed = ACT3_LAYOUT_SEED): () => number {
  return mulberry32(seed)
}

/**
 * Preserve a minimum horizontal field of view on portrait screens. The Act 3
 * terminal layout is wider than it is tall, so retaining the desktop vertical
 * FOV on a narrow viewport would push the outer planet off-screen.
 */
export function getAct3ResponsiveFov(
  aspect: number,
  baseFov = ACT3_BASE_FOV,
): number {
  const safeAspect = Math.max(0.25, aspect)
  const tangentScale = Math.min(
    2,
    Math.max(1, ACT3_MIN_FRAMING_ASPECT / safeAspect),
  )
  const baseHalfFov = baseFov * Math.PI / 360
  return Math.atan(Math.tan(baseHalfFov) * tangentScale) * 360 / Math.PI
}

export function getAct3TerminalPlanetPosition(trackIdx: number, angleOffset = 0) {
  const planet = ACT3_TERMINAL_LAYOUT.planets[trackIdx] ?? ACT3_TERMINAL_LAYOUT.planets[0]
  const angle = planet.orbitAngle + angleOffset
  return {
    x: ACT3_TERMINAL_CENTER.x + Math.cos(angle) * planet.orbitRadius,
    y: ACT3_TERMINAL_CENTER.y,
    z: ACT3_TERMINAL_CENTER.z + Math.sin(angle) * planet.orbitRadius,
  }
}

export function getAct3VisualAlpha(scrollProgress: number): number {
  return smoothstep01(progress('squareAct3Crossfade', scrollProgress))
}

export function getAct3OrbitMotionScale(scrollProgress: number): number {
  return smoothstep01(progress('act3OrbitResume', scrollProgress))
}

export function isAct3TerminalLayoutActive(scrollProgress: number): boolean {
  return scrollProgress >= TIMELINE.squareTitleTyping.start
}
