import { useMemo } from 'react'
import { createReorganizationRecoil, LOCAL_RECONNECTION, shortBundleLift, shortBundleCollapse, shortRetirementStart, type FamilyEvolution } from '../../behaviors/stellarReorganization'

const labels = ['左侧短环', '右侧短环', '中央短环'], colors = ['#edbc7a', '#8dc7cd', '#bfabd9']
/** 与模型共用脉冲响应；图中不重复模拟空间约束或丝线擦除。 */
export default function Recoil({ plan, age, seek }: { plan: FamilyEvolution; age: number; seek: (age: number) => void }) {
  const exchanged = plan.contact + LOCAL_RECONNECTION.exchange
  const response = useMemo(() => [1, 2, 3].map(branch => {
    const model = createReorganizationRecoil(plan, branch), points: string[] = []
    for (let i = 0; i <= 160; i++) points.push((i ? 'L' : 'M') + (24 + i / 160 * 552).toFixed(2) + ',' + (72 - model.sample(exchanged + i / 100).height * 140).toFixed(2))
    return { model, path: points.join(' ') }
  }), [plan, exchanged])
  const bundle = useMemo(() => {
    const paths = ['', '', ''], duration = plan.finish - exchanged
    for (let i = 0; i <= 200; i++) {
      const t = exchanged + duration * i / 200, lift = shortBundleLift(plan, t), scale = 1 - 0.97 * shortBundleCollapse(plan, t)
      for (let b = 0; b < 3; b++) {
        const height = (1 + lift + (b < 2 ? response[b].model.sample(t).height : 0)) * scale
        paths[b] += (i ? 'L' : 'M') + (24 + i / 200 * 552).toFixed(2) + ',' + (116 - height * 60).toFixed(2)
      }
    }
    return { paths, duration }
  }, [plan, exchanged, response])
  const bundleX = (t: number) => 24 + Math.max(0, Math.min(1, (t - exchanged) / bundle.duration)) * 552
  const retreat = shortRetirementStart(plan)
  const x = 24 + Math.max(0, Math.min(1, (age - exchanged) / 1.6)) * 552
  return <div className="redraw-panel" aria-label="短环回缩与阻尼振荡实验">
    <div className="lifecycle-heading"><strong>振荡增强，整束短暂上抬后回落</strong><span>两侧较强 · 中央较弱</span></div>
    <svg className="recoil-chart" viewBox="0 0 600 145" role="img" aria-label="三条短环的基础高度响应：先向下过冲，再回弹并逐渐衰减">
      <path d="M24 72H576" stroke="#344352" strokeDasharray="4 4" />
      {response.map(({ path }, i) => <path key={i} d={path} fill="none" stroke={colors[i]} strokeWidth="1.7" />)}
      <path d={'M' + x + ' 12V124'} className="life-cursor" />
      {[0, 0.4, 0.8, 1.2, 1.6].map(t => <text key={t} x={24 + t / 1.6 * 552} y="140" textAnchor={t === 0 ? 'start' : t === 1.6 ? 'end' : 'middle'}>+{t.toFixed(1)} s</text>)}
    </svg>
    <div className="family-states">{response.map(({ model }, i) => <span key={i} style={{ color: colors[i] }}>{labels[i]} · 周期 {model.period.toFixed(2)} s</span>)}</div>
    <div className="phase-buttons"><button onClick={() => seek(response[0].model.troughAt)}>回缩过冲</button><button onClick={() => seek(response[0].model.crestAt)}>首次回弹</button><button onClick={() => seek(response[0].model.troughAt + response[0].model.period)}>衰减振荡</button></div>
    <p>两侧基础振幅增至低拱高度的 24%–30%，偏离平衡越远，增益越强，最多 1.5 倍；振荡衰减也更慢。中央仍约 5%–7%。上图只显示三支的基础脉冲响应，虚线为零位移，左右起伏略微错开。</p>
    <svg className="recoil-chart" viewBox="0 0 600 150" role="img" aria-label="两侧短环的参考拱顶：振荡中上抬，随后整束快速回落并持续收拢">
      <path d="M24 116H576 M24 56H576" stroke="#344352" strokeDasharray="4 4" />
      {bundle.paths.map((path, i) => <path key={i} d={path} fill="none" stroke={i === 2 ? '#e8e9e9' : colors[i]} strokeWidth={i === 2 ? 1 : 1.7} strokeDasharray={i === 2 ? '4 4' : undefined} />)}
      <path d={'M' + bundleX(age) + ' 8V122'} className="life-cursor" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={24 + f * 552} y="144" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>+{(f * bundle.duration).toFixed(1)} s</text>)}
    </svg>
    <div className="phase-buttons"><button onClick={() => seek(retreat - LOCAL_RECONNECTION.hold)}>开始上抬</button><button onClick={() => seek(retreat)}>上抬末段</button><button onClick={() => seek(retreat + LOCAL_RECONNECTION.bundleFall * 0.75)}>整体回落</button></div>
    <p>下图灰白虚线表示共同升降趋势：{LOCAL_RECONNECTION.hold} 秒内额外上抬 55%，随后约 {LOCAL_RECONNECTION.bundleFall} 秒完成主要回落，剩余低拱继续整束收拢。彩线叠加左右基础振荡；同束全部丝线共用几何升降，逐条擦除只改变可见度，不再各自下坠。</p>
    <p>横轴均从主环交接完成计时。下图从低拱参考高度起算，未包含最初的定形插值、几何偏离增益、沿线擦除与空间分隔约束；实际效果以三维预览为准。可用 0.35× 播放观察，时间与振幅为视觉实验参数。</p>
  </div>
}
