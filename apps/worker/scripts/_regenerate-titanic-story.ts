// Operator-only bounded rewrite for Crossroads reel #3 after Gate 1 review.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const NOTE = `Final bounded rewrite. The factual hierarchy is now correct; do not change the premise or add research. Distill the narration to 155–180 words so it plays as a short story rather than an inquiry brief.

1. Open immediately on the contradiction: the lookouts truly had no binoculars, but the 1912 inquiry did not establish that Blair's key caused the collision.
2. Remove witness scaffolding that does not change the conclusion. Do not name Hogg, Lightoller, or Boxhall. The audience only needs the supported facts.
3. Preserve Fleet's concrete beat: he saw the iceberg unaided, struck the bell three times, and called "Iceberg right ahead." Explicitly say Fleet testified that he believed binoculars might have identified it sooner; then state the Court found binoculars neither necessary nor usual.
4. Move promptly to Mesaba: two hours earlier its warning described heavy pack ice and large icebergs in Titanic's immediate vicinity. It reached the Marconi room but not Captain Smith or any bridge officer. The report said only that it MIGHT have affected navigation.
5. Make 22 knots the climax. The Court found that speed excessive in known proximity to ice and concluded excessive speed caused the loss.
6. End once, without "what the record shows" recap language, on the title's honest three-part contrast: the key is the memorable legend; the warning is the documented missed possibility; 22 knots is the Court's cause. Preserve that hierarchy and do not explain it again.`

  const { getDb, reels, rejections } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  transition(reel.status, 'rejected')

  await db.transaction(async (tx) => {
    await tx
      .update(reels)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(reels.id, REEL_ID))
    await tx.insert(rejections).values({ reelId: REEL_ID, reasonCode: 'other', note: NOTE })
  })

  transition('rejected', 'drafting')
  await db.update(reels).set({ status: 'drafting', updatedAt: new Date() }).where(eq(reels.id, REEL_ID))
  console.log(`[audit] operator requested bounded story rewrite for ${REEL_ID}`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'generate_story', channelId: reel.channelId, language: reel.language })
  console.log(`enqueued generate_story for ${REEL_ID}`)
  process.exit(0)
})()
