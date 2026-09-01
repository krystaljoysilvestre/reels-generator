// Targeted recovery for Crossroads reel #4 after visual-truth QA rejected two generated frames.
// Changes the defective scene concepts, clears only those two image links, and regenerates them through
// the normal cost-accounted image path. Every other scene and asset remains untouched.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const { getDb, reels, scenes, channels, users, assertVisualTruthReady } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { generateImages } = await import('../src/pipeline/steps/generate-images.js')
  const { and, asc, eq, inArray } = await import('drizzle-orm')

  const replacements = new Map([
    [
      3,
      {
        prompt:
          'A clearly symbolic editorial composition viewed directly overhead: a ring of empty, unbranded office chairs around a plain circular table; three simple blank action cards converge at the center, showing only an amber capsule-bottle silhouette, a face-down advertising placard, and an OFF-position factory switch. No people, no company logos, no readable text, no specific meeting room, no documentary reconstruction.',
        intent: 'the formation of a decision-making group, represented without inventing a historical meeting',
      },
    ],
    [
      5,
      {
        prompt:
          'A clearly symbolic scale diagram: hundreds of identical unbranded amber medicine-bottle silhouettes recede in a precise grid toward a simplified nationwide United States route map, with the grid visibly interrupted by a bold withdrawal arrow moving away from pharmacy shelves. No product labels, no logos, no readable text, no workers, no forklifts, no real warehouse, no documentary reconstruction.',
        intent: 'the nationwide scale of the 31 million-bottle withdrawal without fabricating branded packaging',
      },
    ],
  ])

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  if (reel.status !== 'failed') throw new Error(`expected failed reel, found ${reel.status}`)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const targetScenes = await db.query.scenes.findMany({
    where: and(eq(scenes.reelId, REEL_ID), inArray(scenes.idx, [...replacements.keys()])),
    orderBy: [asc(scenes.idx)],
  })
  if (targetScenes.length !== replacements.size) throw new Error('expected both failing scenes')
  if (!targetScenes.find((scene) => scene.idx === 3)?.visualPrompt?.includes('corporate meeting room')) {
    throw new Error('expected scene 3 meeting-room anchor was not found')
  }
  if (!targetScenes.find((scene) => scene.idx === 5)?.visualPrompt?.includes('pallets of Tylenol bottles')) {
    throw new Error('expected scene 5 branded-pallet anchor was not found')
  }

  await db.transaction(async (tx) => {
    for (const [idx, replacement] of replacements) {
      await tx
        .update(scenes)
        .set({
          visualPrompt: replacement.prompt,
          visualPromptBase: replacement.prompt,
          sceneIntent: replacement.intent,
          depictionBasis: 'conceptual',
          imageAssetId: null,
          imageOrigin: null,
        })
        .where(and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, idx)))
    }
  })

  console.log(`[audit] owner ${owner.id} replaced the defective visual concepts for reel ${REEL_ID}, scenes 3 and 5`)
  await generateImages(REEL_ID)
  await assertVisualTruthReady(REEL_ID)

  let recoveredStatus = transition(reel.status, 'drafting')
  recoveredStatus = transition(recoveredStatus, 'story_review')
  recoveredStatus = transition(recoveredStatus, 'storyboard')
  await db
    .update(reels)
    .set({ status: recoveredStatus, updatedAt: new Date() })
    .where(eq(reels.id, REEL_ID))

  console.log(`[audit] reel ${REEL_ID} recovered to storyboard after targeted, cost-accounted regeneration`)
  process.exit(0)
})()
