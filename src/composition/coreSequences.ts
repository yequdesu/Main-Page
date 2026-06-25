import { defineSequence } from './sequenceStore'
import type { SequenceDef } from './sequenceStore'

export const CORE_SEQUENCES: SequenceDef[] = [
  {
    id: 'act3.entry',
    initial: 'idle',
    phases: ['idle', 'infoTyping', 'labelsReveal', 'labelTyping', 'labelShrink', 'guidesReady', 'complete'],
    resetOn: ['act3.exit', 'timeline.act3Shift.leaveBackward'],
    reversible: false,
    on: {
      idle: { act3Mounted: 'infoTyping' },
      infoTyping: { infoWelcomeDone: 'labelsReveal' },
      labelsReveal: { firstLabelMounted: 'labelTyping' },
      labelTyping: { allLabelsTyped: 'labelShrink' },
      labelShrink: { labelShrinkDone: 'guidesReady' },
      guidesReady: { guidesShown: 'complete' },
    },
  },
  {
    id: 'labelReveal',
    initial: 'idle',
    phases: ['idle', 'label0', 'label1', 'label2', 'complete'],
    resetOn: ['act3.exit'],
    reversible: false,
    on: {
      idle: { labelsReveal: 'label0' },
      label0: { label0Done: 'label1' },
      label1: { label1Done: 'label2' },
      label2: { label2Done: 'complete' },
    },
  },
  {
    id: 'mainTerminal',
    initial: 'typing',
    phases: ['typing', 'idle', 'active'],
    reversible: false,
    on: {
      typing: { welcomeDone: 'idle' },
      idle: { activate: 'active' },
      active: { blur: 'idle', commandDone: 'idle' },
    },
  },
]

export function registerCoreSequences(): void {
  for (const def of CORE_SEQUENCES) defineSequence(def)
}
