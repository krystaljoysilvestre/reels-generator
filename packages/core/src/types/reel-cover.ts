import { z } from 'zod'

// The reel's COVER selection — which frame the cover is built from, who chose it, and the ranked
// shortlist behind the recommendation. Persisted on `reels.cover` (migration 0058).
//
// The frame used to be picked at compose time by `first scene with isHero && an image, else the first
// scene with an image`, with nothing recorded — so nothing could override it and nothing could explain it.
// This makes the decision durable, attributable, and disagreeable-with.

export const CoverFrameCandidateSchema = z.object({
  assetId: z.string(),
  sceneIdx: z.number().int().nonnegative(),
  score: z.number().min(0).max(10),
  reason: z.string(), // shown beside the frame, so the recommendation can be argued with
  // Where type could sit without covering the subject. Recorded by the ranking pass because it is nearly
  // free to ask while the model is already looking at the frame. NOTHING CONSUMES IT YET — the treatment
  // still places type at a fixed edge. It is the input a per-frame placement would need, and capturing it
  // now means that change needs no second vision pass.
  textSpace: z.enum(['top', 'bottom', 'left', 'right', 'none']),
})
export type CoverFrameCandidate = z.infer<typeof CoverFrameCandidateSchema>

export const ReelCoverSchema = z.object({
  // The frame the cover is composed from.
  frameAssetId: z.string(),
  // PROVENANCE, and the load-bearing field. 'creator' means a human picked this frame, and a later
  // ranking pass must leave it alone: human choice outranks generated choice until explicitly reset. Same
  // rule the platform title follows. Never widen this to include a value that a re-rank may overwrite
  // without checking.
  source: z.enum(['ranked', 'creator']),
  // Ranked best-first. Empty when a creator picked a frame on a reel that was never ranked.
  shortlist: z.array(CoverFrameCandidateSchema).default([]),
  // What the ranking actually looked at versus what existed. Recorded because the pass SAMPLES on long
  // reels, and a shortlist that silently omitted 30 of 42 frames would read as "these are the best" when
  // it means "these are the best of the ones we showed it".
  sampled: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative().default(0),
})
export type ReelCover = z.infer<typeof ReelCoverSchema>

/** Did a human choose this frame? Then a re-rank must not move it. */
export function coverIsCreatorChosen(cover: unknown): boolean {
  const parsed = ReelCoverSchema.safeParse(cover)
  return parsed.success && parsed.data.source === 'creator'
}
