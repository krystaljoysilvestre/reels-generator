import { eq } from 'drizzle-orm'
import { getDb, reels, rejections } from '@reels/db'
import type { rejectionReasonEnum } from '@reels/db'
import { transition } from '@reels/core'

// review_story gate — primary human gate (docs/02 §4 step 1b).
// Pipeline PAUSES here. The UI calls approveStory() or rejectStory() to continue.
// Reject here costs ~$0.05; reject post-render costs $4–5.

export type RejectionReasonCode = (typeof rejectionReasonEnum.enumValues)[number]

export async function approveStory(reelId: string): Promise<void> {
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)
  transition(reel.status, 'storyboard') // throws IllegalTransitionError if wrong state
  await db
    .update(reels)
    .set({ status: 'storyboard', updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}

export interface RejectStoryParams {
  reelId: string
  reasonCode: RejectionReasonCode
  note?: string
}

export async function rejectStory(params: RejectStoryParams): Promise<void> {
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, params.reelId) })
  if (!reel) throw new Error(`Reel not found: ${params.reelId}`)
  transition(reel.status, 'rejected')
  await db.transaction(async (tx) => {
    await tx
      .update(reels)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(reels.id, params.reelId))
    await tx.insert(rejections).values({
      reelId: params.reelId,
      reasonCode: params.reasonCode,
      note: params.note ?? null,
    })
  })
}
