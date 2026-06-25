import { beforeEach, describe, expect, it } from 'vitest'
import { defineSequence, phaseAtOrAfter, signalSequence, useSequenceStore } from '../sequenceStore'

describe('composition sequence store', () => {
  beforeEach(() => {
    useSequenceStore.setState({ defs: {}, states: {}, events: [] })
  })

  it('advances by named signals and records events', () => {
    defineSequence({
      id: 'example',
      initial: 'idle',
      phases: ['idle', 'typing', 'complete'],
      on: {
        idle: { start: 'typing' },
        typing: { done: 'complete' },
      },
    })

    signalSequence('example', 'start')
    expect(useSequenceStore.getState().states.example.phase).toBe('typing')

    signalSequence('example', 'done')
    const state = useSequenceStore.getState()
    expect(state.states.example.phase).toBe('complete')
    expect(state.states.example.active).toBe(false)
    expect(state.events.map(e => e.signal)).toEqual(['start', 'done'])
  })

  it('ignores invalid signals without mutating phase', () => {
    defineSequence({
      id: 'example',
      initial: 'idle',
      phases: ['idle', 'complete'],
      on: { idle: { done: 'complete' } },
    })

    signalSequence('example', 'missing')
    expect(useSequenceStore.getState().states.example.phase).toBe('idle')
    expect(useSequenceStore.getState().events).toHaveLength(0)
  })

  it('compares phases by declared order', () => {
    const def = {
      id: 'example',
      initial: 'idle',
      phases: ['idle', 'label0', 'label1', 'complete'],
      on: {},
    }

    expect(phaseAtOrAfter(def, 'label1', 'label0')).toBe(true)
    expect(phaseAtOrAfter(def, 'idle', 'label0')).toBe(false)
    expect(phaseAtOrAfter(def, 'missing', 'label0')).toBe(false)
    expect(phaseAtOrAfter(def, 'label1', 'missing')).toBe(false)
  })

  it('gates child sequences by parent phase', () => {
    defineSequence({
      id: 'parent',
      initial: 'idle',
      phases: ['idle', 'childActive', 'complete'],
      on: {
        idle: { mount: 'childActive' },
        childActive: { done: 'complete' },
      },
    })
    defineSequence({
      id: 'child',
      initial: 'idle',
      phases: ['idle', 'complete'],
      parent: 'parent',
      parentPhase: 'childActive',
      on: {
        idle: { done: 'complete' },
      },
    })

    signalSequence('child', 'done')
    expect(useSequenceStore.getState().states.child.phase).toBe('idle')

    signalSequence('parent', 'mount')
    signalSequence('child', 'done')
    expect(useSequenceStore.getState().states.child.phase).toBe('complete')
  })

  it('bubbles child completion to the parent with __parent__', () => {
    defineSequence({
      id: 'parent',
      initial: 'idle',
      phases: ['idle', 'labels', 'complete'],
      on: {
        idle: { start: 'labels' },
        labels: { 'child:done': 'complete' },
      },
    })
    defineSequence({
      id: 'child',
      initial: 'label0',
      phases: ['label0', 'label1', 'complete'],
      parent: 'parent',
      parentPhase: 'labels',
      on: {
        label0: { next: 'label1' },
        label1: { done: '__parent__' },
      },
    })

    signalSequence('parent', 'start')
    signalSequence('child', 'next')
    signalSequence('child', 'done')

    const state = useSequenceStore.getState()
    expect(state.states.child).toMatchObject({ phase: 'complete', active: false })
    expect(state.states.parent).toMatchObject({ phase: 'complete', active: false })
    expect(state.events.map(e => e.signal)).toEqual(['start', 'next', 'done', 'child:done'])
  })
})
