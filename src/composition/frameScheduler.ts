import type { ActorSpec, FramePhase } from './actorRegistry'

export const FRAME_PHASES: FramePhase[] = [
  'input',
  'timeline',
  'webgl.produce',
  'webgl.mutate',
  'camera',
  'projection',
  'layout.measure',
  'layout.solve',
  'dom.apply',
  'interaction',
  'signals',
  'debug',
]

export const R3F_FRAME_PRIORITY = {
  planetsProduce: -20,
  windChimeConsume: -10,
} as const

export function sortActorsByFramePhase(actors: ActorSpec[]): ActorSpec[] {
  const phaseIndex = new Map(FRAME_PHASES.map((phase, index) => [phase, index]))
  return [...actors].sort((a, b) => {
    const ai = a.frame ? phaseIndex.get(a.frame.phase) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    const bi = b.frame ? phaseIndex.get(b.frame.phase) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.id.localeCompare(b.id)
  })
}

export function findFrameOrderWarnings(actors: ActorSpec[]): string[] {
  const ids = new Set(actors.map((actor) => actor.id))
  const warnings: string[] = []

  for (const actor of actors) {
    for (const dep of actor.frame?.after ?? []) {
      if (!ids.has(dep)) warnings.push(`${actor.id} declares after "${dep}", but that actor is not registered`)
    }
    for (const dep of actor.frame?.before ?? []) {
      if (!ids.has(dep)) warnings.push(`${actor.id} declares before "${dep}", but that actor is not registered`)
    }
  }

  return warnings
}
