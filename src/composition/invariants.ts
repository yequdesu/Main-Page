import type { ActorSpec } from './actorRegistry'
import { LAYERS } from './layerRegistry'

export function validateActorSpecs(actors: ActorSpec[]): string[] {
  const warnings: string[] = []
  const actorIds = new Set(actors.map((actor) => actor.id))

  for (const actor of actors) {
    if (actor.layer && !(actor.layer in LAYERS)) {
      warnings.push(`${actor.id}: layer "${actor.layer}" is not registered`)
    }

    const layer = actor.layer ? LAYERS[actor.layer]?.contract : undefined
    if (layer && actor.domain !== 'logic' && layer.kind !== actor.domain) {
      warnings.push(`${actor.id}: ${actor.domain} actor uses ${layer.kind} layer "${actor.layer}"`)
    }

    if (actor.render?.kind === 'webgl' && actor.render.transparent && actor.render.depthWrite) {
      warnings.push(`${actor.id}: transparent WebGL actor writes depth; verify this is intentional`)
    }

    for (const dep of actor.frame?.after ?? []) {
      if (!actorIds.has(dep)) warnings.push(`${actor.id}: missing after dependency "${dep}"`)
    }

    for (const dep of actor.frame?.before ?? []) {
      if (!actorIds.has(dep)) warnings.push(`${actor.id}: missing before dependency "${dep}"`)
    }

    if (actor.layout?.measure && !actor.layout.output && actor.produces?.every((ref) => !ref.startsWith('layout.'))) {
      warnings.push(`${actor.id}: layout.measure is true but no layout output is declared`)
    }
  }

  return warnings
}
