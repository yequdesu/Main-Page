import { STRUCTURE_LAYOUT } from '../behaviors/structureLayout'
import { PLANET_LINKS } from '../types'
import './SystemStructure.css'

const descriptions = ['普通行星', '带卫星行星', '四层行星环']
export default function SystemStructureOverlay({ progress, onBack }: { progress: number; onBack: () => void }) {
  const opacity = Math.max(0, Math.min(1, (progress - 0.65) / 0.35))
  return <section className="system-structure" aria-labelledby="structure-title" aria-hidden={opacity < 0.95}
    style={{ opacity, visibility: opacity > 0 ? 'visible' : 'hidden', transform: `translateY(${(1 - opacity) * 18}px)` }}>
    <header className="system-structure-heading">
      <p className="system-structure-kicker">04 / SYSTEM STRUCTURE</p>
      <h1 id="structure-title">恒星系统结构</h1>
      <p>从日面边缘，向外展开。</p>
    </header>
    <div className="system-structure-axis" aria-hidden="true" />
    {PLANET_LINKS.map((planet, i) => <div className="system-structure-planet" key={planet.label}
      style={{ left: `${STRUCTURE_LAYOUT.planetFractions[i] * 100}%` }}>
      <span className="system-structure-tick" aria-hidden="true" />
      <span className="system-structure-index">0{i + 1}</span>
      <h2>{planet.label}</h2>
      <p>{descriptions[i]}</p>
    </div>)}
    <button className="system-structure-back" tabIndex={opacity < 0.95 ? -1 : 0} onClick={event => { event.stopPropagation(); onBack() }}>↑ 返回轨道视图</button>
  </section>
}
