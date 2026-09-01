// Operator-directed replacement prompts after visual review of Crossroads reel #3.
// Clears only the rejected frames; generate_images re-runs them through normal cost + truth QA.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const { getDb, reels, scenes, channels, users } = await import('@reels/db')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel || reel.status !== 'storyboard') throw new Error(`expected storyboard reel, found ${reel?.status ?? 'missing'}`)
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const replacements = new Map<number, string>([
    [2, 'A simple three-stage object sequence on a plain field: binoculars beside a route arrow; the same binoculars behind a generic padlock symbol; then an unmistakably empty crow’s-nest equipment rack. No geographic map, historical key, cabinet, room, furniture, or people.'],
    [4, 'A simple evidence balance on a plain field: one side holds binoculars beside a dotted possible earlier-sighting path; the other holds an official report symbol beside an unaided eye. The two sides are cleanly separated. No courtroom, office, photographs, people, period documents, or legible writing.'],
    [6, 'A simple signal-path diagram on a plain field: a wireless message line travels from a radio symbol, then ends at a bold barrier before reaching a clearly recognizable ocean-liner command-deck icon. No suspension bridge, room, machinery, captain, officer, hands, or other people.'],
    [7, 'A simple conditional route diagram on a plain field: one telegram symbol splits into two paths. The solid path stops before the ship’s command deck; a faint dotted alternative bends the ship icon away from an ice field and ends in a question mark. No meeting, room, table, documents, uniforms, faces, hands, or people.'],
    [9, 'Three clean symbolic panels on a plain field: first, binoculars beside a crossed-out key icon; second, a wireless message line stopped before an ocean-liner command-deck icon; third and largest, a 22-knot speed dial driving a ship icon toward an iceberg. No suspension bridge, display case, room, furniture, visitors, faces, hands, or people.'],
  ])

  await db.transaction(async (tx) => {
    for (const [idx, prompt] of replacements) {
      const scene = await tx.query.scenes.findFirst({
        where: and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, idx)),
      })
      if (!scene?.imageAssetId) throw new Error(`scene ${idx} has no current image to replace`)
      await tx.update(scenes).set({
        visualPrompt: prompt,
        visualPromptBase: prompt,
        imageAssetId: null,
        imageOrigin: null,
        videoAssetId: null,
      }).where(and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, idx)))
    }
  })

  console.log(`[audit] owner ${owner.id} rejected and re-briefed Titanic frames ${[...replacements.keys()].join(', ')}`)
  console.log(`cleared ${replacements.size} frames for normal cost-accounted regeneration`)
  process.exit(0)
})()
