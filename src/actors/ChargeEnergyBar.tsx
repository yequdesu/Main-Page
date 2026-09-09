import { useEffect, useRef } from 'react'
import { chargeGates, subscribeChargeGates } from '../behaviors/chargeGates'
import { getDomLayer } from '../composition/layerRegistry'
import { useActorRuntime } from '../composition/actorRuntime'

export default function ChargeEnergyBar() {
  useActorRuntime('chargeEnergyBar', true)
  const root = useRef<SVGSVGElement>(null), fill = useRef<SVGRectElement>(null)
  useEffect(() => {
    let previousActive = -2, previousEnergy = -1
    const update = () => {
      if (!root.current || !fill.current) return
      if (previousActive === chargeGates.active && previousEnergy === chargeGates.energy) return
      previousActive = chargeGates.active; previousEnergy = chargeGates.energy
      root.current.style.opacity = chargeGates.active < 0 ? '0' : '1'
      root.current.setAttribute('aria-hidden', String(chargeGates.active < 0))
      root.current.setAttribute('aria-valuenow', String(Math.round(chargeGates.energy * 100)))
      const width = 8 + chargeGates.energy * 100
      fill.current.setAttribute('width', String(width))
      fill.current.setAttribute('opacity', chargeGates.energy > 0 ? '1' : '0')
    }
    update(); return subscribeChargeGates(update)
  }, [])
  return <svg ref={root} viewBox="0 0 112 18" width="112" height="18" role="progressbar"
    aria-label="继续向下滚动以充能" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
    style={{ position: 'fixed', top: 'max(18px, env(safe-area-inset-top))', left: '50%',
      transform: 'translateX(-50%)', zIndex: getDomLayer('dom.chargeEnergyBar').zIndex,
      pointerEvents: 'none', opacity: 0, transition: 'opacity 160ms linear' }}>
    <rect x="1" y="4" width="110" height="10" rx="5" fill="none" stroke="#e3e6eb" strokeWidth="1" />
    <rect ref={fill} x="2" y="5" width="8" height="8" rx="4" fill="#fff" />
  </svg>
}
