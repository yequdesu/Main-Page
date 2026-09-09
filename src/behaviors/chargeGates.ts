import { TIMELINE } from '../composition/timeline'

export const CHARGE_GATE_POINTS = [TIMELINE.cubeWhiteFill.start, TIMELINE.squareCircleMorph.end] as const
export const CUBE_HOLD_SPEED = .35 // radians / second, also used during alignment
export const ORBIT_HOLD_SPEED = .065 // extra orbit phase / second
export type Pose = [number, number, number]
export interface ChargeGates {
  active: -1 | 0 | 1
  mode: 'idle' | 'charging' | 'releasing'
  energy: number
  unlocked: boolean[]
  completed: boolean[]
  clocks: number[]
  lastTime: number
  lastInput: number
  releaseAge: number
  released: number | null
  cubePose: Pose | null
  cubeClock: number
  cubeFaceTurn: number
  alignment: { from: Pose; to: Pose; duration: number } | null
}
export function createChargeGates(): ChargeGates {
  return { active: -1, mode: 'idle', energy: 0, unlocked: [false, false], completed: [false, false],
    clocks: [0, 0], lastTime: -1, lastInput: -Infinity, releaseAge: 0, released: null,
    cubePose: null, cubeClock: 0, cubeFaceTurn: 0, alignment: null }
}
export function finishChargeGate(state: ChargeGates) {
  if (state.active === -1) return
  state.unlocked[state.active] = true
  state.completed[state.active] = true
  state.released = CHARGE_GATE_POINTS[state.active]
  state.active = -1; state.mode = 'idle'; state.energy = 0
  state.alignment = null
}
export function tickChargeGates(state: ChargeGates, now: number) {
  const dt = state.lastTime < 0 ? 0 : Math.max(0, Math.min(.1, (now - state.lastTime) / 1000))
  state.lastTime = now
  if (state.active === -1) return
  if (state.mode === 'charging') {
    state.clocks[state.active] += dt
    if (now - state.lastInput > 160) state.energy = Math.max(0, state.energy - dt * .3)
  } else {
    state.releaseAge += dt
    if (state.active === 1 && state.releaseAge >= .18) finishChargeGate(state)
  }
}
/** Clamp every forward route, including scrollbar jumps and application inertia.
 * Entering a gate consumes overshoot, but never turns it into energy. */
export function constrainChargeProgress(state: ChargeGates, from: number, requested: number): number {
  const to = Math.max(0, Math.min(1, requested))
  if (to < from - 1e-7) {
    CHARGE_GATE_POINTS.forEach((point, i) => { if (to < point - 1e-7) state.unlocked[i] = false })
    if (state.active !== -1 && to < CHARGE_GATE_POINTS[state.active] - 1e-7) {
      state.active = -1; state.mode = 'idle'; state.energy = 0; state.alignment = null; state.released = null
    }
    return to
  }
  if (state.active !== -1) return CHARGE_GATE_POINTS[state.active]
  for (const i of [0, 1] as const) {
    const point = CHARGE_GATE_POINTS[i]
    if (!state.unlocked[i] && from <= point + 1e-7 && to >= point) {
      state.active = i; state.mode = 'charging'; state.energy = 0
      state.lastInput = -Infinity; state.releaseAge = 0; state.released = null
      return point
    }
  }
  return to
}
/** Only explicit physical input calls this; not ticker velocity/native inertia. */
export function chargeFromInput(state: ChargeGates, pixels: number, viewportHeight: number, now: number) {
  if (state.active < 0 || state.mode !== 'charging' || pixels <= 0) return
  const multiplier = state.completed[state.active] ? 2 : 1
  state.lastInput = now
  state.energy = Math.min(1, state.energy + Math.min(.12, pixels / Math.max(400, viewportHeight)) * multiplier)
  if (state.energy >= 1 - 1e-9) {
    state.energy = 1; state.mode = 'releasing'; state.releaseAge = 0
  }
}

/** Trackpads do not expose a momentum flag. Reject the decaying tail of a
 * continuous wheel sequence, while ordinary equal-size mouse notches count. */
export function createWheelIntentFilter() {
  let last = -Infinity, magnitude = 0, falling = 0, direction = 0
  return (delta: number, now: number) => {
    const size = Math.abs(delta), sign = Math.sign(delta)
    if (now - last > 160 || sign !== direction || size > magnitude * 1.15) falling = 0
    else if (size < magnitude - .25) falling++
    last = now; magnitude = size; direction = sign
    return falling < 2 && size >= 2
  }
}

export function createForwardCubeAlignment(from: Pose, facing: readonly number[]) {
  const quarter = Math.PI / 2
  let y = facing[1] + Math.ceil((from[1] - facing[1]) / quarter) * quarter
  if (y - from[1] < .001) y += quarter
  const nearest = (angle: number, reference: number) => angle + Math.round((reference - angle) / (2 * Math.PI)) * 2 * Math.PI
  const to: Pose = [nearest(facing[0], from[0]), y, nearest(facing[2], from[2])]
  return { from: [...from] as Pose, to, duration: (y - from[1]) / CUBE_HOLD_SPEED }
}
export function sampleCubeAlignment(alignment: NonNullable<ChargeGates['alignment']>, seconds: number): Pose {
  if (seconds <= 0) return [...alignment.from]
  if (seconds >= alignment.duration) return [...alignment.to]
  const t = Math.max(0, Math.min(1, seconds / alignment.duration)), e = t * t * (3 - 2 * t)
  return alignment.from.map((v, i) => v + (alignment.to[i] - v) * (i === 1 ? t : e)) as Pose
}

const listeners = new Set<() => void>()
export const chargeGates = createChargeGates()
export function resetChargeGates() { Object.assign(chargeGates, createChargeGates()); publishChargeGates() }
export function publishChargeGates() { listeners.forEach(fn => fn()) }
export function subscribeChargeGates(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function getOrbitHoldPhase(scroll: number) {
  const start = TIMELINE.geometricOrbitExpand.end, end = CHARGE_GATE_POINTS[1]
  const t = Math.max(0, Math.min(1, (scroll - start) / (end - start)))
  return chargeGates.clocks[1] * ORBIT_HOLD_SPEED * t * t * (3 - 2 * t)
}
