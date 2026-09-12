import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PROMINENCE_MORPHOLOGIES, type ProminenceMorphology } from '../../behaviors/stellarMorphology'
import Preview, { type Playback } from './Preview'
import Lifecycle from './Lifecycle'
import { createOverview, DESCRIPTIONS, MAX_AGE, morphologyLabel, parseSeed, PREVIEW_AGE, readSelection, readPreviewAge, SEED_PRESETS, selectionSearch } from './model'

export default function App() {
  const [selection, setSelection] = useState(() => readSelection(window.location.search))
  const { kind, seed } = selection
  const [seedInput, setSeedInput] = useState(String(seed)), [error, setError] = useState('')
  const [playback, setPlayback] = useState<Playback>(() => ({ playing: false, seek: readPreviewAge(window.location.search) }))
  const [age, setAge] = useState(() => readPreviewAge(window.location.search))
  const [speed, setSpeed] = useState(1)
  const [view, setView] = useState<'front' | 'oblique'>('front'), [viewRevision, setViewRevision] = useState(0)
  const [redraw, setRedraw] = useState(false)
  const [markers, setMarkers] = useState(true), [announcement, setAnnouncement] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const overviews = useMemo(() => PROMINENCE_MORPHOLOGIES.map(item => ({ ...item, ...createOverview(seed, item.kind) })), [seed])
  const current = overviews.find(item => item.kind === kind)!
  const description = DESCRIPTIONS[kind]
  const index = PROMINENCE_MORPHOLOGIES.findIndex(item => item.kind === kind)
  const onTime = useCallback((value: number) => setAge(value), [])
  const onEnd = useCallback(() => setPlayback({ playing: false, seek: null }), [])

  useEffect(() => { if (!playback.playing) window.history.replaceState(null, '', `${window.location.pathname}${selectionSearch(kind, seed, age)}${window.location.hash}`) }, [kind, seed, age, playback.playing])
  useEffect(() => {
    const stop = () => { if (document.hidden) onEnd() }
    document.addEventListener('visibilitychange', stop)
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) onEnd() })
    if (previewRef.current) observer.observe(previewRef.current)
    return () => { document.removeEventListener('visibilitychange', stop); observer.disconnect() }
  }, [onEnd])

  const generate = (nextSeed: number, nextKind = kind) => {
    setSelection({ seed: nextSeed, kind: nextKind }); setSeedInput(String(nextSeed)); setError('')
    setAge(PREVIEW_AGE); setPlayback({ playing: false, seek: PREVIEW_AGE })
    setAnnouncement(`已生成${PROMINENCE_MORPHOLOGIES.find(item => item.kind === nextKind)!.label}，种子 ${nextSeed}。`)
  }
  const selectKind = (value: ProminenceMorphology) => generate(seed, value)
  const seek = (value: number) => { setAge(value); setPlayback({ playing: false, seek: value }) }
  const changeView = (value: 'front' | 'oblique') => { setView(value); setViewRevision(revision => revision + 1) }
  const copyLink = async () => {
    const url = new URL(window.location.href)
    url.search = selectionSearch(kind, seed, age); url.hash = ''
    try { await navigator.clipboard.writeText(url.href); setAnnouncement(`已复制当前类型、种子和时间；打开后从 ${age.toFixed(2)} 秒、正视图复现。`) }
    catch { setAnnouncement('无法访问剪贴板。地址栏已包含当前类型和种子，可直接复制。') }
  }

  return <main className="stellar-doc">
    <header className="doc-header">
      <a className="wordmark" href="#intro">YEQUDESU <span> / 场景说明</span></a>
      <nav aria-label="说明页导航"><a href="#lifecycle">生长与回缩</a><a href="#atlas">六类图鉴</a><a href="./cme-dissolution-explainer.html">CME 逸散实验 ↗</a><a href="../stellar-plasma-model.md">模型原理 ↗</a></nav>
    </header>
    <section className="intro" id="intro">
      <p className="eyebrow">STELLAR MORPHOLOGY · ACT 04</p>
      <h1>磁拱环，如何长出不同的形状。</h1>
      <p>磁通区域留在原处，环系错峰生长，丝线沿自身方向绘制，生长向外换代、消退向内换代。拖动时间，观察主环如何将发光结构快速交接给短环。</p>
      <div className="intro-note"><span className="live-dot" />预览复用 Act 4 的生成模型与发光材质<span className="note-separator">/</span><span className="note-detail">相同类型与种子，可以复现相同结构</span></div>
    </section>

    <section className="experiment" aria-label="磁拱环种子实验">
      <div className="type-picker" aria-label="选择磁拱环类型">{PROMINENCE_MORPHOLOGIES.map((item, i) => <button key={item.kind} aria-pressed={kind === item.kind} onClick={() => selectKind(item.kind)}><span>0{i + 1}</span>{item.label}</button>)}</div>
      <div className="experiment-grid">
        <div className="visual-column">
          <div className="preview" ref={previewRef}>
            <div className="preview-label"><span>0{index + 1} / {kind.toUpperCase()}</span><strong>{current.label}</strong></div>
            <div className="view-picker" aria-label="预览视角"><button aria-pressed={view === 'front'} onClick={() => changeView('front')}>正视 / 复位</button><button aria-pressed={view === 'oblique'} onClick={() => changeView('oblique')}>斜视</button></div>
            <Preview kind={kind} seed={seed} playback={playback} speed={speed} view={view} viewRevision={viewRevision} markers={markers} redraw={redraw} feet={current.feet} onTime={onTime} onEnd={onEnd} />
            <div className="preview-hint">拖动旋转 · 滚轮缩放<span>日面局部切平面</span></div>
          </div>
          <div className="transport">
            <button className="play-button" onClick={() => setPlayback({ playing: !playback.playing, seek: age >= MAX_AGE && !playback.playing ? 0 : null })}>{playback.playing ? '暂停' : '播放'}</button>
            <button className="quiet-button" onClick={() => seek(0)}>回到初态</button>
            <label className="time-control"><span className="sr-only">模拟时间</span><input aria-label="模拟时间" type="range" min="0" max={MAX_AGE} step="0.02" value={age} onChange={event => { const value = Number(event.target.value); setAge(value); setPlayback({ playing: false, seek: value }) }} /><output aria-live="off">{age.toFixed(2)} <small>/ {MAX_AGE} s</small></output></label>
          </div>
          <div className="legend"><span className="legend-gold">— 发光环系</span><label>速度 <select aria-label="播放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.35">0.35×</option><option value="1">1×</option><option value="2">2×</option></select></label><label><input type="checkbox" checked={markers} onChange={event => setMarkers(event.target.checked)} />磁通区域</label><label><input type="checkbox" checked={redraw} onChange={event => setRedraw(event.target.checked)} />显示丝线层次</label></div>
          <Lifecycle plans={current.evolution} age={age} seek={seek} />
        </div>

        <aside className="explanation" aria-label="所选结构说明与种子设置">
          <p className="section-kicker">这类结构的特征</p>
          <h2>{current.label}<span>{description.count}</span></h2>
          <p className="lead">{description.summary}</p>
          {current.structure.companion && <p className="composition">本次组合：{current.label} ＋ {morphologyLabel(current.structure.companion)}</p>}
          <p>{description.relation}</p>
          <div className="watch-note"><span>观察提示</span><p>{description.watch}</p></div>
          <form className="seed-form" onSubmit={event => { event.preventDefault(); const value = parseSeed(seedInput); if (value === null) setError('请输入 0 ≤ seed < 1 的小数，例如 0.47。'); else generate(value) }}>
            <label htmlFor="seed-input">种子 <span>SEED</span></label>
            <div className="seed-entry"><input id="seed-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={seedInput} aria-invalid={Boolean(error)} aria-describedby={error ? 'seed-error' : 'seed-help'} onChange={event => { setSeedInput(event.target.value); setError('') }} /><button type="submit" className="primary-button">生成</button></div>
            {error ? <p id="seed-error" className="error" role="alert">{error}</p> : <p id="seed-help" className="small-note">范围 [0, 1)。生成后暂停在第 8 秒；点“初生”可从头观察。</p>}
            <div className="seed-presets"><span>试一试</span>{SEED_PRESETS.map(value => <button key={value} type="button" aria-pressed={seed === value} onClick={() => generate(value)}>{value}</button>)}<button type="button" className="random-button" onClick={() => generate(Math.floor(Math.random() * 1000000) / 1000000)}>换个种子 ↻</button></div>
          </form>
          <div className="seed-changes"><span>种子会改变</span><p>{description.changes}</p></div>
          <div className="generated-summary"><span>本次生成 <strong>{current.structure.families.length}</strong> 个环系</span><button onClick={copyLink}>复制此结果的链接 ↗</button></div>
        </aside>
      </div>
      <p className="experiment-status" role="status">{announcement || `当前种子 ${seed} · 可先尝试预设，再输入自己的种子。`}</p>
    </section>

    <section className="reading" id="lifecycle" aria-labelledby="lifecycle-title">
      <div className="section-heading"><div><p className="eyebrow">GROWTH, MEMORY, RELAXATION</p><h2 id="lifecycle-title">生长留下形态，回缩释放形变。</h2></div></div>
      <div className="reading-grid">
        <article><span className="step-number">01 / 形成</span><h3>固定磁通区域，错峰抬升</h3><p>各环系拥有自己的出生、成形与松弛时刻。丝线按内到外的次序生成，每条沿自己的方向逐渐绘出；达到上限后，内层退出，新的外层补入，反复更新直到稳定。同一活动区共享背景，但局部驱动并不同步。低簇与嵌套在生成时伴随其他类型，各环系独立演化。</p></article>
        <article><span className="step-number">02 / 定形</span><h3>轮廓在生长过程中确定</h3><p>参考拱顶从中性形状出发，积累外部应力与局部热负载的影响。形成驱动衰减后，保留已经形成的轮廓与完整的丝线，细丝仍有轻微动态。</p></article>
        <article><span className="step-number">03 / 消退</span><h3>有时回缩，有时局部换接</h3><p>普通环系用 12–15.6 秒松弛与回缩：外层旧丝线逐渐擦除，新的内层丝线持续补入，末段才停止补入。部分大环在末段先让短环预生长至局部交接高度，两侧短环承接外肩、中央过渡环承接拱顶；旧长连接在 0.65 秒内沿线退出。中央环交错保留约一半丝线，每隔 0.12 秒启动其中一条的回落与沿线擦除，三支受共享空间分隔约束；两侧短环强烈振荡并短暂上抬，随后整束快速回落；丝线按每条间隔 0.18 秒由外向内擦除，几何回落不再逐条错峰。其他独立环系继续演化。</p></article>
      </div>
      <div className="model-note"><div><h3>收缩不一定温和</h3><p>磁能释放后，日冕环可以同时收缩和振荡。本轮让两侧短环在更强的振荡中短暂上抬，再快速整体回落；偏离平衡形态越远，起伏越强，中央保持较弱响应。这是一种展示取向，并非所有真实事件的规律。中央过渡环是短暂显亮的背景连接，不表示重联必然生成三个短环。发光结构的变暗也不等于磁场消失，足点固定仅作为短时近似。</p><a href="https://arxiv.org/abs/1506.07716" target="_blank" rel="noreferrer">日冕环收缩与振荡研究 ↗</a></div><div><h3>CME 的上下两支分别处理</h3><p>CME 形成后，上方闭环继续向外喷出、粒子化与扩散。下方连接日面的残留拱廊在重联后松弛回缩；不把已经喷出的物质收回日面。</p><a href="./cme-dissolution-explainer.html?seed=0.47&t=9">观察 CME 重联后的回缩 ↗</a></div></div>
      <div className="model-note"><div><h3>固定区域，允许连接改变</h3><p>根部附近的小尺度混合极性磁通，为局部重联提供了一种可能的环境。图中的区域位置作为短时近似固定，连接关系可以变化；同一条示踪线不必永远连接同一对端点。</p><a href="https://arxiv.org/abs/1610.07484" target="_blank" rel="noreferrer">混合极性与日冕环根部环境 ↗</a></div><div><h3>自然消退也可能伴随重联</h3><p>非 CME 不等于没有磁重联。观测支持局部重联形成新环，但不支持“所有大环都必然碎成小环”。本实验保留概率触发与直接回缩两条路径，概率为展示设定。丝线换代描述发光结构的更新，不代表磁场线逐条断灭，也不是逐粒子追踪完整的重联过程。</p><a href="https://arxiv.org/abs/2105.03199" target="_blank" rel="noreferrer">局部重联形成日冕环的观测 ↗</a></div></div>
      <p className="section-intro">上方 SVG 与三维模型共用演化方案；本页展示 {MAX_AGE} 秒完整事件，主页普通事件为 30–38 秒。普通环系慢消退，CME 下方拱廊主要回缩约 4.4 秒；这组时间并非真实事件的统一比例。<a href="../stellar-plasma-model.md#固定磁通区域与局部连接重组">查看 LaTeX 公式与实现边界 ↗</a></p>
    </section>

    <section className="atlas" id="atlas" aria-labelledby="atlas-title">
      <div className="section-heading"><div><p className="eyebrow">SIX STRUCTURES, ONE SEED</p><h2 id="atlas-title">用同一个种子，比较六类结构。</h2></div><span className="seed-badge">SEED {seed}</span></div>
      <p className="section-intro">下方是各类型在同一种子下、第 8 秒的结构正投影。点击卡片，在上方查看完整生长与回缩。</p>
      <div className="atlas-grid">{overviews.map((item, i) => <button key={item.kind} className={`atlas-card ${kind === item.kind ? 'selected' : ''}`} aria-pressed={kind === item.kind} aria-label={`查看${item.label}的三维预览`} onClick={() => { selectKind(item.kind); previewRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }) }}>
        <span className="card-top"><span>0{i + 1}</span><span>{item.structure.families.length} 个环系 · 权重 {item.weight}</span></span>
        <svg viewBox="0 0 320 160" aria-hidden="true"><path className="svg-surface" d="M12 146H308" />{item.paths.map((path, j) => <path key={j} d={path} fill="none" className="svg-strand" style={{ opacity: 0.36 + (j % 4) * 0.14 }} />)}</svg>
        <span className="card-title">{item.label}<span>↗</span></span><span className="card-description">{item.structure.companion ? `本次伴随：${morphologyLabel(item.structure.companion)}。` : ''}{DESCRIPTIONS[item.kind].summary}</span>
      </button>)}</div>
    </section>

    <section className="reading" aria-labelledby="rules-title">
      <div className="section-heading"><div><p className="eyebrow">READ THE GENERATOR</p><h2 id="rules-title">类型决定关系，种子决定细节。</h2></div></div>
      <div className="reading-grid">
        <article><span className="step-number">01</span><h3>类型保留空间关系</h3><p>孤立、伴随、交错、嵌套或成簇，决定环系之间怎样排列。更换种子不会把当前选中的类型换成另一类。</p></article>
        <article><span className="step-number">02</span><h3>种子决定环境与驱动</h3><p>种子与类型共同决定环系数量、尺度、足点位置、朝向和时变应力。拱顶细节由驱动历史和沿场负载在生长中逐渐形成。</p></article>
        <article><span className="step-number">03</span><h3>时间继续改变形态</h3><p>播放时，局部负载与张力近似驱动轴的形变，团块沿场运动。因此复现某一帧，还需要相同的模拟时间和视角。</p></article>
      </div>
      <div className="model-note"><div><h3>为什么不会再反复出现“一大两小”？</h3><p>Act 4 按卡片中的基准权重抽选类型，先排除本通道上次主类型与另一通道的主类型，再对剩余权重归一化。“双侧伴随”的基准权重是 8，不代表去重后长期恰好出现 8%。嵌套拱廊和低矮环簇还会绑定另一种类型；去重针对主类型，伴随类型可重复。本页允许手动选中每一种主类型。</p></div><div><h3>这些图表示什么？</h3><p>曲线表示沿磁场发光的等离子体环系；多个细丝可以属于同一个环系。这六类是项目的构图分类，权重并非太阳观测统计。演示采用实时降阶模型，未求解完整三维 MHD。</p><a href="../stellar-plasma-model.md">查看公式、物理依据与近似边界 ↗</a></div></div>
      <details className="parameters"><summary>查看当前种子的环系参数 <span>{current.label} / {seed}</span></summary><p>跨度与高度为局部相对尺度；高度列是构型尺度参数，实际拱顶还受凹陷、偏斜和动态形变影响。</p><div className="table-scroll"><table><thead><tr><th>环系</th><th>组成</th><th>跨度</th><th>高度尺度</th><th>足点区中心 X</th><th>朝向</th><th>流线</th></tr></thead><tbody>{current.structure.families.map((family, i) => <tr key={i}><td>0{i + 1}</td><td>{morphologyLabel(family.sourceKind)}</td><td>{(family.width * 2).toFixed(2)}</td><td>{family.height.toFixed(2)}</td><td>{family.offsetX.toFixed(2)}</td><td>{(family.yaw * 180 / Math.PI).toFixed(1)}°</td><td>{family.strands}</td></tr>)}</tbody></table></div><p>每个活动区共用 12 条代表性流线，按各环系的大小分配。</p></details>
    </section>
    <footer className="doc-footer"><span>YEQUDESU · 磁拱环结构图鉴</span><span>实时 3D 预览 / SVG 结构对照 / 可复现种子</span></footer>
  </main>
}
