import { useMemo } from 'react'
import { createMagneticLifecycle, MAGNETIC_LIFETIME } from '../../behaviors/stellarLifecycle'

export default function Lifecycle({ seed, age, seek }: { seed: number; age: number; seek: (age: number) => void }) {
  const diagram = useMemo(() => {
    const model = createMagneticLifecycle(MAGNETIC_LIFETIME, seed)
    const height: string[] = [], drive: string[] = []
    for (let i = 0; i <= 120; i++) {
      const state = model.advanceTo(i / 120 * MAGNETIC_LIFETIME), x = 24 + i * 4.6
      height.push(`${i ? 'L' : 'M'}${x},${100 - state.height * 72}`)
      drive.push(`${i ? 'L' : 'M'}${x},${100 - state.drive * 72}`)
    }
    return { height: height.join(' '), drive: drive.join(' ') }
  }, [seed])
  const state = createMagneticLifecycle(MAGNETIC_LIFETIME, seed).advanceTo(age)
  const x = 24 + age / MAGNETIC_LIFETIME * 552
  return <div className="lifecycle-panel" aria-label="磁拱环生命周期实验">
    <div className="lifecycle-heading"><strong>{state.phase}</strong><span>高度包络 {Math.round(state.height * 100)}% · 驱动 {Math.round(state.drive * 100)}%</span></div>
    <svg viewBox="0 0 600 126" role="img" aria-label={`生命周期曲线：当前 ${age.toFixed(1)} 秒，${state.phase}阶段。实线表示高度包络，虚线表示形成驱动。`}>
      <path d="M24 100H576" stroke="#344352" />
      <path d={diagram.height} className="life-height" />
      <path d={diagram.drive} className="life-drive" />
      <path d={`M${x} 16V102`} className="life-cursor" />
      <circle cx={x} cy={100 - state.height * 72} r="4" fill="#e9bb82" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={24 + f * 552} y="119" textAnchor="middle">{f * MAGNETIC_LIFETIME} s</text>)}
    </svg>
    <div className="phase-buttons">{[['初生', 0], ['生长', 2.5], ['稳定', 8], ['松弛', state.timing.decay + 0.5], ['回缩', state.timing.decay + 7.5], ['结束', MAGNETIC_LIFETIME]].map(([label, t]) => <button key={label} onClick={() => seek(Number(t))}>{label}</button>)}</div>
    <p>实线：相对足点弦线的高度包络 · 虚线：形成期驱动。包络不是实际拱顶高度；轮廓仍由形变和负载共同决定。</p>
  </div>
}
