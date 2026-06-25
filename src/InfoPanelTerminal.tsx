import { useRef, useCallback } from 'react'
import TerminalBar from './terminal/TerminalBar'
import { useRealtimeStore } from './stores/realtimeStore'
import { getDomLayer } from './composition/layerRegistry'
import { useActorRuntime } from './composition/actorRuntime'
import { useSignal } from './composition/sequenceStore'
import './InfoPanelTerminal.css'

/**
 * InfoPanelTerminal — 信息面板终端（Act 3 左上角）。
 *
 * 实时显示行星坐标、轨道参数、摄像机状态和 debris 计数。
 * 通过 TerminalBar Slot 声明式构建，与 MainTerminal 对称。
 */
export default function InfoPanelTerminal() {
  useActorRuntime('infoPanel', true)
  const signalAct3 = useSignal('act3.entry')
  const signalLabelReveal = useSignal('labelReveal')
  const handlePlanetLines = useCallback(() => {
    const { planetCoords, planetSpeeds } = useRealtimeStore.getState()
    return [
      `p-0  x:${planetCoords[0].x.toFixed(1)} y:${planetCoords[0].y.toFixed(1)} z:${planetCoords[0].z.toFixed(1)}  ω:${planetSpeeds[0].toFixed(3)}`,
      `p-1  x:${planetCoords[1].x.toFixed(1)} y:${planetCoords[1].y.toFixed(1)} z:${planetCoords[1].z.toFixed(1)}  ω:${planetSpeeds[1].toFixed(3)}`,
      `p-2  x:${planetCoords[2].x.toFixed(1)} y:${planetCoords[2].y.toFixed(1)} z:${planetCoords[2].z.toFixed(1)}  ω:${planetSpeeds[2].toFixed(3)}`,
    ]
  }, [])

  const rollingIdxRef = useRef(0)
  const handleRollingLine = useCallback(() => {
    const { orbitSpeeds, orbitAngles, camera, debrisCount } = useRealtimeStore.getState()
    const idx = rollingIdxRef.current
    rollingIdxRef.current = (idx + 1) % 7

    switch (idx) {
      case 0: {
        const labels = ['ring-0', 'ring-1', 'ring-2']
        const i = idx % 3
        return `${labels[i]}  speed:${orbitSpeeds[i].toFixed(2)}  ∠:${orbitAngles[i].toFixed(1)}`
      }
      case 1: {
        const labels = ['ring-0', 'ring-1', 'ring-2']
        const i = (idx + 1) % 3
        return `${labels[i]}  speed:${orbitSpeeds[i].toFixed(2)}  ∠:${orbitAngles[i].toFixed(1)}`
      }
      case 2: {
        const labels = ['ring-0', 'ring-1', 'ring-2']
        const i = (idx + 2) % 3
        return `${labels[i]}  speed:${orbitSpeeds[i].toFixed(2)}  ∠:${orbitAngles[i].toFixed(1)}`
      }
      case 3:
        return `cam pos  x:${camera.pos.x.toFixed(2)} y:${camera.pos.y.toFixed(2)} z:${camera.pos.z.toFixed(2)}`
      case 4:
        return `cam look  x:${camera.look.x.toFixed(2)} y:${camera.look.y.toFixed(2)} z:${camera.look.z.toFixed(2)}`
      case 5:
        return `cam fov  ${camera.fov.toFixed(1)}°`
      case 6:
        return `debris instances  ${debrisCount}`
      default:
        return ''
    }
  }, [])

  return (
    <TerminalBar
      className="info-panel-terminal"
      state={{
        onModeChange: (mode) => {
          if (mode === 'idle') {
            signalAct3('infoWelcomeDone')
            signalLabelReveal('labelsReveal')
          }
        },
      }}
      layout={{
        maxEchoLines: 8, maxWidth: '50ch', fontSize: '0.48rem',
        padding: '4px 10px', borderRadius: '12px',
        fontFamily: "'SF Mono','Fira Code','Cascadia Code','Consolas',monospace",
        top: '2rem', left: '2rem', right: 'auto', zIndex: getDomLayer('dom.infoPanel').zIndex,
      }}
    >
      <TerminalBar.Welcome
        name="greeting"
        text="solar system:"
        lineCount={1}
        animation={{ inline: 'literal', charInterval: 40, startDelay: 800, overflow: 'static' }}
        exitGap={600}
      />
      <TerminalBar.Section
        name="planets"
        getLines={handlePlanetLines}
        lineCount={3}
        animation={{ inline: 'directly', rows: 'lineByLine', rowInterval: 150, overflow: 'static' }}
        appearAfter="welcome:greeting"
      />
      <TerminalBar.ContentLine
        name="rolling"
        getLine={handleRollingLine}
        lineCount={4}
        animation={{ inline: 'directly', overflow: 'rolling', rollingInterval: 500 }}
        appearAfter="section:planets"
      />
    </TerminalBar>
  )
}
