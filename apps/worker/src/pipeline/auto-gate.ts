import { eq, and, gt, isNotNull } from 'drizzle-orm'
import { getDb, reels, channels, stories, assets, publications, pipelineSteps, sceneImageOrigins, resolveYouTubeAuth, markConnectionError, assertVisualTruthReady } from '@reels/db'
import { enqueueStep } from '@reels/queue'
import { listVoices, downloadBuffer, uploadToYouTube, toElevenLabsLang, type YouTubeAuth } from '@reels/providers'
import { PostingRulesSchema, PostMetaSchema, formatPostCaption, formatImageCredits, StoryBibleSchema, matchNarratorVoice, nextPublishSlot, resolvePublishSlots, resolvePublishDays, resolveSidecarSrt, type PostingRules, type ChannelVoice, type NarratorVoice } from '@reels/core'
import { setReelStatus } from './harness.js'

// The three steps where the pipeline normally STOPS for human review (resolveNextStep returns null):
// generate_story → story_review, generate_images → storyboard, render_qa → spot_check.
const GATE_STEPS = new Set(['generate_story', 'generate_images', 'render_qa'])

/**
 * Did the FINAL story-gate verdict fail for this reel?
 *
 * Reads the persisted generate_story step output rather than re-running the gate: the verdicts are
 * already there (`gate.verdicts`, in order, the last one being the outcome after any steered rewrite),
 * so this costs nothing and cannot disagree with what actually happened.
 *
 * Fails CLOSED for auto mode. Auto-production removes the human backstop, so a missing, errored, or
 * unreadable editorial verdict is itself a reason to hold at story review rather than silently treating
 * "not checked" as "approved".
 */
async function storyGateRejected(reelId: string): Promise<boolean> {
  try {
    const step = await getDb().query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
      orderBy: (t, { desc }) => [desc(t.finishedAt)],
    })
    const gate = (step?.output as { gate?: { status?: string; verdicts?: { pass?: boolean }[] } } | null)?.gate
    if (gate?.status !== 'ok') return true
    const verdicts = gate.verdicts
    if (!Array.isArray(verdicts) || verdicts.length === 0) return true
    return verdicts[verdicts.length - 1]?.pass !== true
  } catch {
    return true
  }
}

// In 'auto' generation mode, cross a human gate automatically — mirroring the approve-story /
// trigger-render / approve-spot-check routes — so the reel runs end-to-end to a finished render with no
// stops. No-op unless the reel's channel is 'auto'. Publishing stays manual (we stop at 'approved')
// UNLESS the channel opted into autoPublishYouTube — then the approved reel uploads itself.
// Status guards make it idempotent (a BullMQ retry of the gate step won't cross twice).
export async function autoCrossGate(stepName: string, reelId: string): Promise<void> {
  if (!GATE_STEPS.has(stepName)) return

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (channel?.generationMode !== 'auto') return // only auto-mode channels self-advance

  if (stepName === 'generate_story') {
    if (reel.status !== 'story_review') return // already crossed

    // THE EDITORIAL GATE'S BACKSTOP IS REAL ONLY IN REVIEW MODE.
    // generate_story treats the story gate as ADVISORY: on a fail it runs at most one steered rewrite
    // and then passes the story through regardless, on the stated grounds that "the story_review human
    // gate is the backstop" (generate-story.ts). That backstop does not exist on an auto channel — this
    // function is what removes it — so a story the gate REJECTED would render and, with
    // autoPublishYouTube, publish itself unread.
    //
    // This does NOT give the gate teeth globally (that is a founder decision with its own 60%
    // first-attempt pass-rate trigger — see minimal-review-gate-policy). It only stops auto mode from
    // silently deleting the backstop the advisory policy explicitly depends on. Autopublish removes
    // human approval; it must not remove the gate.
    if (await storyGateRejected(reelId)) {
      console.warn(`[auto] ${reelId.slice(0, 8)} story gate did not pass — holding at story_review for review`)
      await db.update(reels)
        .set({ alertNote: 'The story did not clear the editorial bar — read it before this one goes out.', updatedAt: new Date() })
        .where(eq(reels.id, reelId))
      return
    }
    // (EBN reels render safely via the forced illustrative profile — Slice 2 — so they self-advance like
    // any other auto-mode reel; the Slice-1 hold has been lifted.)
    // = approve-story: story_review → storyboard, build Story Bible → scene breakdown → image generation.
    await setReelStatus(reelId, 'storyboard')
    await enqueueStep({ reelId, stepName: 'analyze_story' })
    console.log(`[auto] ${reelId.slice(0, 8)} story → storyboard`)
  } else if (stepName === 'generate_images') {
    if (reel.status !== 'storyboard') return
    // = trigger-render: pick a narrator voice, storyboard → rendering, run the render chain.
    // Cast the narrator to the story's teller (gender/age) when the pool allows it.
    const autoStory = reel.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : null
    const narrator = (autoStory?.elements as { narratorVoice?: NarratorVoice } | null)?.narratorVoice ?? null
    const voiceId = await pickAutoVoice(reel.language, channel.voicePool, channel.voiceSearchKeyword, narrator)
    if (!voiceId) {
      // Don't stall silently: leave the reel at storyboard AND flag it so the channel page shows
      // what's needed. Cleared when the operator picks a voice and renders (trigger-render).
      console.warn(`[auto] ${reelId.slice(0, 8)} no voice to auto-select — left at storyboard for manual render`)
      await db.update(reels)
        .set({ alertNote: 'Needs a narrator — pick a voice to finish this reel.', updatedAt: new Date() })
        .where(eq(reels.id, reelId))
      return
    }
    await db.update(reels).set({ status: 'rendering', voiceId, alertNote: null, updatedAt: new Date() }).where(eq(reels.id, reelId))
    await enqueueStep({ reelId, stepName: 'generate_tts' })
    console.log(`[auto] ${reelId.slice(0, 8)} storyboard → rendering (voice=${voiceId})`)
  } else if (stepName === 'render_qa') {
    if (reel.status !== 'spot_check') return
    // = approve-spot-check: spot_check → approved. Unlike the manual route, NO isReference promotion:
    // nobody watched this reel and nothing measured it, so it must not become a few-shot example the
    // writer imitates. On auto channels, logged performance is the only promoter (record-metrics ≥70).
    await setReelStatus(reelId, 'approved')
    console.log(`[auto] ${reelId.slice(0, 8)} spot-check → approved`)

    // Opt-in last mile: upload the approved reel to YouTube (mirrors /api/pipeline/publish-youtube —
    // keep the two in sync). Fail-soft: an upload failure leaves the reel approved with a visible
    // needs-attention note; it never fails the pipeline.
    //
    // On a channel that posts to a schedule, the reel is booked into its next free slot and YouTube
    // holds it private until then — the render finishing is not what decides when it goes out.
    const rules = PostingRulesSchema.safeParse(channel.postingRules ?? {})
    // Auto-publish needs THIS channel's grant. A channel the creator never connected keeps the manual
    // path — it must never borrow another channel's account.
    const ytAuth =
      rules.success && rules.data.autoProduce.autoPublishYouTube ? await resolveYouTubeAuth(channel.id) : null
    if (rules.success && ytAuth) {
      try {
        let slot: Date | null = null
        if (rules.data.publish.mode === 'slots') {
          slot = await nextFreeChannelSlot(channel.id, rules.data)
          if (!slot) {
            // The calendar is booked out as far as we're willing to look. Don't invent a time —
            // say so and leave the reel approved (the backlog guard will pause production).
            console.warn(`[auto] ${reelId.slice(0, 8)} no free posting slot — left approved`)
            await db.update(reels)
              .set({ alertNote: 'No posting time free — add another time, or post this one yourself.', updatedAt: new Date() })
              .where(eq(reels.id, reelId))
            return
          }
        }
        await autoPublishYouTube(reelId, slot, ytAuth)
        console.log(
          slot
            ? `[auto] ${reelId.slice(0, 8)} approved → scheduled on YouTube for ${slot.toISOString()}`
            : `[auto] ${reelId.slice(0, 8)} approved → published on YouTube`,
        )
      } catch (err) {
        console.warn(`[auto] ${reelId.slice(0, 8)} YouTube upload failed: ${err instanceof Error ? err.message : String(err)}`)
        await db.update(reels)
          .set({ alertNote: 'The YouTube upload didn’t go through — post this one manually.', updatedAt: new Date() })
          .where(eq(reels.id, reelId))
      }
    }
  }
}

// The channel's next free posting slot. Slots already claimed by reels waiting to go out are passed
// in so two reels never land on the same one (a 3-a-day channel with one slot must not triple-post).
async function nextFreeChannelSlot(channelId: string, rules: PostingRules): Promise<Date | null> {
  const db = getDb()
  const now = new Date()
  const booked = await db
    .select({ scheduledAt: publications.scheduledAt })
    .from(publications)
    .innerJoin(reels, eq(publications.reelId, reels.id))
    .where(
      and(
        eq(reels.channelId, channelId),
        eq(publications.status, 'scheduled'),
        isNotNull(publications.scheduledAt),
        gt(publications.scheduledAt, now),
      ),
    )
  return nextPublishSlot({
    now,
    slotsUtc: resolvePublishSlots(rules),
    daysUtc: resolvePublishDays(rules),
    taken: booked.map((b) => b.scheduledAt!),
  })
}

// Upload one approved reel to YouTube and record it (worker twin of /api/pipeline/publish-youtube).
// With a slot, YouTube holds the video private and publishes it itself at that instant — so the
// schedule doesn't depend on this worker being alive later.
async function autoPublishYouTube(reelId: string, slot: Date | null, auth: YouTubeAuth): Promise<void> {
  const db = getDb()
  await assertVisualTruthReady(reelId)
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel disappeared')

  // Idempotency: a BullMQ retry of render_qa must not upload twice.
  const existingYt = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, reelId), eq(publications.platform, 'yt')),
  })
  if (existingYt?.platformPostId) return

  const renderAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'render')),
  })
  if (!renderAsset) throw new Error('no render asset')

  const story = reel.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : null
  const meta = PostMetaSchema.safeParse(reel.postMeta)
  const title = meta.success ? meta.data.title : (story?.title ?? 'Untitled')
  // Append image-attribution credits for every real SOURCED image (Wikimedia etc.) so licence terms are met —
  // reference plates AND archival photographs presented as scenes.
  const bibleParse = reel.storyBible ? StoryBibleSchema.safeParse(reel.storyBible) : null
  const imageCredits = bibleParse?.success ? formatImageCredits(bibleParse.data, await sceneImageOrigins(reel.id)) : ''
  const baseDescription = meta.success ? formatPostCaption(meta.data) : (story?.logline ?? '')
  const description = imageCredits ? `${baseDescription}\n\n${imageCredits}` : baseDescription
  const tags = meta.success ? meta.data.hashtags.map((h) => h.replace(/^#/, '')) : []

  const video = await downloadBuffer(renderAsset.storageKey)
  // Composited thumbnail (hero frame + title, made at render) — best-effort custom thumbnail.
  const thumbAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.storageKey, `reels/${reelId}/thumbnail.jpg`)),
  })
  const thumbnailJpeg = thumbAsset ? await downloadBuffer(thumbAsset.storageKey).catch(() => undefined) : undefined
  // Channels that don't burn captions ship a native CC track instead, from the same timings.
  const ytChannel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const captionsSrt = resolveSidecarSrt(reel.timings, ytChannel?.captionStyle)
  const captionsLanguage = toElevenLabsLang(ytChannel?.languages?.[0] ?? 'english')
  let result
  try {
    result = await uploadToYouTube({
      video,
      title,
      description,
      tags,
      ...(thumbnailJpeg ? { thumbnailJpeg } : {}),
      ...(slot ? { publishAt: slot } : {}),
      ...(captionsSrt ? { captionsSrt, captionsLanguage } : {}),
      auth,
    })
  } catch (err) {
    // Mirror the manual route: a failed upload marks the connection so Settings asks for a reconnect.
    // The caller still surfaces the reel-level alert note and leaves the reel approved.
    await markConnectionError(reel.channelId, 'yt', err instanceof Error ? err.message : String(err))
    throw err
  }

  // Idempotent on the unique (reelId, platform) index: if a concurrent run already recorded this
  // publication, don't create a second row (the early-return above handles the sequential-retry case;
  // this closes the check-then-insert race between two concurrent runs).
  //
  // A scheduled publication carries scheduledAt and NO publishedAt — publishedAt means "this is
  // actually live", which is what the metrics poll keys off. publish-promote fills it in at the slot.
  await db
    .insert(publications)
    .values({
      reelId,
      platform: 'yt',
      platformPostId: result.videoId,
      status: slot ? 'scheduled' : 'published',
      ...(slot ? { scheduledAt: slot } : { publishedAt: new Date() }),
      disclosureApplied: true, // containsSyntheticMedia is set on the upload itself
    })
    .onConflictDoNothing({ target: [publications.reelId, publications.platform] })
  await db
    .update(reels)
    .set({ status: slot ? 'scheduled' : 'published', updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}

// Auto-mode voice: single-voice channels use their pool; per_story (empty pool) picks the top match
// from the same source the wizard recommends from — retrying WITHOUT the keyword if the keyword
// search comes back empty (a narrow keyword must not stall a hands-off channel). Null only if the
// catalog itself has nothing for the language.
async function pickAutoVoice(language: string, voicePool: unknown, searchKeyword: string | null, narrator?: NarratorVoice | null): Promise<string | null> {
  const pool = (voicePool ?? []) as ChannelVoice[]
  // Cast to the story's teller; matchNarratorVoice falls back to the pool's default voice on a
  // neutral/absent profile or no fit, so this is a safe drop-in for the old pool[0] behavior.
  const matched = matchNarratorVoice(pool, narrator)
  if (matched?.providerId) return matched.providerId
  try {
    if (searchKeyword) {
      const keyed = await listVoices(language, { search: searchKeyword })
      if (keyed[0]?.id) return keyed[0].id
    }
    const any = await listVoices(language)
    return any[0]?.id ?? null
  } catch (err) {
    console.warn(`[auto] voice lookup failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
