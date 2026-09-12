import { Vector3 } from 'three'
import { PROMINENCE_MORPHOLOGIES, type ProminenceMorphology } from '../../behaviors/stellarMorphology'
import { createFluxRopeSimulation } from '../../behaviors/stellarPlasma'
import { MAGNETIC } from '../../behaviors/stellarMagnetism'
import { MAGNETIC_LIFETIME } from '../../behaviors/stellarLifecycle'

export const DEFAULT_SEED = 0.47
export const DEFAULT_KIND: ProminenceMorphology = 'isolated'
export const SEED_PRESETS = [0.17, 0.47, 0.79] as const
export const PREVIEW_AGE = 8
export const MAX_AGE = MAGNETIC_LIFETIME
export const DESCRIPTIONS: Record<ProminenceMorphology, { count: string; summary: string; relation: string; changes: string; watch: string }> = {
  isolated: { count: '1 个环系', summary: '一个主环独立展开，周围不添加小环。', relation: '两端锚定在日面，流线围绕同一条空间轴扭转。', changes: '跨度、高度、拱顶偏斜、凹陷与扭转程度。', watch: '细丝有纵深和间距；多条细丝共同描述一个环系，不等于多个独立拱环。' },
  'one-sided': { count: '2–3 个环系', summary: '主环的一侧，伴随一到两个较小的环。', relation: '小环集中在同一侧的足点区域，整体可朝左或朝右。', changes: '伴随环数量、所在侧、大小比例、距离和朝向。', watch: '更换种子时，主环旁侧会出现一组或两组小环，而另一侧保持空出。' },
  crossed: { count: '2 个环系', summary: '高低不同的两组环，在空间中错位交叠。', relation: '足点区域横向错开，两个环系的深度朝向相反。', changes: '交错位置、大小差、顶点轮廓与空间角度。', watch: '切换到斜视可以辨认前后关系；屏幕上的交叉不表示此处必然发生磁重联。' },
  nested: { count: '含伴随共 3–6 个环系', summary: '逐层降低的拱廊，与另一种类型共同生成。', relation: '内环的足点落在外环跨度内，中心允许轻微偏移。', changes: '嵌套层数、内外比例、层间间隙和拱顶形状。', watch: '嵌套拱廊不能单独生成；种子同时确定另一种伴随类型。两者同步出现、运动和消退。' },
  cluster: { count: '含伴随共 4–6 个环系', summary: '低矮小环簇与另一种类型，在同一活动区生成。', relation: '3–4 个低矮小环聚集在一侧，旁边始终伴随另一种类型的完整构型。', changes: '伴随结构、低环数量、间隔、各自高度、跨度和方向。', watch: '低矮环簇必须伴生，不能单独出现。伴随类型可从其他五类中选择；再生成一簇同类小环不满足此规则。' },
  bilateral: { count: '3 个环系', summary: '一个大环两侧各伴随一个小环。', relation: '左右都有附属环，但大小、距离与深度不要求对称。', changes: '两侧小环的比例、离主环的距离及顶部曲率。', watch: '这是早期反复出现的“一大两小”。现在它只是六类中的一种，基准权重为 8。' },
}

export function parseSeed(text: string): number | null {
  if (!text.trim() || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : null
}
export function readSelection(search: string) {
  const params = new URLSearchParams(search)
  const candidate = params.get('type')
  const kind = PROMINENCE_MORPHOLOGIES.find(item => item.kind === candidate)?.kind ?? DEFAULT_KIND
  return { kind, seed: parseSeed(params.get('seed') ?? '') ?? DEFAULT_SEED }
}
export function readPreviewAge(search: string) {
  const raw = new URLSearchParams(search).get('t')
  const age = raw?.trim() ? Number(raw) : NaN
  return Number.isFinite(age) && age >= 0 && age <= MAX_AGE ? age : PREVIEW_AGE
}
export function selectionSearch(kind: ProminenceMorphology, seed: number, age?: number) {
  const params = new URLSearchParams({ type: kind, seed: String(seed) })
  if (age !== undefined) params.set('t', age.toFixed(3))
  return `?${params}`
}

/** SVG 概览取共享模型第 8 秒的稳定轮廓，足点在完整生命周期内保持固定。 */
export function createOverview(seed: number, kind: ProminenceMorphology) {
  const model = createFluxRopeSimulation(seed, false, kind)
  model.advanceTo(PREVIEW_AGE)
  const p = new Vector3()
  const paths = Array.from({ length: MAGNETIC.strands }, (_, strand) => {
    const points: string[] = []
    for (let j = 0; j < MAGNETIC.samples; j += 2) {
      const offset = (strand * MAGNETIC.samples + j) * 4
      points.push(`${j ? 'L' : 'M'}${(160 + model.curveData[offset] * 66).toFixed(2)},${(143 - model.curveData[offset + 1] * 76).toFixed(2)}`)
    }
    return points.join(' ')
  })
  const feet: [number, number, number][] = []
  let strand = 0
  for (const family of model.structure.families) {
    for (const s of [0, 1]) {
      model.sample(s, strand, 0, p)
      feet.push([p.x, p.y - 0.014, p.z])
    }
    strand += family.strands
  }
  return { structure: model.structure, paths, feet }
}

export function morphologyLabel(kind: string): string {
  return PROMINENCE_MORPHOLOGIES.find(item => item.kind === kind)?.label ?? kind
}
