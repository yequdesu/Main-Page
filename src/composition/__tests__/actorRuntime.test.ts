import { describe, expect, it, beforeEach } from 'vitest'
import { getActorRuntimeSnapshot, touchActorFrame, useActorRuntimeStore } from '../actorRuntime'

describe('actor runtime', () => {
  beforeEach(() => {
    useActorRuntimeStore.getState().resetActors()
  })

  it('records mounted and active state', () => {
    useActorRuntimeStore.getState().setActorMounted('planets', true, true, 'visible')

    expect(useActorRuntimeStore.getState().actors.planets).toMatchObject({
      id: 'planets',
      mounted: true,
      active: true,
      note: 'visible',
    })
  })

  it('tracks frame touches without requiring React', () => {
    touchActorFrame('grid', 12)
    touchActorFrame('grid', 13, false)

    expect(useActorRuntimeStore.getState().actors.grid).toMatchObject({
      frameCount: 2,
      lastFrameId: 13,
      active: false,
    })
  })

  it('merges runtime state with actor specs for debug snapshots', () => {
    useActorRuntimeStore.getState().setActorMounted('planets', true, true)

    const planets = getActorRuntimeSnapshot().find((actor) => actor.id === 'planets')

    expect(planets?.runtime).toMatchObject({ mounted: true, active: true })
  })
})
