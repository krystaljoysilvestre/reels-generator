// One-off recovery: re-link three i2v clips whose DB rows were deleted on a wrong premise.
// The R2 objects were never touched, so this restores the pointers instead of re-paying ~$1.78.
import '../src/env.js'
void (async () => {
  const { getDb, assets, reels } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const R = '38f08fcf-51e5-468a-9a58-5364872abfc5'
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, R) })
  if (!reel) throw new Error('reel not found')
  const clips = [
    { sceneIdx: 1, costCents: 71, createdAt: new Date('2026-08-17T08:16:33.007Z') },
    { sceneIdx: 2, costCents: 36, createdAt: new Date('2026-08-17T08:16:19.669Z') },
    { sceneIdx: 3, costCents: 71, createdAt: new Date('2026-08-17T08:16:37.946Z') },
  ]
  for (const c of clips) {
    await db.insert(assets).values({
      reelId: R,
      channelId: reel.channelId,
      kind: 'video',
      storageKey: `reels/${R}/scenes/${c.sceneIdx}/video_v0.mp4`,
      provider: 'fal',
      costCents: c.costCents,
      meta: { sceneIdx: c.sceneIdx, variationIdx: 0 },
      createdAt: c.createdAt,
    }).onConflictDoNothing({ target: [assets.reelId, assets.storageKey] })
    console.log(`restored scene${c.sceneIdx} clip (${c.costCents}¢)`)
  }
  await db.update(reels).set({ status: 'rendering', updatedAt: new Date() }).where(eq(reels.id, R))
  console.log('reel → rendering')
  process.exit(0)
})()
