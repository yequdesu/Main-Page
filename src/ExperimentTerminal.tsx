import { useRef, useCallback } from 'react'
import TerminalBar from './terminal/TerminalBar'
import { useRealtimeStore } from './stores/realtimeStore'
import './ExperimentTerminal.css'

export default function ExperimentTerminal() {
  const handlePlanetLines = useCallback(() => {
    const { planetCoords, planetSpeeds } = useRealtimeStore.getState()
    return [
      `p-0  x:${planetCoords[0].x.toFixed(1)} y:${planetCoords[0].y.toFixed(1)} z:${planetCoords[0].z.toFixed(1)}  ω:${planetSpeeds[0].toFixed(3)}`,
      `p-1  x:${planetCoords[1].x.toFixed(1)} y:${planetCoords[1].y.toFixed(1)} z:${planetCoords[1].z.toFixed(1)}  ω:${planetSpeeds[1].toFixed(3)}`,
      `p-2  x:${planetCoords[2].x.toFixed(1)} y:${planetCoords[2].y.toFixed(1)} z:${planetCoords[2].z.toFixed(1)}  ω:${planetSpeeds[2].toFixed(3)}`,
    ]
  }, [])

  const orbitIdxRef = useRef(0)
  const handleOrbitLine = useCallback(() => {
    const { orbitSpeeds, orbitAngles } = useRealtimeStore.getState()
    const idx = orbitIdxRef.current
    orbitIdxRef.current = (idx + 1) % 3
    const labels = ['ring-0', 'ring-1', 'ring-2']
    return `${labels[idx]}  speed:${orbitSpeeds[idx].toFixed(2)}  ∠:${orbitAngles[idx].toFixed(1)}`
  }, [])

  return (
    <TerminalBar
      className="experiment-terminal"
      layout={{
        maxEchoLines: 6, maxWidth: '50ch', fontSize: '0.48rem',
        padding: '4px 10px', top: '2rem', left: '2rem', right: 'auto', zIndex: 20,
      }}
    >
      <TerminalBar.Welcome
        name="greeting"
        text="solar system:"
        lineCount={1}
        animation={{ inline: 'literal', charInterval: 40, startDelay: 800, overflow: 'static' }}
        exitGap={1000}
      />
      <TerminalBar.Section
        name="planets"
        getLines={handlePlanetLines}
        lineCount={3}
        animation={{ inline: 'directly', rows: 'lineByLine', rowInterval: 150, overflow: 'static' }}
        appearAfter="welcome:greeting"
      />
      <TerminalBar.ContentLine
        name="orbits"
        getLine={handleOrbitLine}
        lineCount={2}
        animation={{ inline: 'directly', overflow: 'rolling', rollingInterval: 500 }}
        appearAfter="section:planets"
      />
    </TerminalBar>
  )
}
