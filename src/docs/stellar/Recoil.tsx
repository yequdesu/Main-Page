import { useMemo } from 'react'
import { LOCAL_RECONNECTION, type FamilyEvolution } from '../../behaviors/stellarReorganization'
import { createShortLoopMotion, shortLoopProfile, shortLoopTarget } from '../../behaviors/stellarShortLoop'

const labels = ['左侧短环', '右侧短环'], colors = ['#edbc7a', '#8dc7cd']
/** 两侧响应曲线与动态拱形复用三维模型，读同一个事件年龄。 */
export default function Recoil({ plan, age, seek }: { plan: FamilyEvolution; age: number; seek: (age: number) => void }) {
  const start = plan.contact + LOCAL_RECONNECTION.exchange, duration = plan.finish - start
  const motions = useMemo(() => plan.sides.map(side => createShortLoopMotion(side)), [plan])
  const chart = useMemo(() => {
    const height = [[], []] as number[][], targets = [[], []] as number[][]
    let max = 2
    for (let i = 0; i <= 240; i++) for (let b = 0; b < 2; b++) {
      const t = start + duration * i / 240, shape = motions[b].sample(t)
      const value = shortLoopProfile(0.5, 0.5, plan.sides[b], shape, { x: 0, y: 0, z: 0 }).y
      height[b].push(value); targets[b].push(shortLoopTarget(plan.sides[b], t))
      max = Math.max(max, value * 1.1)
    }
    const paths = (values: number[][]) => values.map(row => row.map((h, i) => (i ? 'L' : 'M') + (24 + i / 240 * 552).toFixed(2) + ',' + (128 - h / max * 112).toFixed(2)).join(' '))
    return { paths: paths(height), targets: paths(targets), max }
  }, [plan, start, duration, motions])
  const x = (t: number) => 24 + Math.max(0, Math.min(1, (t - start) / duration)) * 552
  const outline = (b: number, rank: number) => {
    const shape = motions[b].sample(age), p = { x: 0, y: 0, z: 0 }, parts: string[] = []
    for (let j = 0; j <= 80; j++) {
      shortLoopProfile(j / 80, rank, plan.sides[b], shape, p)
      parts.push((j ? 'L' : 'M') + (40 + b * 300 + p.x * 220).toFixed(2) + ',' + (132 - p.y * 42 * (1 - 0.22 * rank)).toFixed(2))
    }
    return parts.join(' ')
  }
  return <div className="redraw-panel" aria-label="左右短环柔性形变实验">
    <div className="lifecycle-heading"><strong>鼓胀、挤压与错峰回落</strong><span>同束协调 · 左右各异</span></div>
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
    <div className="family-states">{plan.sides.map((side, i) => <span key={i} style={{ color: colors[i] }}>{labels[i]} · {(side.fallStart - start).toFixed(2)} s 开始回落 · 用时 {side.fallDuration.toFixed(2)} s</span>)}</div>
    <p>虚线是目标升降趋势，实线是拱顶对目标的实际响应；彩色竖线标记各自的回落起点。每侧另有 3–5 次不规则脉冲：出现时刻、方向、持续时间与强弱分别取样，还会短暂改变回弹速度。轮廓带着惯性响应，初始回弹方向也随种子改变。</p>
    <svg className="recoil-chart" viewBox="0 0 600 85" role="img" aria-label="左右不规则脉冲序列：向上的短线为上推，向下为下压">
      {plan.sides.map((side, b) => <g key={b}>
        <path d={'M24 ' + (20 + b * 40) + 'H576'} stroke="#344352" />
        {side.pulses.map((pulse, i) => <path key={i} d={'M' + x(pulse.start) + ' ' + (20 + b * 40) + 'q' + ((x(pulse.start + pulse.duration) - x(pulse.start)) / 2) + ' ' + (-pulse.force * 70) + ' ' + (x(pulse.start + pulse.duration) - x(pulse.start)) + ' 0'} stroke={colors[b]} fill="none" strokeWidth="1.5" />)}
        <text x="576" y={15 + b * 40} textAnchor="end" fill={colors[b]}>{labels[b]}</text>
      </g>)}
      <path d={'M' + x(age) + ' 4V80'} className="life-cursor" />
    </svg>
    <p>上图是脉冲的时刻与方向示意：上凸为上推，下凹为下压。它们改变形变的驱动力，拱顶会延迟响应；脉冲结束后仍可继续回弹。</p>
    <svg className="recoil-chart" viewBox="0 0 600 168" role="img" aria-label="同一时刻的左右柔性拱形，展示鼓胀、压扁及两肩滞后">
      {[0, 1].map(b => <g key={b}>
        <path d={'M' + (40 + b * 300) + ' 132h220'} stroke="#344352" />
        {[0, 0.5, 1].map(rank => <path key={rank} d={outline(b, rank)} fill="none" stroke={colors[b]} strokeWidth="1.5" strokeOpacity={1 - rank * 0.45} />)}
        <text x={150 + b * 300} y="158" textAnchor="middle">{labels[b]}</text>
      </g>)}
    </svg>
    <div className="phase-buttons">
      {plan.sides.map((side, i) => <button key={'rise' + i} onClick={() => seek((side.riseStart + side.fallStart) / 2)}>{i === 0 ? '左侧鼓胀' : '右侧鼓胀'}</button>)}
      <button onClick={() => seek((plan.sides[0].fallStart + plan.sides[1].fallStart) / 2)}>错峰对照</button>
      {plan.sides.map((side, i) => <button key={'fall' + i} onClick={() => seek(side.fallStart + side.fallDuration * 0.65)}>{i === 0 ? '左侧回落' : '右侧回落'}</button>)}
      <button onClick={() => seek(Math.max(...plan.sides.map(side => side.fallStart + side.fallDuration)))}>回落末段</button>
    </div>
    <p>下图用相同尺度比较两侧的参考拱形：拱顶伸展时两肩收拢，压低时两肩鼓出，偏斜与拱肩滞后让轮廓持续改变。足点固定，同束丝线共享主要运动，只添加沿层次连续的小幅差异；沿线擦除仍逐条推进。</p>
    <p>图示复用形变求解和轮廓采样，不包含交接插值、实际足点间距、空间走廊约束与发光擦除；实际效果以三维预览为准。可使用 0.35× 播放观察。随机性由种子确定，回退会复现相同形态；“气泡感”是形变的艺术表达。</p>
  </div>
}
