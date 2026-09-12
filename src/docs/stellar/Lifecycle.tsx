import Redraw from './Redraw'
import Recoil from './Recoil'
import { useMemo } from 'react'
import { createMagneticLifecycle, MAGNETIC_LIFETIME } from '../../behaviors/stellarLifecycle'
import { evolutionPhase, LOCAL_RECONNECTION, centralStrandStart, centralStrandCount, type FamilyEvolution } from '../../behaviors/stellarReorganization'

const colors = ['#edbc7a', '#8dc7cd', '#bfabd9', '#a9c38c', '#de9e96', '#9caee0']
export default function Lifecycle({ plans, age, seek }: { plans: FamilyEvolution[]; age: number; seek: (age: number) => void }) {
  const diagram = useMemo(() => plans.map(plan => {
    const model = createMagneticLifecycle(plan.timing.end, 0, false, plan.timing), path: string[] = []
    for (let i = 0; i <= 120; i++) {
      if (plan.reorganizes && i / 120 * MAGNETIC_LIFETIME > plan.contact + LOCAL_RECONNECTION.exchange) break
      const state = model.advanceTo(i / 120 * MAGNETIC_LIFETIME)
      path.push((i ? 'L' : 'M') + (24 + i * 4.6) + ',' + (100 - state.height * 72))
    }
    return path.join(' ')
  }), [plans])
  const candidate = plans.find(plan => plan.probability > 0), route = plans.find(plan => plan.reorganizes)
  const x = 24 + age / MAGNETIC_LIFETIME * 552
  return <div className="lifecycle-panel" aria-label="磁拱环生命周期实验">
    <div className="lifecycle-heading"><strong>各环系独立演化</strong><span>{age.toFixed(1)} s / {MAGNETIC_LIFETIME} s</span></div>
    <svg viewBox="0 0 600 126" role="img" aria-label="各环系的几何高度包络，不同颜色对应下方环系编号">
      <path d="M24 100H576" stroke="#344352" />
      {diagram.map((path, i) => <path key={i} d={path} fill="none" stroke={colors[i]} strokeWidth="1.5" />)}
      <path d={'M' + x + ' 16V102'} className="life-cursor" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={24 + f * 552} y="119" textAnchor="middle">{f * MAGNETIC_LIFETIME} s</text>)}
    </svg>
    <div className="family-states">{plans.map((plan, i) => <span key={i} style={{ color: colors[i] }}>0{i + 1} · {evolutionPhase(plan, age)}</span>)}</div>
    <div className="phase-buttons">{[['初生', 0], ['生长', 2.5], ['稳定', 12], ['松弛', Math.min(...plans.map(p => p.timing.decay)) + 0.5], ['向内更迭', (route ?? plans[0]).timing.decay + 2.2], ['回缩', 29.5], ['结束', MAGNETIC_LIFETIME]].map(([label, t]) => <button key={label} onClick={() => seek(Number(t))}>{label}</button>)}</div>
    <p>每条彩线表示原有环系的几何高度包络，在交接完成处截止；不代表实际发光轮廓。整条丝线的更新情况见下方代际图。</p>
    <div className="connection-heading"><strong>{route ? '本次：局部连接重组' : '本次：直接回缩'}</strong><span>重组倾向 {Math.round((candidate?.probability ?? 0) * 100)}% · 种子抽样 {candidate?.draw.toFixed(2) ?? '—'}</span></div>
    {route ? <>
      <div className="phase-buttons reorganization-buttons"><button onClick={() => seek(route.approach + LOCAL_RECONNECTION.approach * 0.6)}>短环预生长</button><button onClick={() => seek(route.contact + LOCAL_RECONNECTION.exchange * 0.45)}>整束交接</button><button onClick={() => seek(route.contact + LOCAL_RECONNECTION.exchange)}>中央承接</button><button onClick={() => seek(route.contact + LOCAL_RECONNECTION.exchange + 0.08)}>分支分离</button><button onClick={() => seek(route.contact + LOCAL_RECONNECTION.exchange + LOCAL_RECONNECTION.centralHold + LOCAL_RECONNECTION.centralLower * 0.6)}>中央回落</button><button onClick={() => seek(centralStrandStart(route, 0.5) + LOCAL_RECONNECTION.centralLower + LOCAL_RECONNECTION.centralErase * 0.5)}>中央逐条退场</button><button onClick={() => seek(Math.min(...route.sides.map(side => (side.riseStart + side.fallStart) / 2)))}>振荡上抬</button><button onClick={() => seek((route.sides[0].fallStart + route.sides[1].fallStart) / 2)}>错峰回落</button><button onClick={() => seek(route.finish + 0.02)}>重组结束</button></div>
      <p>短环先用 {LOCAL_RECONNECTION.approach} 秒长到主环的局部外肩。随后用 {LOCAL_RECONNECTION.exchange} 秒逐层、沿丝线方向交接，外层旧主环先退出，短环提前接入。中央过渡环交错保留 {centralStrandCount(route)} / {route.strands} 条丝线，两侧各保留 {route.strands} 条。中央承接原拱顶，停留 {LOCAL_RECONNECTION.centralHold} 秒后，从外到内每隔 {LOCAL_RECONNECTION.centralInterval} 秒启动一条丝线；每条回落 {LOCAL_RECONNECTION.centralLower} 秒，再沿自身方向擦除 {LOCAL_RECONNECTION.centralErase} 秒。两侧短环用 {LOCAL_RECONNECTION.settle} 秒转向低拱平衡形态，随后各自鼓胀与回落，回落起点相差 {Math.abs(route.sides[0].fallStart - route.sides[1].fallStart).toFixed(2)} 秒。高度、拱肩宽度和偏斜通过耦合响应一起变化；每侧的丝线共享自己的运动，仅擦除按外到内排队，相邻间隔 {LOCAL_RECONNECTION.strandInterval} 秒，每条退场窗口 {LOCAL_RECONNECTION.collapse} 秒。当前环系的局部过程共 {(route.finish - route.approach).toFixed(2)} 秒。</p><p>三条短环共用弯曲的空间分隔面，邻接拱足落在同一磁通区域的不同位置。回落与回缩始终受分隔面约束，避免中央环穿过两侧；约束保留高度和纵深变化，在交接附近略微调整横向轮廓。</p>
    </> : <p>本种子未触发局部重组，各环系按自己的节奏直接回缩。可以更换种子观察另一条路径；较大跨度与较强的背景磁通配置提高重组倾向，但不保证发生。</p>}
    {route && <Recoil plan={route} age={age} seek={seek} />}
    <Redraw plan={route ?? plans[0]} age={age} seek={seek} />
    <p>概率用于构图实验，并非太阳观测统计。固定的是短时磁通区域，发光变暗不意味着磁场消失。</p>
  </div>
}
