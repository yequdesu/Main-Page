import type { MagneticTiming } from './stellarLifecycle'

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const redrawEase = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t) }
export const REDRAW = { edge: 0.07, lead: 0.05, preEmission: 0.22, minInterval: 0.24, renewalRate: 0.42, trace: 0.44, traceEdge: 0.035 } as const
export const redrawFront = (progress: number, threshold: number) => redrawEase((progress - threshold + REDRAW.edge) / (2 * REDRAW.edge))
export const filamentDirection = (seed: number, slot: number) => (slot + Math.floor(seed * 17)) % 2 ? -1 : 1
/** 以归一化弧长推进，p=0 完全未绘制，p=1 完全绘制；擦除复用同一方向。 */
export function traceFront(progress: number, arc: number, direction = 1) {
  const coordinate = direction > 0 ? arc : 1 - arc
  return redrawEase((clamp01(progress) * (1 + 2 * REDRAW.traceEdge) - coordinate) / (2 * REDRAW.traceEdge))
}

/** 最后四分之一形成期逐渐减速，稳定时停止发放新代。 */
export function renewalTravel(x: number) {
  const t = clamp01(x), u = Math.max(0, t - 0.75)
  return (t - 2 * u * u) / 0.875
}
const last = (ids: number[]) => ids[ids.length - 1]
const inverseTravel = (p: number) => p <= 0.75 / 0.875 ? p * 0.875 : 0.75 + (1 - Math.sqrt(Math.max(0, 1 - 8 * (p * 0.875 - 0.75)))) / 4
interface Generation { born: number; retire: number; layer: number; drawDuration: number; eraseDuration: number }

/** 出生表覆盖生长和消退。固定槽位先完整擦除，再接入新代；代数从不倒放。
 * handoffAt 指定局部重组接管时间，接管前停止换代并保留最后一束完整轮廓。
 */
export function createFilamentRenewal(timing: MagneticTiming, count: number, seed: number, handoffAt?: number) {
  const formation = timing.settled - timing.birth
  const nominalCycles = Math.max(2, Math.round(formation / (1.05 + 0.3 * seed)))
  const growthTotal = Math.max(count + 1, Math.min(Math.floor(nominalCycles * count * REDRAW.renewalRate), Math.floor(formation * 0.875 / REDRAW.minInterval - 0.5)))
  const stop = growthTotal + 0.5
  const records: Generation[] = [], bySlot: number[][] = Array.from({ length: count }, () => [])
  const active: number[] = [] // 内到外，消退阶段反向消费末尾并向开头补入
  const add = (born: number, slot: number, layer: number, interval: number) => {
    const ids = bySlot[slot], previous = last(ids)
    if (previous !== undefined) { records[previous].retire = born; records[previous].eraseDuration = Math.min(REDRAW.trace, interval * 0.8) }
    const id = records.length
    records.push({ born, retire: Infinity, layer, drawDuration: Math.min(REDRAW.trace, interval * 0.8), eraseDuration: REDRAW.trace })
    ids.push(id)
    return id
  }
  const growthBirths = Array.from({ length: growthTotal }, (_, g) => timing.birth + inverseTravel((g + 1) / stop) * formation)
  for (let g = 0; g < growthTotal; g++) {
    const gap = (growthBirths[g + 1] ?? timing.settled) - growthBirths[g]
    add(growthBirths[g], g % count, (g + 1) / growthTotal, gap)
    if (active.length === count) active.shift()
    active.push(g % count)
  }
  const decayEnd = handoffAt ?? timing.end
  const replacementEnd = handoffAt === undefined ? timing.decay + (timing.end - timing.decay) * 0.66 : handoffAt - REDRAW.trace
  let born = timing.decay + 0.35, inner = records[last(bySlot[active[0]])].layer
  while (born < replacementEnd - REDRAW.trace) {
    const progress = clamp01((born - timing.decay) / Math.max(1, decayEnd - timing.decay))
    const interval = Math.max(0.30, Math.min(0.8, (decayEnd - timing.decay) / (count * 2.2))) * (1 + 0.7 * progress * progress)
    const slot = active.pop()!
    inner = -0.68 + (inner + 0.68) * 0.93
    add(born, slot, inner, interval)
    active.unshift(slot)
    born += interval
  }
  if (handoffAt === undefined) {
    // 末段停止补入，外到内依次清空；每条仍沿自身方向擦除。
    const firstRetire = replacementEnd + REDRAW.trace
    for (let i = 0; i < count; i++) {
      const id = last(bySlot[active[count - 1 - i]])
      records[id].retire = firstRetire + (timing.end - firstRetire) * i / Math.max(1, count - 1)
    }
  }
  const total = records.length, births = Float64Array.from(records, g => g.born)
  const generations = new Int32Array(count).fill(-1), visibility = new Float32Array(count)
  const layers = new Float64Array(count), ranks = new Float64Array(count)
  const draw = new Float64Array(count), erase = new Float64Array(count)
  const directions = Int8Array.from({ length: count }, (_, slot) => filamentDirection(seed, slot))
  let emitted = 0, age = timing.birth
  function pointVisibility(slot: number, arc: number) { return traceFront(draw[slot], arc, directions[slot]) * (1 - traceFront(erase[slot], arc, directions[slot])) }
  function update(nextAge: number) {
    age = nextAge; emitted = 0
    for (let slot = 0; slot < count; slot++) {
      const ids = bySlot[slot]
      let lo = 0, hi = ids.length
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (records[ids[mid]].born <= age + 1e-9) lo = mid + 1; else hi = mid }
      const id = lo ? ids[lo - 1] : -1
      emitted += lo; generations[slot] = id
      if (id < 0) { draw[slot] = erase[slot] = visibility[slot] = layers[slot] = 0; continue }
      const record = records[id]
      layers[slot] = record.layer
      draw[slot] = clamp01((age - record.born) / record.drawDuration)
      erase[slot] = clamp01((age - record.retire + record.eraseDuration) / record.eraseDuration)
      const middle = (draw[slot] + erase[slot]) / 2
      visibility[slot] = pointVisibility(slot, directions[slot] > 0 ? middle : 1 - middle)
    }
    for (let slot = 0; slot < count; slot++) {
      let outside = 0, present = 0
      for (let i = 0; i < count; i++) if (generations[i] >= 0) { present++; if (layers[i] > layers[slot]) outside++ }
      ranks[slot] = outside / Math.max(1, present - 1)
    }
  }
  update(timing.birth)
  return { count, total, growthTotal, births, records, generations, visibility, layers, ranks, directions, draw, erase, update, pointVisibility,
    get emitted() { return emitted },
    get phase() { return age < timing.birth ? '待生' : age < timing.settled ? '向外换代' : age < timing.decay ? '稳定' : handoffAt !== undefined && age >= handoffAt ? '重组接管' : age >= timing.end ? '结束' : '向内换代' } }
}
