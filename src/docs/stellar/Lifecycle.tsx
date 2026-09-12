import { useMemo } from 'react'
import { createMagneticLifecycle, MAGNETIC_LIFETIME } from '../../behaviors/stellarLifecycle'
import { evolutionPhase, LOCAL_RECONNECTION, type FamilyEvolution } from '../../behaviors/stellarReorganization'

const colors = ['#edbc7a', '#8dc7cd', '#bfabd9', '#a9c38c', '#de9e96', '#9caee0']
export default function Lifecycle({ plans, age, seek }: { plans: FamilyEvolution[]; age: number; seek: (age: number) => void }) {
  const diagram = useMemo(() => plans.map(plan => {
    const model = createMagneticLifecycle(plan.timing.end, 0, false, plan.timing), path: string[] = []
    for (let i = 0; i <= 120; i++) {
      if (plan.reorganizes && i / 120 * MAGNETIC_LIFETIME > plan.contact) break
      const state = model.advanceTo(i / 120 * MAGNETIC_LIFETIME)
      path.push((i ? 'L' : 'M') + (24 + i * 4.6) + ',' + (100 - state.height * state.opacity * 72))
    }
    return path.join(' ')
  }), [plans])
  const candidate = plans.find(plan => plan.probability > 0), route = plans.find(plan => plan.reorganizes)
  const x = 24 + age / MAGNETIC_LIFETIME * 552
  const connected = route && age >= route.contact
  return <div className="lifecycle-panel" aria-label="磁拱环生命周期实验">
    <div className="lifecycle-heading"><strong>各环系独立演化</strong><span>{age.toFixed(1)} s / {MAGNETIC_LIFETIME} s</span></div>
    <svg viewBox="0 0 600 126" role="img" aria-label="各环系的可见高度包络，不同颜色对应下方环系编号">
      <path d="M24 100H576" stroke="#344352" />
      {diagram.map((path, i) => <path key={i} d={path} fill="none" stroke={colors[i]} strokeWidth="1.5" />)}
      <path d={'M' + x + ' 16V102'} className="life-cursor" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={24 + f * 552} y="119" textAnchor="middle">{f * MAGNETIC_LIFETIME} s</text>)}
    </svg>
    <div className="family-states">{plans.map((plan, i) => <span key={i} style={{ color: colors[i] }}>0{i + 1} · {evolutionPhase(plan, age)}</span>)}</div>
    <div className="phase-buttons">{[['初生', 0], ['生长', 2.5], ['稳定', 12], ['松弛', Math.min(...plans.map(p => p.timing.decay)) + 0.5], ['回缩', 29.5], ['结束', MAGNETIC_LIFETIME]].map(([label, t]) => <button key={label} onClick={() => seek(Number(t))}>{label}</button>)}</div>
    <p>每条彩线表示一个原有环系的高度包络 × 可见度，在换接处截止；不是实际拱顶高度。此后短支由接触形状继续松弛，旧长连接已消失。</p>
    <div className="connection-heading"><strong>{route ? '本次：局部连接重组' : '本次：直接回缩'}</strong><span>重组倾向 {Math.round((candidate?.probability ?? 0) * 100)}% · 种子抽样 {candidate?.draw.toFixed(2) ?? '—'}</span></div>
    {route ? <>
      <svg className="connection-diagram" viewBox="0 0 600 138" role="img" aria-label={connected ? '固定磁通区域 A 正、D 负、C 正、B 负；重组后 A 连接 D，C 连接 B，原有 A 到 B 长连接已消失' : '固定磁通区域 A 正、D 负、C 正、B 负；重组前 A 连接 B，C 连接 D'}>
        <path d="M28 107H572" stroke="#344352" />
        {connected ? <g fill="none" stroke="#edbc7a" strokeWidth="2"><path d="M40 106Q108 40 176 106" /><path d="M400 106Q480 18 560 106" /></g>
          : <g fill="none" strokeWidth="2"><path d="M40 106Q300 -40 560 106" stroke="#edbc7a" /><path d="M400 106Q288 6 176 106" stroke="#8dc7cd" /></g>}
        {[['A +', 40], ['D −', 176], ['C +', 400], ['B −', 560]].map(([label, cx]) => <g key={label}><circle cx={cx} cy="106" r="4" fill={String(label).includes('+') ? '#edbc7a' : '#8dc7cd'} /><text x={cx} y="128" textAnchor="middle">{label}</text></g>)}
      </svg>
      <div className="phase-buttons"><button onClick={() => seek(route.approach)}>接近前</button><button onClick={() => seek(route.contact + 1 / 120)}>换接瞬间</button><button onClick={() => seek(route.contact + LOCAL_RECONNECTION.settle)}>短环回缩</button></div>
      <p>连接关系示意（不按比例）：A→B、C→D 换为 A→D、C→B。三维模型以 {LOCAL_RECONNECTION.approach} 秒靠拢、{LOCAL_RECONNECTION.settle} 秒圆滑收为短环；连续继承等离子体路径，旧长连接随换接消失。其他独立环系继续演化。{age >= route.finish ? '当前短支已消退，图中仅保留连接记录。' : ''}</p>
    </> : <p>本种子未触发局部重组，各环系按自己的节奏直接回缩。可以更换种子观察另一条路径；较大跨度与较强的背景磁通配置提高重组倾向，但不保证发生。</p>}
    <p>概率用于构图实验，并非太阳观测统计。固定的是短时磁通区域，发光变暗不意味着磁场消失。</p>
  </div>
}
