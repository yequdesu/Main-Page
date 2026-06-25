import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPlanetCommandHandler } from '../planetCommands'
import type { PlanetLink } from '../../types'
import { useAnchorStore } from '../../composition/anchorStore'
import { planetParticleIndexAnchorId, setCoreAnchor } from '../../composition/coreAnchors'

// mock useScrollStore
vi.mock('../../stores/scrollStore', () => ({
  useScrollStore: {
    getState: vi.fn(() => ({
      focusedPlanetIdx: -1,
      setFocusedPlanet: vi.fn(),
    })),
  },
}))

const link: PlanetLink = { label: 'FS', accent: '#94a3b8', url: 'https://fs.yequdesu.top' }

describe('createPlanetCommandHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnchorStore.setState({ anchors: {}, frameId: 0 })
    setCoreAnchor(planetParticleIndexAnchorId(0), 10, 'world', 'planets')
    setCoreAnchor(planetParticleIndexAnchorId(1), 25, 'world', 'planets')
    setCoreAnchor(planetParticleIndexAnchorId(2), 50, 'world', 'planets')
  })

  it('returns info for "info" command', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('info')
    expect(result).toContain('FS')
    expect(result).toContain('https://fs.yequdesu.top')
    expect(result).toContain('轨道索引')
  })

  it('returns focus confirmation for "focus" command', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('focus')
    expect(result).toContain('已聚焦')
    expect(result).toContain('FS')
  })

  it('returns open confirmation for "open" command', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('open')
    expect(result).toContain('已打开')
    expect(openSpy).toHaveBeenCalledWith('https://fs.yequdesu.top', '_blank')
    openSpy.mockRestore()
  })

  it('returns error for unknown command', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('unknown')
    expect(result).toContain('command not found')
    expect(result).toContain('info')
    expect(result).toContain('focus')
    expect(result).toContain('open')
  })

  it('trims whitespace from input', () => {
    const handler = createPlanetCommandHandler(0, link)
    const result = handler('  info  ')
    expect(result).toContain('FS')
  })
})
