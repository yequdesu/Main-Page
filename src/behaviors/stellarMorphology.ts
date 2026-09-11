import { MAGNETIC } from './stellarMagnetism'

/** 视觉构型的基准权重；不是太阳观测统计。去重后按剩余权重重新归一化。 */
export const PROMINENCE_MORPHOLOGIES = [
  { kind: 'isolated', label: '孤立主环', weight: 24 },
  { kind: 'one-sided', label: '单侧伴随', weight: 22 },
  { kind: 'crossed', label: '大小交错', weight: 18 },
  { kind: 'nested', label: '嵌套拱廊', weight: 16 },
  { kind: 'cluster', label: '低矮环簇', weight: 12 },
  { kind: 'bilateral', label: '双侧伴随', weight: 8 },
] as const
export type ProminenceMorphology = typeof PROMINENCE_MORPHOLOGIES[number]['kind']

export function selectProminenceMorphology(sample: number, previous?: ProminenceMorphology | null, neighbor?: ProminenceMorphology | null): ProminenceMorphology {
  const candidates = PROMINENCE_MORPHOLOGIES.filter(item => item.kind !== previous && item.kind !== neighbor)
  const total = candidates.reduce((sum, item) => sum + item.weight, 0)
  let cursor = Math.max(0, Math.min(1, sample)) * total
  for (const item of candidates) {
    cursor -= item.weight
    if (cursor < 0) return item.kind
  }
  return candidates[candidates.length - 1].kind
}

export interface ProminenceFamily {
  seed: number
  sourceKind: ProminenceMorphology
  /** 目标半跨度与高度尺度；不与其内部随机轴尺寸重复相乘。 */
  width: number
  height: number
  offsetX: number
  offsetZ: number
  yaw: number
  strands: number
}

/** 每个事件只生成一次：类型约束邻接关系，事件种子决定数量、尺度、足点与空间交错。 */
export function createProminenceStructure(seed: number, requested?: ProminenceMorphology | null) {
  let state = (seed * 0xffffffff) >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), state | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const range = (low: number, high: number) => low + (high - low) * random()
  const selection = random()
  const kind = requested ?? selectProminenceMorphology(selection)
  // 类型也参与参数种子，避免不同类型恰好复用相同的主拱顶。始终消费 selection 以支持显式类型重放。
  state = (state ^ Math.imul(PROMINENCE_MORPHOLOGIES.findIndex(item => item.kind === kind) + 1, 0x9e3779b9)) >>> 0
  // 只选择一次伴随类型，不递归生成；两个受约束类型也可以相互伴随。
  const companion = kind === 'nested' || kind === 'cluster'
    ? selectProminenceMorphology(random(), kind) : null
  const mirror = random() < 0.5 ? -1 : 1
  function component(sourceKind: ProminenceMorphology, limit: number): ProminenceFamily[] {
    const result: ProminenceFamily[] = []
    const add = (width: number, height: number, x: number, z: number, yaw: number) => {
      result.push({ sourceKind, width, height, offsetX: x * mirror, offsetZ: z, yaw: yaw * mirror, seed: random(), strands: 2 })
    }
    const width = range(0.88, 1.26), height = range(0.96, 1.34)
    switch (sourceKind) {
      case 'isolated':
        add(width * range(1, 1.12), height * range(1, 1.12), 0, 0, range(-0.20, 0.20))
        break
      case 'one-sided': {
        add(width, height, -0.12 * width, 0, range(-0.18, 0.18))
        const count = random() < 0.6 ? 1 : 2
        for (let i = 0; i < count; i++) {
          add(width * range(0.26, 0.48), height * range(0.28, 0.55), width * (range(0.55, 0.80) + i * 0.28), range(-0.13, 0.13), range(-0.8, -0.35))
        }
        break
      }
      case 'crossed':
        add(width, height, -0.18 * width, -0.08, range(0.20, 0.45))
        add(width * range(0.62, 0.84), height * range(0.56, 0.76), width * range(0.25, 0.48), 0.10, range(-0.80, -0.45))
        break
      case 'nested': {
        add(width, height, 0, -0.05, range(-0.10, 0.10))
        const count = Math.min(limit - 1, random() < 0.5 ? 1 : 2)
        for (let i = 0; i < count; i++) {
          const level = i === 0 ? range(0.53, 0.65) : range(0.28, 0.39)
          add(width * level, height * level, width * range(-0.10, 0.10), 0.04 + i * 0.05, range(-0.14, 0.14))
        }
        break
      }
      case 'cluster': {
        const count = Math.min(limit, random() < 0.5 ? 3 : 4)
        for (let i = 0; i < count; i++) {
          add(range(0.17, 0.28), range(0.20, 0.42), -0.60 + i / (count - 1) * 1.2 + range(-0.05, 0.05), range(-0.12, 0.12), range(-0.65, 0.65))
        }
        break
      }
      case 'bilateral':
        add(width, height, 0, 0, range(-0.15, 0.15))
        for (const side of [-1, 1]) {
          add(width * range(0.24, 0.43), height * range(0.20, 0.49), side * width * range(0.62, 0.92), range(-0.12, 0.12), side * range(0.4, 0.85))
        }
        break
    }
    return result
  }
  const accompanying = companion ? component(companion, kind === 'cluster' ? 3 : 4) : []
  const primary = component(kind, MAGNETIC.strands / 2 - accompanying.length)
  if (companion) {
    // 在同一局部活动区并置两种完整构型；保留各自内部足点关系与高度层次。
    // 只压缩横向范围，不把低矮环簇放大成主环。全体最多六个环系。
    const place = (group: ProminenceFamily[], center: number, halfSpan: number) => {
      const left = Math.min(...group.map(f => f.offsetX - f.width))
      const right = Math.max(...group.map(f => f.offsetX + f.width))
      const scale = Math.min(1, 2 * halfSpan / (right - left))
      for (const f of group) {
        f.width *= scale
        f.offsetX = (f.offsetX - (left + right) / 2) * scale + center
      }
    }
    const side = mirror * range(0.78, 0.91)
    place(primary, -side, range(0.85, 0.98))
    place(accompanying, side, range(0.78, 0.94))
    for (const f of accompanying) f.offsetZ += range(0.08, 0.18)
  }
  const families = [...primary, ...accompanying]
  // 固定 12 条流线预算，按环系面积分配；不同数量的结构不会增加绘制成本。
  const spare = MAGNETIC.strands - families.length * 2
  const areas = families.map(family => family.width * family.height)
  const area = areas.reduce((sum, value) => sum + value, 0)
  const remainders = areas.map((value, i) => {
    const quota = spare * value / area
    families[i].strands += Math.floor(quota)
    return { index: i, fraction: quota % 1 }
  }).sort((a, b) => b.fraction - a.fraction)
  const remaining = MAGNETIC.strands - families.reduce((sum, family) => sum + family.strands, 0)
  for (let i = 0; i < remaining; i++) families[remainders[i].index].strands++
  return { kind, companion, families }
}
