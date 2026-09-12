import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Preview from './Preview'
import { cmeRotationPlan } from '../../behaviors/cmeRotation'
import { CME_END, cmeStage, cmeTiming, readCmeSelection } from './model'
import { parseSeed } from '../stellar/model'
import { CME_DISSOLUTION, CME_DISTRIBUTION } from '../../behaviors/stellarEjection'
import { CME_DISSIPATION, CME_TAIL, STELLAR_RADIATION_DISTRIBUTION } from '../../behaviors/stellarParticleDensity'

const stages = [
  { title: '收颈与闭合', offset: -0.15, text: '磁通绳两腿靠近，上方拱体逐渐旋扭；旋扭幅度与方向由种子决定，随后连接关系改变。下方回缩为足点拱廊，上方形成局部闭环。' },
  { title: '细丝变为颗粒', offset: 0.40, text: '从实际闭环上生成金色亮点，细丝逐段淡出。颗粒短暂描摹原轮廓，转化沿环传播。' },
  { title: '迅速稀释，融入背景', offset: 1.50, text: '多数颗粒在释放后约 0.7 秒内错峰淡出，留下数量为原稀释方案两倍的分散光点。薄雾继续随共同外流展开。' },
  { title: '薄雾扩散与消退', offset: 3.35, text: '淡金色薄雾沿外流方向铺开并逐渐变薄。稀释后的光点转入 300 秒缓慢扩散；下方拱廊保持锚定，快速回缩后淡出。' },
]
export default function App() {
  const [initial] = useState(() => readCmeSelection(location.search))
  const [seed, setSeed] = useState(initial.seed), [seedText, setSeedText] = useState(String(initial.seed))
  const [rotation, setRotation] = useState(() => new URLSearchParams(location.search).get('rotation') !== '0')
  const rotationPlan = useMemo(() => cmeRotationPlan(seed), [seed])
  const [age, setAge] = useState(initial.age)
  const [playback, setPlayback] = useState({ playing: false, seek: initial.age as number | null })
  const [artistic, setArtistic] = useState(true), [mist, setMist] = useState(1), [speed, setSpeed] = useState(0.35)
  const [view, setView] = useState<'wide' | 'close' | 'oblique' | 'drift'>(() => initial.age > CME_TAIL.eventEnd ? 'drift' : cmeStage(initial.age - cmeTiming(initial.seed).first) >= 2 ? 'wide' : 'close'), [revision, setRevision] = useState(0)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  const preview = useRef<HTMLDivElement>(null)
  const timing = useMemo(() => cmeTiming(seed), [seed])
  const elapsed = age - timing.first, phase = cmeStage(elapsed)
  const longTail = age > CME_TAIL.eventEnd, rangeEnd = longTail ? CME_END : CME_TAIL.eventEnd
  const currentStage = longTail ? { title: '300 秒背景尾迹', text: '薄雾与磁结构已经退场。稀释后的光点继续缓慢扩散，存活 300 秒，最后 60 秒逐渐消退；离开 Act 4 会暂停场景时间。' } : stages[phase]
  useEffect(() => { if (longTail && playback.playing) setView('drift') }, [longTail, playback.playing])
  const stop = useCallback(() => setPlayback({ playing: false, seek: null }), [])
  const report = useCallback((t: number) => setAge(t), [])
  const seek = (t: number) => { const next = Math.max(0, Math.min(CME_END, t)); setAge(next); setPlayback({ playing: false, seek: next }) }
  const generate = (s: number) => { history.replaceState(null, '', `${location.pathname}?seed=${s}&rotation=${rotation ? 1 : 0}`); setSeed(s); setSeedText(String(s)); setError(''); seek(cmeTiming(s).first - 0.3); setView('close'); setRevision(r => r + 1); setMessage(`已生成种子 ${s}，暂停于闭合前。`) }
  useEffect(() => { history.replaceState(null, '', `${location.pathname}?seed=${initial.seed}&t=${initial.age.toFixed(3)}&rotation=${rotation ? 1 : 0}`) }, [initial])
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop() }
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stop() })
    if (preview.current) observer.observe(preview.current)
    document.addEventListener('visibilitychange', hidden)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', hidden) }
  }, [stop])
  const copy = async () => {
    const url = new URL(location.href); url.search = `?seed=${seed}&t=${age.toFixed(3)}&rotation=${rotation ? 1 : 0}`; url.hash = ''
    try { await navigator.clipboard.writeText(url.href); setMessage('已复制种子、时间与旋扭开关，打开后以默认艺术化显示重放。') }
    catch { setMessage(`可复制此地址：${url.href}`) }
  }
  return <main className="stellar-doc cme-doc">
    <header className="doc-header"><a className="wordmark" href="#intro">YEQUDESU <span>/ 视觉实验</span></a><nav aria-label="说明页导航"><a href="./stellar-morphology-explainer.html">磁拱环图鉴 ↗</a><a href="../stellar-plasma-model.md">模型与公式 ↗</a></nav></header>
    <section className="intro" id="intro"><p className="eyebrow">CME · RECONNECTION TO OUTFLOW</p><h1>从磁闭环，到金色流风。</h1><p>在连接改变的瞬间，让细丝化为颗粒，再随稀薄的光雾向外漂移。</p><div className="intro-note"><span className="live-dot" />复用 Act 4 模型与材质<span className="note-separator">/</span><span className="note-detail">艺术化的等离子体发光表现</span></div></section>
    <section className="experiment" aria-label="CME 粒子化实验">
      <div className="cme-toolbar"><div className="modes"><button aria-pressed={artistic} onClick={() => setArtistic(true)}>艺术化逸散</button><button aria-pressed={!artistic} onClick={() => setArtistic(false)}>原始磁结构</button></div><span>同一种子 · 同一时刻 · 切换比较</span></div>
      <div className="experiment-grid"><div className="visual-column">
        <div className="preview" ref={preview}><div className="preview-label"><span>SEED {seed}</span><strong>{artistic ? currentStage.title : '原始闭环与沿场运动'}</strong></div>
          <div className="view-picker">{([['close', '重联特写'], ['wide', '过程全景'], ['oblique', '斜视'], ['drift', '扩散远景']] as const).map(([v, label]) => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); setRevision(r => r + 1) }}>{label}</button>)}</div>
          <Preview seed={seed} playback={playback} speed={speed} artistic={artistic} rotation={rotation} mist={mist} view={view} revision={revision} onTime={report} onEnd={stop} />
          <div className="preview-hint">拖动旋转 · 滚轮缩放<span>局部日面切平面</span></div></div>
        <div className="transport"><button className="play-button" onClick={() => setPlayback({ playing: !playback.playing, seek: age >= CME_END ? 0 : null })}>{playback.playing ? '暂停' : '播放'}</button><button className="quiet-button" onClick={() => seek(0)}>从头观察</button><label className="time-control"><span className="sr-only">事件时间</span><input aria-label="事件时间" type="range" min="0" max={rangeEnd} step="0.01" value={age} onChange={e => seek(Number(e.target.value))} /><output>{age.toFixed(2)} <small>/ {rangeEnd} s</small></output></label></div>
        <div className="tail-transport" aria-label="长寿命尾迹回放"><span>尾迹观察</span>{[30, 120, 240, CME_END].map(t => <button key={t} onClick={() => { seek(t); setView('drift'); setRevision(r => r + 1) }}>{t === CME_END ? '寿命结束' : `${t} s`}</button>)}</div>
        <div className="legend"><span className="legend-gold">— 细丝 / · 金色示踪颗粒</span><label>播放速度 <select aria-label="播放速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.35">0.35× 慢放</option><option value="1">1× 正常</option><option value="10">10× 尾迹快放</option><option value="30">30× 尾迹快放</option></select></label></div>
      </div><aside className="explanation">
        <p className="section-kicker">当前阶段</p><h2>{currentStage.title}</h2><p className="lead">{currentStage.text}</p>
        <p className="composition">首次闭合：{timing.first.toFixed(2)} s · 当前相对时间：{elapsed >= 0 ? '+' : ''}{elapsed.toFixed(2)} s</p>
        <div className="closure-status"><span>已闭合 {timing.times.filter(t => age >= t).length} / 12 条流线</span><div>{timing.times.map((t, i) => <i key={i} className={age >= t ? 'closed' : ''} title={`流线 ${i + 1}：${t.toFixed(3)} s`} />)}</div></div>
        <p>每条流线在自身达到闭合阈值时触发。下方阶段按钮以首次闭合为参考，整束会略微错开。</p>
        <form className="seed-form" onSubmit={e => { e.preventDefault(); const n = parseSeed(seedText); if (n === null) setError('请输入 0 ≤ seed < 1 的小数。'); else generate(n) }}><label htmlFor="seed">事件种子 <span>SEED</span></label><div className="seed-entry"><input id="seed" inputMode="decimal" value={seedText} aria-invalid={Boolean(error)} aria-describedby="seed-help" onChange={e => { setSeedText(e.target.value); setError('') }} /><button className="primary-button">生成</button></div><p id="seed-help" className={error ? 'error' : 'small-note'} role={error ? 'alert' : undefined}>{error || '改变形成驱动、旋扭幅度/方向和闭合时刻。'}</p><div className="seed-presets">{[0.17, 0.47, 0.79, 0.12, 0.051].map(s => <button type="button" key={s} aria-pressed={s === seed} onClick={() => generate(s)}>{s}</button>)}<button type="button" onClick={() => generate(Math.floor(Math.random() * 1000000) / 1000000)}>换个种子 ↻</button></div></form>
        <div className="rotation-control"><label><input type="checkbox" checked={rotation} onChange={e => { stop(); setRotation(e.target.checked) }} /> 拱顶水平旋扭</label><output>{rotation ? `${rotationPlan.handedness > 0 ? '+' : '−'}${rotationPlan.degrees.toFixed(1)}°` : '已关闭 · 对照'}</output><p>主旋扭上限为 75°，闭合后再同向延续 6%–12%。0.12 / 0.051 可对照正反向约 74° 的较强旋扭。收颈处保持稳定，上方逐渐转向；可切换“斜视”观察纵深。</p><button onClick={() => { seek(Math.max(0, timing.rotationStart - 0.15)); setView('oblique'); setRevision(r => r + 1) }}>从旋扭开始观察</button></div>
        <label className="mist-control">薄雾强度 <output>{mist.toFixed(1)}×</output><input aria-label="薄雾强度" type="range" min="0" max="2" step="0.1" value={mist} disabled={!artistic} onChange={e => setMist(Number(e.target.value))} /></label><p>1× 为主页默认值；0× 可单独检查粒子轨迹。外流阶段可切换“过程全景”；30 / 120 / 240 s 按钮可观察长寿命尾迹。</p><button className="copy-cme" onClick={copy}>复制当前实验链接 ↗</button>
      </aside></div><p className="experiment-status" role="status">{message || '点击播放或阶段卡片观察；切换显示模式可比较同一时刻的表现。'}</p>
    </section>
    <section className="reading" aria-labelledby="process"><div className="section-heading"><div><p className="eyebrow">FOLLOW THE TRANSFORMATION</p><h2 id="process">一个结构，四个连续阶段。</h2></div></div><div className="cme-stages">{stages.map((s, i) => <button key={s.title} aria-pressed={!longTail && phase === i} onClick={() => { seek(timing.first + s.offset); setView(i > 1 ? 'wide' : 'close'); setRevision(r => r + 1); preview.current?.scrollIntoView({ block: 'center', behavior: 'auto' }) }}><span className="step-number">0{i + 1} / {(timing.first + s.offset).toFixed(2)} s</span><h3>{s.title}</h3><p>{s.text}</p><span className="stage-action">查看此阶段 ↗</span></button>)}</div></section>
    <p className="section-intro">CME 下方拱廊的主要回缩约 4.4 秒；普通磁拱环以约 14 秒缓慢消退，分别表现快速释放与逐渐减弱。收缩也可能伴随振荡；本轮采用较强阻尼。<a href="./stellar-morphology-explainer.html?type=isolated&amp;seed=0.47&amp;t=29.5">对照普通磁拱环的慢消退 ↗</a></p>
    <section className="reading" aria-labelledby="mechanism"><div className="section-heading"><div><p className="eyebrow">CONTINUITY, NOT A CUT</p><h2 id="mechanism">形状、速度和亮度，怎样交接。</h2></div></div>
      <div className="model-note"><div><h3>两腿靠近，拱顶逐渐旋扭</h3><p>旋转轴沿日面局部向外的法线，拱顶在日面切平面内转向。一侧向前、另一侧向后，旋转从收颈上方平滑增大；足点与收颈处不跟随整体转动。种子决定幅度、手性、启动进度和高度分布，主旋扭分为 15°–40°（50%）、40°–60°（30%）和 60°–75°（20%）；闭合后同向延续主角度的 6%–12%，逐渐停止，不弹回原姿态。</p><p>使用“从旋扭开始观察”，在同一种子与时间下切换旋扭开关，并比较正视和斜视。开关仅对照拱顶空间扭转，保留相同的丝线缠绕手性；切换时暂停并重放到当前时刻。</p></div><div><h3>共享形变，连续交接</h3><p>原连接、上升闭环与残留拱廊经过同一个连续空间变换，因此重联接点保持一致。粒子与薄雾从变形后的路径出生，继承路径速度；前缘也随同形变。没有额外的随机抖动或独立动画时钟。</p><p>真实喷发中的旋转可受外部剪切磁场及扭转张力释放影响，不能归因于两腿靠近的必然结果。本实验将旋转与收颈阶段协调，角度范围和时序是展示参数，没有求解磁螺度守恒或完整 MHD。</p><a href="https://ntrs.nasa.gov/citations/20140006621">磁通绳旋转模拟研究 ↗</a></div></div>
      <div className="model-note"><div><h3>颗粒从闭环上出生</h3><p>沿上升闭合支按实际弧长布点，磁丝之间错位采样；最多 {CME_DISSOLUTION.count / CME_DISSOLUTION.particleStride} 个候选颗粒，底部按高度平滑减少生成。先跟随原路径，在局部释放时继承前后两个固定步之间的运动速度，再逐渐汇入空间连续的外流速度场。雾团跟随同一批运动样本，保留三维前后关系。颗粒沿用磁拱环的暖金色与发光规律；主体降低亮度，少量颗粒保留磁拱环原色作点缀。大小接近日面背景微光，拉近视角时保持细小。</p></div><div><h3>从线条到颗粒，逐段交接</h3><p>转换从收颈附近开始，沿闭环传播。细丝亮度乘以 1−D，颗粒亮度乘以 D。它们短暂重叠，轮廓随后松散。上方前缘同步淡化。连接上下两支的电流片在首次闭合后 0.45 秒内减弱至 2%，收颈闪光快速退去；下方足点拱廊保留。</p></div></div>
      <details className="parameters"><summary>展开实验公式与时间参数</summary><div className="formula-block"><p>令 τ = t − tᵢ 为第 i 条流线闭合后的时间，s ∈ [0,1) 为闭环路径坐标：</p><pre>{`E(x) = 6x⁵ − 15x⁴ + 10x³，x 限制在 [0,1]\nD(τ,s) = E((τ − 0.04 − 0.26 sin²(πs)) / 0.55)\nα丝 = α原 × (1 − D)\nα粒 = α基础 × D × 快速稀释包络 × 生命周期包络\nτ释放(s) = 0.52 + 0.25 sin²(πs)\nv释放 ≈ [P(t) − P(t−Δt)] / Δt\nv下一步 = v + (U(x,t) + B(δ)a − v) [1 − exp(−0.85Δt)]\nx下一步 = x + v下一步 Δt`}</pre><p>Δt = 1/120 s，与原求解器共用固定步。U 是带缓慢卷动的三维外流场；B(δ)a 是释放后短暂、平滑的局部舒展速度。多数颗粒在各自释放后约 0.7 秒内淡出；保留的尾迹从释放开始存活 300 秒，雾延续至闭合后约 5.2 秒。主页磁结构与薄雾仍随事件淡出，尾迹单独续存。本页在事件前 13 秒保持整体透明度为 1，便于观察；此后仅保留长寿命尾迹。</p></div></details>
      <details className="parameters"><summary>底部如何减量，避免颗粒聚成亮串</summary><div className="formula-block"><p>收颈会让多条磁丝靠拢。出生时按实际弧长均匀分层采样，再错开各磁丝的采样相位。以该条闭环的最低点为 0、最高点为 1：</p><pre>{`ℓ(s) = ∫₀ˢ |∂P/∂q| dq；s = ℓ⁻¹(u ℓ(1))
η = (y出生 − y最低) / (y最高 − y最低)
p生成(η) = ${CME_DISTRIBUTION.bottomRetention} + ${1 - CME_DISTRIBUTION.bottomRetention} E(η / ${CME_DISTRIBUTION.bottomHeight})
δ = τ − τ释放；B(δ) = sin²(π clamp(δ / ${CME_DISTRIBUTION.separationDuration}, 0, 1))
|a| ≤ ${CME_DISTRIBUTION.separationSpeed}；a 朝释放时邻域较空的一侧`}</pre><p>最底部生成率为 {CME_DISTRIBUTION.bottomRetention * 100}%，到闭环高度的 {Math.round(CME_DISTRIBUTION.bottomHeight * 100)}% 平滑恢复为 100%。取舍由种子在出生时确定，不随帧闪烁，也不把省下的颗粒补到其他位置。释放瞬间保留原速度，随后在 {CME_DISTRIBUTION.separationDuration} 秒内温和舒展；这属于分布治理，不是新增的等离子体压力求解。薄雾采样完整保留，并共用调整后的外流运动。可把薄雾强度设为 0，比较不同种子的底部间距。</p></div></details>
      <details className="parameters"><summary>逸散后如何迅速融入背景</summary><div className="formula-block"><p>背景微光的 {STELLAR_RADIATION_DISTRIBUTION.count} 个点分布在整条日面边缘。按 Act 4 常规构图下的局部面积换算，CME 尾迹保留 {CME_DISSIPATION.minTail}–{CME_DISSIPATION.maxTail} 个分散光点，恰好是原稀释预算的两倍。刚形成时仍能看见闭环轮廓，随后多数颗粒分别淡出：</p><pre>{`δ = τ − τ释放，rᵢ ∈ [0,1) 为固定的错峰顺序
Fᵢ(δ) = 1 − E((δ − ${CME_DISSIPATION.delay} − ${CME_DISSIPATION.stagger} rᵢ) / ${CME_DISSIPATION.fade})
尾迹光点：Fᵢ = 1，交接至独立的 300 秒生命周期
N尾迹 = ${CME_DISSIPATION.tailMultiplier} × clamp(ceil(背景面积密度 × CME 局部包络面积), ${CME_DISSIPATION.minTail / CME_DISSIPATION.tailMultiplier}, ${CME_DISSIPATION.maxTail / CME_DISSIPATION.tailMultiplier})`}</pre><p>每颗普通粒子在释放后约 0.04–0.29 秒开始淡出，淡出持续 0.4 秒；不会整批突然消失，也不会逐帧重新抽签。尾迹按空间间距挑选，在闭合后固定下来；拖动镜头不会补出新粒子。密度是参考构图下的视觉估算，实际投影、遮挡和背景生命周期会影响观感。薄雾保留完整运动样本与原有寿命，承接扩散尾迹。</p></div></details>
      <details className="parameters"><summary>300 秒尾迹如何逐渐扩散到页面</summary><div className="formula-block"><p>释放后 {CME_TAIL.transferDelay} 秒记录位置与速度，以 {CME_TAIL.crossfade} 秒交叉淡化交接至长寿命尾迹。初速度在数秒内平滑趋向缓慢背景漂移；每批颗粒保持各自的位置和漂移速度，不会随下一次喷发重置。</p><pre>{`a = 场景时间 − 交接时刻，b = 场景时间 − 释放时刻
T = ${CME_TAIL.relaxation} s
P(a) = P₀ + v背景 a + (v₀ − v背景) T [1 − exp(−a/T)] + w(a)
w(a) = A [1 − exp(−a/12)]² [sin(0.035a+φ) − sinφ]
α尾迹 = E(a/${CME_TAIL.crossfade}) × [1 − E((b−${CME_TAIL.fadeStart})/${CME_TAIL.lifetime - CME_TAIL.fadeStart})]
b ≥ ${CME_TAIL.lifetime} s：回收该颗粒`}</pre><p>主页尾迹逐渐向右扩散；此处使用局部向上的外流坐标，并提供“扩散远景”。寿命按 Act 4 可见场景时间计算，离开后暂停，返回继续。最后 60 秒缓慢淡出；不同喷发可同时保留尾迹。预览截止 313 秒，为最晚释放的颗粒留足 300 秒；相机裁切与遮挡仍会影响可见性。</p></div></details>
      <details className="parameters"><summary>薄雾如何覆盖粒子并共同扩散</summary><div className="formula-block"><p>每个雾区跟随原外流位置；h 控制横向覆盖，λ 控制沿运动方向的伸长：</p><pre>{`P雾 = P粒子样本
h = max(1.5 (0.14 + 0.12τ), 0.9 × 最大相邻间距)
λ = min(1.8, 1.15 + 0.18τ)
密集重叠处降低每片贡献，覆盖扩大时逐渐变薄`}</pre><p>可比较“迅速稀释”与“薄雾扩散”两个阶段，并切换斜视，观察粒子是否始终落在薄雾覆盖范围中。薄雾采用 75% 暖金色与 25% 灰白色混合。</p></div></details>
      <div className="model-note"><div><h3>薄雾的体积感从哪里来？</h3><p>由三维位置、不同大小、软边缘和随流移动的噪声密度共同表现。96 个雾区始终跟随粒子的真实位置，随邻点间距扩大覆盖，沿局部速度拉伸；相邻区域柔和衔接，密集处减弱叠加。共同中心只用于纹理坐标，不再把雾收成一块。配色以恒星的暖淡金色柔光为主。它是软粒子构成的体积近似，没有求解辐射转移或烟雾流体。</p></div><div><h3>物理骨架与艺术表达</h3><p>环形失稳、收颈与局部连接改变保留原模型。金色颗粒与薄雾是等离子体发光的艺术化表现，磁场不会真的转化为粒子；CME 为突发抛射，太阳风为持续外流。</p><a href="https://science.nasa.gov/sun/solar-storms-and-flares/">NASA：太阳喷发 ↗</a><br /><a href="https://science.nasa.gov/sun/what-is-the-solar-wind/">NASA：太阳风 ↗</a></div></div>
    </section><footer className="doc-footer"><span>YEQUDESU · CME 粒子化逸散实验</span><span>共享模型 / 固定步回放 / 艺术化体积近似</span></footer>
  </main>
}
