import { useMemo } from 'react'
import { createFilamentRenewal } from '../../behaviors/stellarRedraw'
import { createMagneticLifecycle } from '../../behaviors/stellarLifecycle'
import { reorganizationProgress, reorganizationRedraw, type FamilyEvolution } from '../../behaviors/stellarReorganization'

/** 整线代际示意与生产模型共用出生表；几何示意不作实际场线投影。 */
export default function Redraw({ plan, age, seek }: { plan: FamilyEvolution; age: number; seek: (age: number) => void }) {
  const pool = useMemo(() => createFilamentRenewal(plan.timing, plan.strands, plan.seed, plan.reorganizes ? plan.approach : undefined), [plan])
  const life = useMemo(() => createMagneticLifecycle(plan.timing.end, plan.seed, false, plan.timing), [plan])
  life.advanceTo(age); pool.update(age)
  const progress = reorganizationProgress(plan, age)
  const slots = Array.from({ length: pool.count }, (_, i) => i).filter(i => pool.generations[i] >= 0).sort((a, b) => pool.layers[a] - pool.layers[b])
  const next = Array.from(pool.births).find(t => t > age + 0.06)
  const visible = (slot: number) => pool.visibility[slot] * (plan.reorganizes ? reorganizationRedraw(plan, age, pool.ranks[slot], 0) : 1)
  return <div className="redraw-panel">
    <div className="lifecycle-heading"><strong>丝线束滚动更新</strong><span>{pool.phase}</span></div>
    <p>当前环系上限 {pool.count} 条 · 已生成 {pool.emitted} 代 · 生长最短间隔 {(pool.births[1] - pool.births[0]).toFixed(2)} s · {age < plan.timing.settled ? '内层退出 · 新外层接入' : age < plan.timing.decay ? '保留最终代' : '外层退出 · 新内层接入 · 末段停止补入'}</p>
    <svg viewBox="0 0 600 176" role="img" aria-label="整束按层次换代，各丝线沿箭头方向绘入与擦除；生长向外，消退向内">
      <path d="M24 158H576" stroke="#344352" />
      {slots.map(slot => {
        const height = (0.5 + pool.layers[slot] * 0.5) * 140 * life.height, shade = 193 - pool.ranks[slot] * 160
        const reverse = pool.directions[slot] < 0, start = pool.erase[slot], end = pool.draw[slot]
        return <path key={pool.generations[slot]} d={(reverse ? 'M548 157C442 ' : 'M52 157C150 ') + (157 - height) + (reverse ? ' 150 ' : ' 442 ') + (157 - height) + (reverse ? ' 52 157' : ' 548 157')} fill="none" stroke={'hsl(' + shade + ' 70% 66%)'} strokeWidth="1.7" pathLength={1} strokeDasharray={Math.max(0, end - start) + ' 1'} strokeDashoffset={-start} opacity={visible(slot)}><title>第 {pool.generations[slot] + 1} 代 · 沿{reverse ? '右到左' : '左到右'}方向绘制</title></path>
      })}
      <circle cx="52" cy="157" r="3" fill="#edbc7a" /><circle cx="548" cy="157" r="3" fill="#8dc7cd" />
    </svg>
    <div className="generation-list" aria-label="当前代数由内层到外层"><span>内 → 外</span>{slots.map(slot => <span key={pool.generations[slot]} style={{ opacity: 0.2 + 0.8 * visible(slot) }}>#{pool.generations[slot] + 1}{pool.directions[slot] > 0 ? '→' : '←'}</span>)}</div>
    <div className="phase-buttons"><button onClick={() => seek(plan.timing.birth)}>从本环系初生观察</button><button disabled={next === undefined} onClick={() => next !== undefined && seek(next + 0.06)}>下一条新丝线</button></div>
    <p>整束决定换代层次，每条丝线沿箭头方向逐渐绘入、逐渐擦除。生长向外补入，稳定时保持；松弛到回缩时向内补入更低矮的新轮廓，末段减少补入直至退出。代数持续增加，不倒放旧代。上图示意更新规则，三维预览按实际路径弧长推进。</p>
    {plan.reorganizes && <div className="redraw-meters">{[['预生长', progress.grow], ['整束交接', progress.exchange], ['形态松弛', progress.settle], ['两侧回落均值', progress.collapse]].map(([label, value]) => <label key={label}><span>{label}<output>{Math.round(Number(value) * 100)}%</output></span><meter min="0" max="1" value={value} aria-label={String(label) + '进度'} /></label>)}</div>}
  </div>
}
