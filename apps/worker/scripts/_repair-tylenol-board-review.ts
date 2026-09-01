// Manual-review recovery for Crossroads reel #4.
// Automated truth QA passed six frames that still fabricated brand labels or official-document text.
// Replace only those concepts, regenerate only those linked assets, and leave the reel at storyboard.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const { getDb, reels, scenes, channels, users, assertVisualTruthReady } = await import('@reels/db')
  const { generateImages } = await import('../src/pipeline/steps/generate-images.js')
  const { and, asc, eq, inArray } = await import('drizzle-orm')

  const replacements = new Map([
    [
      1,
      {
        anchor: 'open bottle of Extra-Strength Tylenol',
        prompt:
          'A clearly symbolic editorial still life: an unbranded amber medicine-bottle silhouette lies on its side on a neutral surface; seven small dark circular markers form a restrained arc behind it, while one red-and-white capsule is isolated in the foreground under a sharp warning-shaped shadow. No logo, no label, no readable text, no people, no bodies, no ingestion, no documentary reconstruction.',
        intent: 'seven reported deaths represented without fabricating branded packaging or depicting victims',
      },
    ],
    [
      2,
      {
        anchor: 'Extra-Strength Tylenol bottle on a shelf',
        prompt:
          'A clearly symbolic pharmacy-shelf composition filled with identical unbranded amber medicine-bottle silhouettes; one broad uncertain shadow crosses the entire row so no single bottle can be identified as safe or unsafe. No logos, no labels, no readable text, no people, no real pharmacy, no documentary reconstruction.',
        intent: 'the uncertainty that applied to every capsule while the source remained unknown',
      },
    ],
    [
      6,
      {
        anchor: 'single Extra-Strength Tylenol bottle',
        prompt:
          'A clearly symbolic four-part cost ledger with no words or numbers: a warning loudspeaker icon, a withdrawal arrow carrying unbranded amber-bottle silhouettes away from a shelf, a laboratory vial beside a capsule, and a sealed disposal drum; all four paths converge on one heavy stack of blank red account cards. No logos, no product labels, no currency text, no people, no documentary reconstruction.',
        intent: 'the company-estimated cost across warnings, recall, testing, and destruction',
      },
    ],
    [
      7,
      {
        anchor: 'recall file folder',
        prompt:
          'A clearly symbolic evidence diagram: one red-and-white capsule sits at the center of a plain dark field; thin investigation lines radiate outward but terminate at empty circles and one unfilled human-profile outline, leaving the network visibly unresolved. No fingerprints, no suspect face, no documents, no readable text, no logos, no documentary reconstruction.',
        intent: 'the investigation had an object and evidence but no identified poisoner in the dossier record',
      },
    ],
    [
      8,
      {
        anchor: 'Two anonymous documents side by side',
        prompt:
          'A clearly symbolic split composition with a wide unbridged gap: on the left, unbranded amber medicine-bottle silhouettes move away from a shelf along a withdrawal arrow; on the right, a separate generic bottle gains a visible protective band and sealed cap beneath a simple regulatory-barrier symbol. No connecting arrow, no documents, no seals or emblems, no readable text, no logos, no people, no documentary reconstruction.',
        intent: 'the corporate withdrawal and federal packaging rule as separate responses, not one causing the other',
      },
    ],
    [
      10,
      {
        anchor: 'Two anonymous documents placed at opposite ends',
        prompt:
          'A clearly symbolic pharmacy shelf dividing into two paths around one centered unbranded amber medicine-bottle silhouette: the left path removes matching bottles from the shelf with a bold outward arrow; the right path encloses a matching bottle behind three visible protective rings. The center remains uncertain and unresolved. No documents, no product labels, no logos, no readable text, no people, no documentary reconstruction.',
        intent: 'two separate decisions answering the same question of what risk could remain on the shelf',
      },
    ],
  ])

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  if (reel.status !== 'storyboard') throw new Error(`expected storyboard reel, found ${reel.status}`)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const targets = await db.query.scenes.findMany({
    where: and(eq(scenes.reelId, REEL_ID), inArray(scenes.idx, [...replacements.keys()])),
    orderBy: [asc(scenes.idx)],
  })
  if (targets.length !== replacements.size) throw new Error('expected all six unsafe scenes')
  for (const scene of targets) {
    const replacement = replacements.get(scene.idx)!
    if (!scene.visualPrompt?.includes(replacement.anchor)) {
      throw new Error(`expected scene ${scene.idx} prompt anchor was not found`)
    }
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

  console.log(`[audit] owner ${owner.id} replaced six manual-review failures for reel ${REEL_ID}`)
  await generateImages(REEL_ID)
  await assertVisualTruthReady(REEL_ID)
  console.log(`[audit] reel ${REEL_ID} remains at storyboard after targeted, cost-accounted regeneration`)
  process.exit(0)
})()
