import { useMemo } from 'react'
import { LOCAL_RECONNECTION, type FamilyEvolution } from '../../behaviors/stellarReorganization'
import { createShortLoopMotion, shortLoopProfile, shortLoopRestHeight } from '../../behaviors/stellarShortLoop'

const labels = ['左侧短环', '右侧短环'], colors = ['#edbc7a', '#8dc7cd']
/** 两侧响应曲线与动态拱形复用三维模型，读同一个事件年龄。 */
export default function Recoil({ plan, age, seek }: { plan: FamilyEvolution; age: number; seek: (age: number) => void }) {
  const start = plan.contact, duration = plan.finish - start
  const motions = useMemo(() => plan.sides.map(side => createShortLoopMotion(side)), [plan])
  const chart = useMemo(() => {
    const height = [[], []] as number[][], targets = [[], []] as number[][], lateral = [[], []] as number[][], strain = [[], []] as number[][]
    const peaks = [start, start], peakValues = [0, 0]
    const reversePeaks = [start, start], reverseValues = [0, 0]
    const lateralLimit = Math.max(...plan.sides.map(side => side.transverse.maxDisplacement))
    let max = 2
    for (let i = 0; i <= 240; i++) for (let b = 0; b < 2; b++) {
      const t = start + duration * i / 240, shape = motions[b].sample(t)
      const value = shortLoopProfile(0.5, 0.5, plan.sides[b], shape, { x: 0, y: 0, z: 0 }).y
      height[b].push(value); targets[b].push(shortLoopRestHeight(plan.sides[b], t))
      lateral[b].push(shape.sway)
      strain[b].push(motions[b].arc(t).strain)
      if (Math.abs(shape.sway) > peakValues[b]) { peaks[b] = t; peakValues[b] = Math.abs(shape.sway) }
      const reverse = -shape.sway * Math.sign(plan.sides[b].transverse.kick)
      if (reverse > reverseValues[b]) { reversePeaks[b] = t; reverseValues[b] = reverse }
      max = Math.max(max, value * 1.1)
    }
    const paths = (values: number[][]) => values.map(row => row.map((h, i) => (i ? 'L' : 'M') + (24 + i / 240 * 552).toFixed(2) + ',' + (128 - h / max * 112).toFixed(2)).join(' '))
    return { strain: strain.map(row => row.map((v, i) => (i ? 'L' : 'M') + (24 + i / 240 * 552).toFixed(2) + ',' + (72 - v / 0.20 * 52).toFixed(2)).join(' ')), paths: paths(height), targets: paths(targets), max, peaks, reversePeaks, lateralLimit,
      lateral: lateral.map(row => row.map((v, i) => (i ? 'L' : 'M') + (24 + i / 240 * 552).toFixed(2) + ',' + (72 - v / lateralLimit * 52).toFixed(2)).join(' ')) }
  }, [plan, start, duration, motions])
  const x = (t: number) => 24 + Math.max(0, Math.min(1, (t - start) / duration)) * 552
  const outline = (b: number, rank: number) => {
    const shape = motions[b].sample(age), p = { x: 0, y: 0, z: 0 }, parts: string[] = []
    for (let j = 0; j <= 80; j++) {
      shortLoopProfile(j / 80, rank, plan.sides[b], shape, p)
      parts.push((j ? 'L' : 'M') + (40 + b * 300 + p.x * 220).toFixed(2) + ',' + (210 - p.y * 220 * motions[b].aspect * (1 - 0.22 * rank)).toFixed(2))
    }
    return parts.join(' ')
  }
  return <div className="redraw-panel" aria-label="左右短环柔性形变实验">
    <div className="lifecycle-heading"><strong>弧长约束下的侧倾、升降与回落</strong><span>同束协调 · 左右各异</span></div>
    <svg className="recoil-chart" viewBox="0 0 600 160" role="img" aria-label="左右短环横向位移：交接阶段开始偏摆，随后反向回摆并衰减">
      <path d="M24 20H576 M24 72H576 M24 124H576" stroke="#344352" strokeDasharray="4 4" />
      <text x="24" y="16">+{Math.round(chart.lateralLimit * 100)}% 跨度</text><text x="24" y="138">−{Math.round(chart.lateralLimit * 100)}%</text>
      {chart.lateral.map((path, i) => <path key={i} d={path} fill="none" stroke={colors[i]} strokeWidth="1.8" />)}
      <path d={'M' + x(start + LOCAL_RECONNECTION.exchange) + ' 20V124'} stroke="#a3afba" strokeDasharray="3 4" />
      <text x={x(start + LOCAL_RECONNECTION.exchange) + 5} y="33">交接完成</text>
      <path d={'M' + x(age) + ' 20V124'} className="life-cursor" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={24 + f * 552} y="155" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>+{(f * duration).toFixed(1)} s</text>)}
    </svg>
    <div className="phase-buttons">
      <button onClick={() => seek(start)}>从重联激发观察</button>
      {chart.peaks.map((t, i) => <button key={i} onClick={() => seek(t)}>{i === 0 ? '左侧首次偏摆' : '右侧首次偏摆'}</button>)}
      <button onClick={() => seek((chart.reversePeaks[0] + chart.reversePeaks[1]) / 2)}>反向回摆</button>
    </div>
    <p>横轴从整束交接开始计时。两侧在交接中分别受到一次平滑侧向推力，左侧向左、右侧向右；强度和响应周期由种子决定；推力结束后保留惯性，产生过冲和回摆。曲线表示参考拱顶新增的横向位移，占各自跨度的比例；实际画面还受原有偏斜、视角与空间走廊约束。拱顶先偏移，两肩延迟跟随，共同弧长张力使高度随侧倾调整；回落时阻尼增强。选择阶段后可在上方以 0.35× 播放。</p>
    <div className="family-states">{plan.sides.map((side, i) => <span key={i} style={{ color: colors[i] }}>{labels[i]} · k / k₀ = {side.transverse.stiffnessScale.toFixed(2)} · 未耦合周期 {(side.transverse.period / Math.sqrt(side.transverse.stiffnessScale)).toFixed(2)} s</span>)}</div>
    <p>横向基础刚度为原始值的 25%，朝外推力增益为 2.40。大幅侧倾使用连续坐标变形，让拱顶接近足点时仍保持环腿顺序；±46% 是拱顶接近边缘的保护范围。真正的伸缩限制由共同弧长约束决定，20% 不限制拱顶位移。上列周期只描述未耦合的基础横向弹簧，加入张力后的实际回摆见曲线。</p>
    <svg className="recoil-chart" viewBox="0 0 600 155" role="img" aria-label="参考短环的弧长变化率，限制为正负百分之二十">
      <path d="M24 20H576 M24 72H576 M24 124H576" stroke="#344352" strokeDasharray="4 4" />
      <text x="24" y="15">+20% 弧长变化</text><text x="24" y="140">−20%</text>
      {chart.strain.map((path, i) => <path key={i} d={path} fill="none" stroke={colors[i]} strokeWidth="1.8" />)}
      <path d={'M' + x(age) + ' 20V124'} className="life-cursor" />
    </svg>
    <div className="family-states">{motions.map((motion, i) => { const arc = motion.arc(age); return <span key={i} style={{ color: colors[i] }}>{labels[i]} · 参考弧长 {arc.reference.toFixed(2)}D · 当前 {arc.length.toFixed(2)}D · 偏差 {(arc.strain * 100).toFixed(1)}%</span> })}</div>
    <p>这张图以足点间距 D 为单位，用统一高宽比对照左右响应。横摆拉长曲线时，共同张力也作用于高度和两肩；反向运动保留惯性，形成相互影响的柔性振荡。参考弧长随消退趋近 D，剩余拱起空间与摆幅一起收拢。上方“当前三维弧长校验”另行显示实际生成模型经过交接和空间约束后的结果。</p>
    <svg className="recoil-chart" viewBox="0 0 600 164" role="img" aria-label="左右拱顶响应与目标高度，回落起点不同">
      <path d={'M24 128H576 M24 ' + (128 - 112 / chart.max) + 'H576'} stroke="#344352" strokeDasharray="4 4" />
      {motions.map((motion, i) => <g key={i}>
        <path d={chart.targets[i]} fill="none" stroke={colors[i]} strokeOpacity="0.4" strokeDasharray="3 4" />
        <path d={chart.paths[i]} fill="none" stroke={colors[i]} strokeWidth="1.8" />
        <path d={'M' + x(motion.plan.fallStart) + ' 10V128'} stroke={colors[i]} strokeOpacity="0.4" strokeDasharray="2 4" />
      </g>)}
      <path d={'M' + x(age) + ' 8V133'} className="life-cursor" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={24 + f * 552} y="156" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>+{(f * duration).toFixed(1)} s</text>)}
    </svg>
    <div className="family-states">{plan.sides.map((side, i) => <span key={i} style={{ color: colors[i] }}>{labels[i]} · {(side.fallStart - start).toFixed(2)} s 开始回落 · 回落用时 {side.fallDuration.toFixed(2)} s · 完全退场 {side.finish.toFixed(2)} s</span>)}</div>
    <p>两侧完全退场相差 {Math.abs(plan.sides[0].finish - plan.sides[1].finish).toFixed(2)} 秒；先退场的一侧由种子决定。另一侧较晚开始回落，回落也更缓慢，保留可见的单侧余环。逐条擦除间隔保持不变，事件尾部为完整队列预留时间。</p>
    <p>虚线是目标升降趋势，实线是拱顶对目标的实际响应；彩色竖线标记各自的回落起点。每侧另有 3–5 次不规则脉冲：出现时刻、方向、持续时间与强弱分别取样。推压更宽缓、力度更轻，配合较慢的回弹和较强的阻尼，让升降更柔和；响应速率只轻微漂移。左右保留各自的惯性与形变，初始回弹方向也随种子改变。</p>
    <svg className="recoil-chart" viewBox="0 0 600 85" role="img" aria-label="左右不规则脉冲序列：向上的短线为上推，向下为下压">
      {plan.sides.map((side, b) => <g key={b}>
        <path d={'M24 ' + (20 + b * 40) + 'H576'} stroke="#344352" />
        {side.pulses.map((pulse, i) => <path key={i} d={'M' + x(pulse.start) + ' ' + (20 + b * 40) + 'q' + ((x(pulse.start + pulse.duration) - x(pulse.start)) / 2) + ' ' + (-pulse.force * 70) + ' ' + (x(pulse.start + pulse.duration) - x(pulse.start)) + ' 0'} stroke={colors[b]} fill="none" strokeWidth="1.5" />)}
        <text x="576" y={15 + b * 40} textAnchor="end" fill={colors[b]}>{labels[b]}</text>
      </g>)}
      <path d={'M' + x(age) + ' 4V80'} className="life-cursor" />
    </svg>
    <p>上图是脉冲的时刻与方向示意：上凸为上推，下凹为下压。它们改变形变的驱动力，拱顶会延迟响应；脉冲结束后仍可继续回弹。</p>
    <svg className="recoil-chart" viewBox="0 0 600 246" role="img" aria-label="同一时刻的左右柔性拱形，展示鼓胀、压扁及两肩滞后">
      {[0, 1].map(b => <g key={b}>
        <path d={'M' + (40 + b * 300) + ' 210h220'} stroke="#344352" />
        {[0, 0.5, 1].map(rank => <path key={rank} d={outline(b, rank)} fill="none" stroke={colors[b]} strokeWidth="1.5" strokeOpacity={1 - rank * 0.45} />)}
        <text x={150 + b * 300} y="237" textAnchor="middle">{labels[b]}</text>
      </g>)}
    </svg>
    <div className="phase-buttons">
      {plan.sides.map((side, i) => <button key={'rise' + i} onClick={() => seek((side.riseStart + side.fallStart) / 2)}>{i === 0 ? '左侧鼓胀' : '右侧鼓胀'}</button>)}
      <button onClick={() => seek(Math.min(...plan.sides.map(side => side.finish)) + 0.08)}>单侧留存</button>
      <button onClick={() => seek((plan.sides[0].fallStart + plan.sides[1].fallStart) / 2)}>错峰对照</button>
      {plan.sides.map((side, i) => <button key={'fall' + i} onClick={() => seek(side.fallStart + side.fallDuration * 0.65)}>{i === 0 ? '左侧回落' : '右侧回落'}</button>)}
      <button onClick={() => seek(Math.max(...plan.sides.map(side => side.fallStart + side.fallDuration)))}>回落末段</button>
    </div>
    <p>上图用相同尺度比较两侧的参考拱形：拱顶伸展时两肩收拢，压低时两肩鼓出；侧向过冲与两肩迟滞共同改变轮廓。足点位置固定，环腿可以围绕足点弯曲、改变根部倾角；每个短环的两条环腿以不同延迟跟随。环腿迟滞只改变根部附近的变形，不额外推动拱顶。同束丝线共享主要运动，只添加沿层次连续的小幅差异；沿线擦除仍逐条推进。</p>
    <div className="family-states">{plan.sides.map((side, i) => <span key={i} style={{ color: colors[i] }}>{labels[i]} · 两腿响应时间常数 {side.transverse.legLag.map(t => t.toFixed(3)).join(' / ')} s</span>)}</div>
    <p>根部向上延伸的线段应呈现连续倾斜与回摆，磁通区域标记保持在原位。实际三维路径仍有空间分隔：靠中央的环腿向内摆动时可能受到限制。</p>
    <p>图示复用形变求解和轮廓采样，不包含交接插值、实际足点间距、空间走廊约束与发光擦除；实际效果以三维预览为准。可使用 0.35× 播放观察。随机性由种子确定，回退会复现相同形态；“气泡感”是形变的艺术表达。</p>
  </div>
}
