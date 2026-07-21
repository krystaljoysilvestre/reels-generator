import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, reels, rejections } from '@reels/db'
import type { rejectionReasonEnum } from '@reels/db'
import { transition } from '@reels/core'
import { enqueueStep } from '@reels/queue'
import { requireReelOwner } from '@/lib/api-access'

type ReasonCode = (typeof rejectionReasonEnum.enumValues)[number]

// Operator rejected the story under review AND wants another draft. Records the reason+note (which the
// next generate_story reads back to reshape the prompt + bump the attempt #), then loops the reel
// rejected → drafting and re-runs generation. Distinct from reject-story, which dead-ends a reel.
export async function POST(req: NextRequest) {
  const { reelId, reasonCode, note, opMinutes } = (await req.json().catch(() => ({}))) as {
    reelId?: string
    reasonCode?: ReasonCode
    note?: string
    opMinutes?: number
  }
  if (!reelId || !reasonCode) {
    return NextResponse.json({ error: 'reelId and reasonCode are required' }, { status: 400 })
  }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only a story currently under review can be regenerated (transition throws otherwise).
  try {
    transition(reel.status, 'rejected')
  } catch {
    return NextResponse.json({ error: `Cannot regenerate a reel in '${reel.status}'` }, { status: 409 })
  }

  // Record the rejection + flip to 'rejected' (durable feedback the worker reads back), atomically.
  await db.transaction(async (tx) => {
    await tx
      .update(reels)
      .set({ status: 'rejected', operatorMinutes: opMinutes ?? reel.operatorMinutes, updatedAt: new Date() })
      .where(eq(reels.id, reelId))
    await tx.insert(rejections).values({ reelId, reasonCode, note: note?.trim() || null })
  })

  // Loop back to drafting and re-run generation. enqueueStep clears the prior completed generate_story
  // job so it fires again; the step now reads this reel's fresh rejection and advances the attempt #.
  transition('rejected', 'drafting')
  await db.update(reels).set({ status: 'drafting', updatedAt: new Date() }).where(eq(reels.id, reelId))
  await enqueueStep({ reelId, stepName: 'generate_story', channelId: reel.channelId, language: reel.language })

  return NextResponse.json({ ok: true })
}
