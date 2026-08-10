// Packaging preview — what post-meta.v1.2 writes for reels that already exist, WITHOUT touching them.
//
// WHY THIS EXISTS RATHER THAN JUST RE-RUNNING THE STEP. `generate_post_meta` auto-advances into
// `breakdown_scenes` → `generate_images`, and `generate_images` is the expensive step in the product. Both
// ought to be cache hits here (their input hashes don't include anything this lap changed), but "ought to
// be a cache hit" is exactly the kind of assumption that spends real money when it's wrong. This calls the
// prompt directly instead: one text call per reel, no step rows, no cascade, no DB write.
//
// It answers the packaging half of the publish-bar audit — the founder's "the thumbnails are not
// post-worthy, same goes with their titles" — by showing the OLD title beside the new title and the new
// 3–5 word thumbnail overlay, on real stories. Reels written before `thumbnailText` existed have no
// overlay at all and fall back to their whole title, which is the defect being measured.
//
// Usage (cwd apps/worker): pnpm exec tsx scripts/packaging-preview.ts
// Cost: one small text call per reel (maxTokens 800) — a few cents total, reported at the end.
import '../src/env.js'

void (async () => {
  const { getDb, reels, stories, channels } = await import('@reels/db')
  const { desc, eq } = await import('drizzle-orm')
  const { llmCall } = await import('@reels/providers')
  const { PostingRulesSchema, PostMetaSchema, effectiveGenre, thumbnailOverlay, thumbnailDuplicatesTitle } =
    await import('@reels/core')
  const { buildPostMetaPrompt, PostMetaLlmSchema, POST_META_V1_VERSION } = await import('../src/prompts-bridge.js')

  const db = getDb()
  let cost = 0
  const results: Array<{ channel: string; overlay: string; title: string }> = []

  for (const reel of await db.select().from(reels).orderBy(desc(reels.createdAt))) {
    if (!reel.storyId) continue
    const [story, channel] = await Promise.all([
      db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
      db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
    ])
    if (!story || !channel) continue
    const postingRules = PostingRulesSchema.parse(channel.postingRules ?? {})

    const { system, userMessage } = buildPostMetaPrompt({
      channelName: channel.name,
      nicheDescription: channel.nicheDescription ?? '',
      language: reel.language,
      platforms: postingRules.platforms,
      genreCategory: effectiveGenre(reel, channel),
      title: story.title,
      logline: story.logline ?? '',
      narration: story.body,
      ...(channel.targetSeconds ? { targetSeconds: channel.targetSeconds } : {}),
    })

    const before = PostMetaSchema.safeParse(reel.postMeta)
    const r = await llmCall({
      templateVersion: POST_META_V1_VERSION,
      schema: PostMetaLlmSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0.8,
      maxTokens: 800,
    })
    cost += r.costCents

    const next = PostMetaSchema.parse({ ...PostMetaLlmSchema.parse(r.data), v: 1, language: reel.language })
    const overlay = thumbnailOverlay(next)
    results.push({ channel: channel.name, overlay, title: next.title })

    console.log(`\n${'═'.repeat(92)}\n${channel.name}   (${r.costCents}¢)`)
    console.log(`\n  STORY TITLE      ${story.title}`)
    if (before.success) {
      console.log(`  SHIPPED TITLE    ${before.data.title}`)
      console.log(`  SHIPPED OVERLAY  ${before.data.thumbnailText || `(none — falls back to the whole title: "${thumbnailOverlay(before.data)}")`}`)
    }
    console.log(`\n  NEW TITLE        ${next.title}`)
    console.log(`  NEW OVERLAY      ${overlay}   [${overlay.trim().split(/\s+/).length} words]`)
    console.log(`  HOOK             ${next.hook}`)
    // The concept test from the plan: an overlay must ADD, COMPRESS or AMPLIFY — never merely restate the
    // whole title. Deliberately NOT a no-shared-words rule; "ONE SECOND" under "What If Earth Stopped
    // Spinning for One Second?" is compression and has to pass.
    const dup = thumbnailDuplicatesTitle(next)
    console.log(`  duplicates title? ${dup ? '✗ YES — the concept failure returning' : '✓ no'}`)
  }

  console.log(`\n${'═'.repeat(92)}`)
  console.log(`TOTAL COST: ${cost.toFixed(1)}¢   ·   ${POST_META_V1_VERSION}   ·   nothing written to the DB`)
  console.log(`\nRender these overlays onto real frames:`)
  for (const r of results) {
    const slug = r.channel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    console.log(`  OVERLAY_${slug.toUpperCase().replace(/-/g, '_')}="${r.overlay}" \\`)
  }
  process.exit(0)
})()
