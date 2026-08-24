import type { DepictionBasis } from '../types/story.js'

export interface VisualTruthSceneContract {
  depictionBasis: DepictionBasis
  sourcePresentationEntity?: string | null
  primaryEntity?: string | null
}

// Pure renderer invariant. It does not guess truth from prose; the model judge owns semantic truth, while
// this guard makes the source/non-source boundary mechanically impossible to cross by accident.
export function visualTruthContractErrors(scene: VisualTruthSceneContract): string[] {
  const errors: string[] = []
  const source = scene.sourcePresentationEntity?.trim() || null
  if (scene.depictionBasis === 'source') {
    if (!source) errors.push('source basis requires sourcePresentationEntity')
    if (source && scene.primaryEntity !== source) errors.push('sourcePresentationEntity must equal primaryEntity')
  } else if (source) {
    errors.push(`${scene.depictionBasis} basis cannot present source pixels`)
  }
  return errors
}
