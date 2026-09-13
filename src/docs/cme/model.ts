import { stepTorus, PLASMA } from '../../behaviors/stellarPlasma'
import { MAGNETIC, magneticStage } from '../../behaviors/stellarMagnetism'
import { CME_TAIL } from '../../behaviors/stellarParticleDensity'
import { cmeRotationPlan } from '../../behaviors/cmeRotation'
import { parseSeed } from '../stellar/model'

export const CME_END = CME_TAIL.eventEnd + CME_TAIL.lifetime
/** 与求解器相同步长、阈值和时间倍率，仅积分径向运动，供阶段标记使用。 */
export function cmeTiming(seed: number) {
  const torus = { radius: 1, velocity: 0.005 }, times = new Array<number>(MAGNETIC.strands).fill(-1)
  const rotation = cmeRotationPlan(seed)
  let age = 0, rotationStart = 0, rotationSettled = 0
  while (age + PLASMA.step <= CME_END + 1e-9) {
    stepTorus(torus, PLASMA.step * 0.92, 2.2 + seed * 0.45)
    age += PLASMA.step
    if (!rotationStart && torus.radius >= rotation.startRadius) rotationStart = age
    if (!rotationSettled && torus.radius >= rotation.settleRadius) rotationSettled = age
    for (let i = 0; i < MAGNETIC.strands; i++) if (times[i] < 0 && magneticStage(torus.radius, i, seed) >= MAGNETIC.contact) times[i] = age
    if (times.every(t => t >= 0) && rotationSettled) break
  }
  return { rotationStart, rotationSettled, times, first: Math.min(...times), last: Math.max(...times) }
}
export function readCmeSelection(search: string) {
  const params = new URLSearchParams(search), seed = parseSeed(params.get('seed') ?? '') ?? 0.47
  const raw = params.get('t'), time = raw === null || raw.trim() === '' ? NaN : Number(raw)
  return { seed, age: Number.isFinite(time) && time >= 0 && time <= CME_END ? time : cmeTiming(seed).first - 0.3 }
}
export function cmeStage(elapsed: number) {
  return elapsed < 0 ? 0 : elapsed < 0.85 ? 1 : elapsed < 2.4 ? 2 : 3
}
