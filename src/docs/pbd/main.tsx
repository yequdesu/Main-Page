import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CHAPTERS } from './formulas'
import { compareRates, DEFAULTS, Experiment, NAMES, SCENARIOS, WORLD, type Point, type Scenario, type Settings, type Snapshot } from './model'
import './style.css'

const CAMERAS: Record<Scenario, [number, number, number, number]> = {
  orbit: [0, 0, 1280, 720], crowded: [510, 230, 520, 292.5],
  star: [510, 260, 290, 163.125], expanded: [530, 230, 520, 292.5], edge: [970, 215, 400, 225],
}
const fixed = (value: number) => value.toFixed(1)

function Diagram({ snapshot: f, settings: s, chapter, ranges, targets, trails, history }: {
  snapshot: Snapshot; settings: Settings; chapter: string; ranges: boolean; targets: boolean; trails: boolean; history: Point[][]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const node = svgRef.current!
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width || 800))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const camera = CAMERAS[s.scenario]
  const font = 12 * camera[2] / width
  return <svg ref={svgRef} className="simulation" viewBox={camera.join(' ')} role="img" aria-labelledby="scene-title scene-desc">
    <title id="scene-title">{SCENARIOS[s.scenario].name}的标签布局动画</title>
    <desc id="scene-desc">圆点是行星，金色圆是恒星，彩色矩形是算法标签，虚线矩形是目标。实时重叠和净距见下方数值。</desc>
    <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" className="grid-line" /></pattern></defs>
    <rect x={camera[0]} y={camera[1]} width={camera[2]} height={camera[3]} fill="url(#grid)" />
    <rect x="12" y="12" width={WORLD.width - 24} height={WORLD.height - 24} className="viewport-boundary" />
    {s.scenario === 'orbit' && [0, 1, 2].map(i => <ellipse key={i} cx={f.star.x} cy={f.star.y} rx={[140, 235, 345][i]} ry={[90, 135, 175][i]} className="orbit" />)}
    <circle cx={f.star.x} cy={f.star.y} r={f.star.r} className="star" />
    {(ranges || chapter === 'projection') && <circle cx={f.star.x} cy={f.star.y} r={f.star.r + 8} className="star-boundary" />}
    {f.planets.map((p, i) => {
      if (!p.visible) return null
      const label = f.labels[i], size = f.sizes[i], target = f.targets[i]
      return <g key={i} className={`series series-${i}`}>
        {ranges && <circle cx={p.sx} cy={p.sy} r={s.range} className="anchor-range" />}
        {chapter === 'projection' && <circle cx={p.sx} cy={p.sy} r={Math.max(size.width, size.height) / 2 + p.pr + 4} className="planet-boundary" />}
        {trails && <polyline points={history[i].map(point => `${point.x},${point.y}`).join(' ')} className="trail" />}
        {targets && <>
          <rect x={target.x} y={target.y} width={size.width} height={size.height} className="target-box" />
          <path d={`M${target.x+size.width/2-4},${target.y+size.height/2}h8 M${target.x+size.width/2},${target.y+size.height/2-4}v8`} className="target-cross" />
          <line x1={p.sx} y1={p.sy} x2={target.x+size.width/2} y2={target.y+size.height/2} className="target-direction" />
        </>}
        <line x1={p.sx} y1={p.sy} x2={label.x+size.width/2} y2={label.y+size.height/2} className="association" />
        <circle cx={p.sx} cy={p.sy} r={p.pr} className="planet" />
        <rect x={label.x} y={label.y} width={size.width} height={size.height} rx="3" className="label-box" />
        <text x={label.x+size.width/2} y={label.y-6*camera[2]/width} textAnchor="middle" fontSize={font} className="label-name">{NAMES[i]}</text>
        {[label.anchorL, label.anchorR].map((a, j) => <circle key={j} cx={a.x} cy={a.y} r={2.3*camera[2]/width} className="anchor" />)}
      </g>
    })}
    {f.labels.flatMap((a, i) => f.labels.slice(i + 1).map((b, offset) => {
      const j = i + offset + 1
      if (!f.planets[i].visible || !f.planets[j].visible) return null
      const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y)
      const w = Math.min(a.x+f.sizes[i].width,b.x+f.sizes[j].width)-x
      const h = Math.min(a.y+f.sizes[i].height,b.y+f.sizes[j].height)-y
      return w > 0 && h > 0 ? <rect key={`${i}-${j}`} x={x} y={y} width={w} height={h} className="overlap" /> : null
    }))}
  </svg>
}

function App() {
  const engine = useRef(new Experiment(DEFAULTS))
  const history = useRef<Point[][]>([[], [], []])
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS })
  const [snapshot, setSnapshot] = useState(() => engine.current.reset())
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [chapter, setChapter] = useState(0)
  const [ranges, setRanges] = useState(false)
  const [targets, setTargets] = useState(true)
  const [trails, setTrails] = useState(false)
  const [comparison, setComparison] = useState<ReturnType<typeof compareRates> | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const previous = document.documentElement.style.colorScheme
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    return () => { document.documentElement.style.colorScheme = previous }
  }, [dark])

  const reset = (next: Settings = settings) => {
    const fresh = { ...next }
    setSettings(fresh)
    history.current = [[], [], []]
    setSnapshot(engine.current.reset(fresh))
    setComparison(null)
    setAnnouncement('实验已复位至 0 秒，使用当前参数。')
  }
  const change = (patch: Partial<Settings>) => reset({ ...settings, ...patch })
  const advance = () => {
    const next = engine.current.step()
    next.labels.forEach((label, i) => {
      history.current[i].push({ x: label.x+next.sizes[i].width/2, y: label.y+next.sizes[i].height/2 })
      if (history.current[i].length > 180) history.current[i].shift()
    })
    return next
  }
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now(), accumulator = 0
    const loop = (now: number) => {
      accumulator += Math.min((now - last) / 1000, 0.1)
      last = now
      let result: Snapshot | undefined
      while (accumulator + 1e-10 >= 1 / settings.fps) {
        result = advance()
        accumulator -= 1 / settings.fps
      }
      if (result) setSnapshot(result)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, settings])
  useEffect(() => {
    const pauseHidden = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', pauseHidden)
    return () => document.removeEventListener('visibilitychange', pauseHidden)
  }, [])

  const info = CHAPTERS[chapter]
  return <main>
    <header className="page-header">
      <a className="wordmark" href="#intro">YEQUDESU <span> / 算法说明</span></a>
      <div className="header-actions"><button onClick={() => setDark(!dark)}>{dark ? '切换为浅色' : '切换为深色'}</button><a href="./pbd-layout-formal.md">完整形式化文档 ↗</a></div>
    </header>
    <section className="intro" id="intro">
      <p className="eyebrow">SCREEN-SPACE LABEL LAYOUT</p>
      <h1>标签如何找到自己的位置<span>理解当前的 PBD 融合算法</span></h1>
      <p>一个背向恒星的目标，几种彼此竞争的约束。调整参数，看三枚标签如何跟随、避让，以及何时无法兼顾。</p>
      <p className="scope">当前实现：速度前馈 + 比例反馈 + 力驱动排斥 + 位置投影。演示直接调用项目求解器；所有预设都是可重复的二维实验输入。</p>
    </section>

    <div className="lab-layout">
      <section className="visual-panel" aria-label="交互实验">
        <div className="transport">
          <div className="buttons">
            <button className="primary" onClick={() => { setPlaying(!playing); setAnnouncement(playing ? '实验已暂停。' : '实验开始播放。') }}>{playing ? '暂停' : '播放'}</button>
            <button onClick={() => { setPlaying(false); const next = advance(); setSnapshot(next); setAnnouncement(`已推进一帧，时间 ${next.time.toFixed(3)} 秒。`) }}>单帧推进</button>
            <button onClick={() => reset()}>复位</button>
          </div>
          <output aria-live="off" className="clock" aria-label="模拟时间">{snapshot.time.toFixed(2)} s <span> / 第 {snapshot.frame} 帧</span></output>
        </div>
        <Diagram snapshot={snapshot} settings={settings} chapter={info.id} ranges={ranges} targets={targets} trails={trails} history={history.current} />
        <div className="legend"><span className="series-0">● FS</span><span className="series-1">● Code</span><span className="series-2">● GitHub</span><span>实框：算法位置</span><span>虚框 / 十字：目标</span><span>红块：重叠</span></div>
        <p className="scene-note">{SCENARIOS[settings.scenario].note}</p>
        <div className="metrics">
          <div><span>最大两标签重叠面积</span><output aria-live="off" className={snapshot.metrics.overlap > 0 ? 'warning' : ''}>{fixed(snapshot.metrics.overlap)} <small>px²</small></output></div>
          <div><span>矩形到恒星圆的最小净距</span><output aria-live="off" className={snapshot.metrics.starGap < 0 ? 'warning' : ''}>{fixed(snapshot.metrics.starGap)} <small>px</small></output></div>
          <div><span>最大锚点越界量</span><output aria-live="off" className={snapshot.metrics.anchorExcess > 0 ? 'warning' : ''}>{fixed(snapshot.metrics.anchorExcess)} <small>px</small></output></div>
        </div>
        <p className="fine-print">净距 &lt; 0 表示矩形侵入恒星圆。数值以 1280 × 720 模拟视口计算；局部场景仅放大显示。指标是独立几何诊断，不代表求解器已保证对应约束。</p>
      </section>

      <aside className="controls" aria-label="实验参数">
        <h2>改变条件，观察结果</h2>
        <label>实验场景<select value={settings.scenario} onChange={e => {
          const scenario = e.target.value as Scenario
          reset({ ...DEFAULTS, scenario, fitted: scenario === 'orbit', expanded: scenario === 'expanded' ? 0 : -1 })
          setRanges(scenario === 'expanded'); setPlaying(false)
        }}>{Object.entries(SCENARIOS).map(([value, scene]) => <option key={value} value={value}>{scene.name}</option>)}</select></label>
        <label>求解帧率<select value={settings.fps} onChange={e => change({ fps: +e.target.value })}>{[30,60,120].map(fps => <option key={fps} value={fps}>{fps} fps · Δt = {(1000/fps).toFixed(2)} ms</option>)}</select></label>
        {([
          ['gap', '目标偏移 g', 0, 50, 'px'], ['range', '锚点范围 R', 30, 180, 'px'], ['spread', '方向偏转 θ', 0, 30, '°'],
        ] as const).map(([key, title, min, max, unit]) => <label className="slider" key={key}><span>{title}<output>{settings[key]} {unit}</output></span><input type="range" min={min} max={max} step="1" value={settings[key]} aria-label={title} onChange={e => change({ [key]: +e.target.value })} /></label>)}
        <label>展开标签<select value={settings.expanded} onChange={e => change({ expanded: +e.target.value })}><option value="-1">全部折叠</option>{NAMES.map((name, i) => <option key={i} value={i} disabled={!snapshot.planets[i].visible}>{name} · 200 × 44px</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={settings.fitted} onChange={e => change({ fitted: e.target.checked })} />使用收缩宽度 30 / 41 / 53px</label>
        <p className="fine-print">关闭后均宽 60px，折叠算法高度为 36px。收缩宽度是样例值，主页由 DOM 测量决定。修改参数会从 0 秒重新实验。</p>
        <fieldset><legend>辅助图层</legend>
          <label className="check"><input type="checkbox" checked={targets} onChange={e => setTargets(e.target.checked)} />目标框与方向</label>
          <label className="check"><input type="checkbox" checked={ranges} onChange={e => setRanges(e.target.checked)} />锚点范围 R</label>
          <label className="check"><input type="checkbox" checked={trails} onChange={e => setTrails(e.target.checked)} />最近 180 帧的中心轨迹</label>
        </fieldset>
        <button className="compare-button" onClick={() => {
          setPlaying(false)
          const rows = compareRates(settings)
          history.current = [[], [], []]
          setSnapshot(engine.current.reset(settings)); setComparison(rows)
          setAnnouncement('帧率对比完成。三组均运行 10 秒模拟时间，交互实验已复位并暂停。')
        }}>比较 30 / 60 / 120 fps</button>
        <p className="fine-print">每组从相同初态运行 10 秒模拟时间，比较终态。它不是设备性能测试。</p>
      </aside>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

    {comparison && <section className="comparison" aria-label="帧率对比结果"><h2>相同输入，10 秒后的结果</h2><div className="table-wrap"><table><thead><tr><th>求解帧率</th><th>最大重叠 / px²</th><th>恒星净距 / px</th><th>锚点越界 / px</th></tr></thead><tbody>{comparison.map(row => <tr key={row.fps}><th>{row.fps} fps</th><td>{fixed(row.overlap)}</td><td>{fixed(row.starGap)}</td><td>{fixed(row.anchorExcess)}</td></tr>)}</tbody></table></div><p className="fine-print">比较沿用刚才的场景、尺寸和参数；改变参数后清除旧结果。轨道预设按相同模拟时刻采样，静态预设的行星位置始终不变。</p></section>}

    <section className="explanation" aria-label="分阶段公式">
      <div className="section-heading"><div><p className="eyebrow">FOLLOW THE EQUATIONS</p><h2>从目标到下一帧</h2></div><p>选择阶段阅读公式；所有约束始终参与求解。</p></div>
      <nav className="chapters" aria-label="公式阶段">{CHAPTERS.map((item, i) => <button key={item.id} aria-pressed={chapter === i} onClick={() => setChapter(i)}>{item.title}</button>)}</nav>
      <article className="formula-panel"><p className="eyebrow">{info.tag}</p><h3>{info.title}</h3><div className="equations">{info.equations.map(equation => <div key={equation} className="equation">{equation}</div>)}</div><p>{info.text}</p><p className="caveat"><strong>读懂当前实现：</strong>{info.caveat}</p></article>
    </section>

    <section className="reading"><h2>为什么称为“融合”</h2><p>标准 PBD 在预测位置上迭代投影，再根据修正位置重建速度。这里先积分位置，再由 A/A2/E 叠加速度，由 B/C/D 投影位置，最后只输出。这使它保留了惯性与排斥感，也保留了约束竞争、帧率依赖和几何近似带来的局限。</p>
      <div className="reading-grid"><div><h3>先体验三件事</h3><ol><li>播放「轨道跟随」，打开目标框与轨迹。</li><li>切到「标签拥挤」，比较三种求解帧率。</li><li>切到「展开约束」，观察 R=70px 时的两个锚点。</li></ol></div><div><h3>当前限制</h3><p>演示使用完整算法矩形，不模拟主页的打字入场、CSS 位移过渡与宽度延迟。场景预设不保证无重叠；负净距和越界量用于暴露现状。</p><p>尚未实现严格矩形避让、帧率无关阻尼、输入时锁定或无解回退。这些是改进方向。</p></div></div>
      <p className="references">继续阅读：<a href="./pbd-layout-formal.md">完整符号、公式与源码对应</a> · <a href="https://matthias-research.github.io/pages/publications/posBasedDyn.pdf" target="_blank" rel="noreferrer">PBD 原始论文</a> · <a href="https://matthias-research.github.io/pages/publications/XPBD.pdf" target="_blank" rel="noreferrer">XPBD 的时间步与刚度讨论</a></p>
    </section>
    <footer>YeQuDesu / 当前实现说明 · 求解器：src/behaviors/usePBDLayout.ts · 参数以源码为准</footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
