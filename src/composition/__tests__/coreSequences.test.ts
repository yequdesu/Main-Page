import { beforeEach, describe, expect, it } from 'vitest'
import { registerCoreSequences } from '../coreSequences'
import { signalSequence, useSequenceStore } from '../sequenceStore'

describe('core composition sequences', () => {
  beforeEach(() => {
    useSequenceStore.setState({ defs: {}, states: {}, events: [] })
    registerCoreSequences()
  })

  it('models Act 3 label entry as explicit phases', () => {
    const signals = [
      'act3Mounted',
      'infoWelcomeDone',
      'firstLabelMounted',
      'allLabelsTyped',
      'labelShrinkDone',
      'guidesShown',
    ]

    for (const signal of signals) signalSequence('act3.entry', signal)

    const state = useSequenceStore.getState()
    expect(state.defs['act3.entry'].phases).toEqual([
      'idle',
      'infoTyping',
      'labelsReveal',
      'labelTyping',
      'labelShrink',
      'guidesReady',
      'complete',
    ])
    expect(state.states['act3.entry']).toMatchObject({
      phase: 'complete',
      active: false,
    })
    expect(state.events.map((event) => event.to)).toEqual([
      'infoTyping',
      'labelsReveal',
      'labelTyping',
      'labelShrink',
      'guidesReady',
      'complete',
    ])
  })
})
