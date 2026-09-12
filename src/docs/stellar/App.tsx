import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PROMINENCE_MORPHOLOGIES, type ProminenceMorphology } from '../../behaviors/stellarMorphology'
import Preview, { type Playback } from './Preview'
import { createOverview, DESCRIPTIONS, MAX_AGE, morphologyLabel, parseSeed, PREVIEW_AGE, readSelection, SEED_PRESETS, selectionSearch } from './model'

export default function App() {
  const [selection, setSelection] = useState(() => readSelection(window.location.search))
  const { kind, seed } = selection
  const [seedInput, setSeedInput] = useState(String(seed)), [error, setError] = useState('')
  const [playback, setPlayback] = useState<Playback>({ playing: false, seek: PREVIEW_AGE })
  const [age, setAge] = useState(PREVIEW_AGE)
  const [view, setView] = useState<'front' | 'oblique'>('front'), [viewRevision, setViewRevision] = useState(0)
  const [markers, setMarkers] = useState(true), [announcement, setAnnouncement] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const overviews = useMemo(() => PROMINENCE_MORPHOLOGIES.map(item => ({ ...item, ...createOverview(seed, item.kind) })), [seed])
  const current = overviews.find(item => item.kind === kind)!
  const description = DESCRIPTIONS[kind]
  const index = PROMINENCE_MORPHOLOGIES.findIndex(item => item.kind === kind)
  const onTime = useCallback((value: number) => setAge(value), [])
  const onEnd = useCallback(() => setPlayback({ playing: false, seek: null }), [])

  useEffect(() => { window.history.replaceState(null, '', `${window.location.pathname}${selectionSearch(kind, seed)}${window.location.hash}`) }, [kind, seed])
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
  const changeView = (value: 'front' | 'oblique') => { setView(value); setViewRevision(revision => revision + 1) }
  const copyLink = async () => {
    const url = new URL(window.location.href)
    url.search = selectionSearch(kind, seed); url.hash = ''
    try { await navigator.clipboard.writeText(url.href); setAnnouncement('已复制当前类型与种子的链接；打开后从 4 秒、正视图复现。') }
    catch { setAnnouncement('无法访问剪贴板。地址栏已包含当前类型和种子，可直接复制。') }
  }

  return <main className="stellar-doc">
    <header className="doc-header">
      <a className="wordmark" href="#intro">YEQUDESU <span> / 场景说明</span></a>
      <nav aria-label="说明页导航"><a href="#atlas">六类图鉴</a><a href="./cme-dissolution-explainer.html">CME 逸散实验 ↗</a><a href="../stellar-plasma-model.md">模型原理 ↗</a><a href="./pbd-layout-explainer.html">PBD 说明 ↗</a></nav>
    </header>
    <section className="intro" id="intro">
      <p className="eyebrow">STELLAR MORPHOLOGY · ACT 04</p>
      <h1>磁拱环，如何长出不同的形状。</h1>
      <p>选择一种结构，改变一颗种子。观察拱顶、足点和相邻环系如何重新组合。</p>
      <div className="intro-note"><span className="live-dot" />预览复用 Act 4 的生成模型与发光材质<span className="note-separator">/</span><span className="note-detail">相同类型与种子，可以复现相同结构</span></div>
    </section>

    <section className="experiment" aria-label="磁拱环种子实验">
      <div className="type-picker" aria-label="选择磁拱环类型">{PROMINENCE_MORPHOLOGIES.map((item, i) => <button key={item.kind} aria-pressed={kind === item.kind} onClick={() => selectKind(item.kind)}><span>0{i + 1}</span>{item.label}</button>)}</div>
      <div className="experiment-grid">
        <div className="visual-column">
          <div className="preview" ref={previewRef}>
            <div className="preview-label"><span>0{index + 1} / {kind.toUpperCase()}</span><strong>{current.label}</strong></div>
            <div className="view-picker" aria-label="预览视角"><button aria-pressed={view === 'front'} onClick={() => changeView('front')}>正视 / 复位</button><button aria-pressed={view === 'oblique'} onClick={() => changeView('oblique')}>斜视</button></div>
            <Preview kind={kind} seed={seed} playback={playback} view={view} viewRevision={viewRevision} markers={markers} feet={current.feet} onTime={onTime} onEnd={onEnd} />
            <div className="preview-hint">拖动旋转 · 滚轮缩放<span>日面局部切平面</span></div>
          </div>
          <div className="transport">
            <button className="play-button" onClick={() => setPlayback({ playing: !playback.playing, seek: age >= MAX_AGE && !playback.playing ? 0 : null })}>{playback.playing ? '暂停' : '播放'}</button>
            <button className="quiet-button" onClick={() => { setAge(0); setPlayback({ playing: false, seek: 0 }) }}>回到初态</button>
            <label className="time-control"><span className="sr-only">模拟时间</span><input aria-label="模拟时间" type="range" min="0" max={MAX_AGE} step="0.1" value={age} onChange={event => { const value = Number(event.target.value); setAge(value); setPlayback({ playing: false, seek: value }) }} /><output aria-live="off">{age.toFixed(1)} <small>/ {MAX_AGE} s</small></output></label>
          </div>
          <div className="legend"><span className="legend-gold">— 发光环系</span><span>· 沿场运动的物质团块</span><label><input type="checkbox" checked={markers} onChange={event => setMarkers(event.target.checked)} />标出足点</label></div>
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
            {error ? <p id="seed-error" className="error" role="alert">{error}</p> : <p id="seed-help" className="small-note">范围 [0, 1)。类型保持不变，生成后暂停在第 4 秒。</p>}
            <div className="seed-presets"><span>试一试</span>{SEED_PRESETS.map(value => <button key={value} type="button" aria-pressed={seed === value} onClick={() => generate(value)}>{value}</button>)}<button type="button" className="random-button" onClick={() => generate(Math.floor(Math.random() * 1000000) / 1000000)}>换个种子 ↻</button></div>
          </form>
          <div className="seed-changes"><span>种子会改变</span><p>{description.changes}</p></div>
          <div className="generated-summary"><span>本次生成 <strong>{current.structure.families.length}</strong> 个环系</span><button onClick={copyLink}>复制此结果的链接 ↗</button></div>
        </aside>
      </div>
      <p className="experiment-status" role="status">{announcement || `当前种子 ${seed} · 可先尝试预设，再输入自己的种子。`}</p>
    </section>

    <section className="atlas" id="atlas" aria-labelledby="atlas-title">
      <div className="section-heading"><div><p className="eyebrow">SIX STRUCTURES, ONE SEED</p><h2 id="atlas-title">用同一个种子，比较六类结构。</h2></div><span className="seed-badge">SEED {seed}</span></div>
      <p className="section-intro">下方是各类型在同一种子下的初始结构正投影。点击卡片，在上方查看它的三维形态与运动。</p>
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
        <article><span className="step-number">02</span><h3>种子生成本次参数</h3><p>种子与类型共同决定环系数量、宽高、足点位置、朝向及拱顶。不是给同一个模板只加一点随机抖动。</p></article>
        <article><span className="step-number">03</span><h3>时间继续改变形态</h3><p>播放时，局部负载与张力近似驱动轴的形变，团块沿场运动。因此复现某一帧，还需要相同的模拟时间和视角。</p></article>
      </div>
      <div className="model-note"><div><h3>为什么不会再反复出现“一大两小”？</h3><p>Act 4 按卡片中的基准权重抽选类型，先排除本通道上次主类型与另一通道的主类型，再对剩余权重归一化。“双侧伴随”的基准权重是 8，不代表去重后长期恰好出现 8%。嵌套拱廊和低矮环簇还会绑定另一种类型；去重针对主类型，伴随类型可重复。本页允许手动选中每一种主类型。</p></div><div><h3>这些图表示什么？</h3><p>曲线表示沿磁场发光的等离子体环系；多个细丝可以属于同一个环系。这六类是项目的构图分类，权重并非太阳观测统计。演示采用实时降阶模型，未求解完整三维 MHD。</p><a href="../stellar-plasma-model.md">查看公式、物理依据与近似边界 ↗</a></div></div>
      <details className="parameters"><summary>查看当前种子的环系参数 <span>{current.label} / {seed}</span></summary><p>跨度与高度为局部相对尺度；高度列是构型尺度参数，实际拱顶还受凹陷、偏斜和动态形变影响。</p><div className="table-scroll"><table><thead><tr><th>环系</th><th>组成</th><th>跨度</th><th>高度尺度</th><th>足点区中心 X</th><th>朝向</th><th>流线</th></tr></thead><tbody>{current.structure.families.map((family, i) => <tr key={i}><td>0{i + 1}</td><td>{morphologyLabel(family.sourceKind)}</td><td>{(family.width * 2).toFixed(2)}</td><td>{family.height.toFixed(2)}</td><td>{family.offsetX.toFixed(2)}</td><td>{(family.yaw * 180 / Math.PI).toFixed(1)}°</td><td>{family.strands}</td></tr>)}</tbody></table></div><p>每个活动区共用 12 条代表性流线，按各环系的大小分配。</p></details>
    </section>
    <footer className="doc-footer"><span>YEQUDESU · 磁拱环结构图鉴</span><span>实时 3D 预览 / SVG 结构对照 / 可复现种子</span></footer>
  </main>
}
