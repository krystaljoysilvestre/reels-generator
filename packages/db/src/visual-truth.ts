import { eq } from 'drizzle-orm'
import { getDb } from './client.js'
import { assets, scenes } from './schema.js'

export interface VisualTruthBlocker {
  sceneIdx: number
  reason: string
}

// Shared last-mile guard for worker render, manual render, and publishing. Legacy assets remain valid;
// only scenes explicitly enrolled in blocking truth QA can fail on a missing/negative verdict.
export async function visualTruthBlockers(reelId: string): Promise<VisualTruthBlocker[]> {
  const rows = await getDb()
    .select({
      idx: scenes.idx,
      basis: scenes.depictionBasis,
      sourcePresentationEntity: scenes.sourcePresentationEntity,
      meta: assets.meta,
    })
    .from(scenes)
    .leftJoin(assets, eq(scenes.imageAssetId, assets.id))
    .where(eq(scenes.reelId, reelId))

  return rows.flatMap((row) => {
    const blockers: VisualTruthBlocker[] = []
    if (row.basis === 'source' && !row.sourcePresentationEntity) {
      blockers.push({ sceneIdx: row.idx, reason: 'source basis has no verified source entity' })
    }
    if (row.basis !== 'source' && row.sourcePresentationEntity) {
      blockers.push({ sceneIdx: row.idx, reason: `${row.basis} basis cannot present source pixels` })
    }
    const meta = (row.meta ?? {}) as Record<string, unknown>
    if (meta['truthQaRequired'] === true && meta['truthQaPass'] !== true) {
      const truthIssues = Array.isArray(meta['truthQaIssues']) ? meta['truthQaIssues'].map(String) : []
      const issues = truthIssues.join('; ')
      blockers.push({ sceneIdx: row.idx, reason: issues || 'truth QA did not pass' })
    }
    return blockers
  })
}

export async function assertVisualTruthReady(reelId: string): Promise<void> {
  const blockers = await visualTruthBlockers(reelId)
  if (blockers.length > 0) {
    throw new Error(`[visual-truth-gate] ${blockers.map((b) => `scene ${b.sceneIdx}: ${b.reason}`).join(' | ')}`)
  }
}
