import { eq, and } from 'drizzle-orm'
import { getDb, reels, channels, stories, assets, publications } from '@reels/db'
import { enqueueStep } from '@reels/queue'
import { listVoices, downloadBuffer, uploadToYouTube, isYouTubeConfigured } from '@reels/providers'
import { PostingRulesSchema, PostMetaSchema, formatPostCaption, matchNarratorVoice, type ChannelVoice, type NarratorVoice } from '@reels/core'
import { setReelStatus } from './harness.js'

// The three steps where the pipeline normally STOPS for human review (resolveNextStep returns null):
// generate_story → story_review, generate_images → storyboard, render_qa → spot_check.
const GATE_STEPS = new Set(['generate_story', 'generate_images', 'render_qa'])

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
    const rules = PostingRulesSchema.safeParse(channel.postingRules ?? {})
    if (rules.success && rules.data.autoProduce.autoPublishYouTube && isYouTubeConfigured()) {
      try {
        await autoPublishYouTube(reelId)
        console.log(`[auto] ${reelId.slice(0, 8)} approved → published on YouTube`)
      } catch (err) {
        console.warn(`[auto] ${reelId.slice(0, 8)} YouTube upload failed: ${err instanceof Error ? err.message : String(err)}`)
        await db.update(reels)
          .set({ alertNote: 'The YouTube upload didn’t go through — post this one manually.', updatedAt: new Date() })
          .where(eq(reels.id, reelId))
      }
    }
  }
}

// Upload one approved reel to YouTube and record it (worker twin of /api/pipeline/publish-youtube).
async function autoPublishYouTube(reelId: string): Promise<void> {
  const db = getDb()
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
  const description = meta.success ? formatPostCaption(meta.data) : (story?.logline ?? '')
  const tags = meta.success ? meta.data.hashtags.map((h) => h.replace(/^#/, '')) : []

  const video = await downloadBuffer(renderAsset.storageKey)
  // Composited thumbnail (hero frame + title, made at render) — best-effort custom thumbnail.
  const thumbAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.storageKey, `reels/${reelId}/thumbnail.jpg`)),
  })
  const thumbnailJpeg = thumbAsset ? await downloadBuffer(thumbAsset.storageKey).catch(() => undefined) : undefined
  const result = await uploadToYouTube({ video, title, description, tags, ...(thumbnailJpeg ? { thumbnailJpeg } : {}) })

  await db.insert(publications).values({
    reelId,
    platform: 'yt',
    platformPostId: result.videoId,
    status: 'published',
    publishedAt: new Date(),
    disclosureApplied: true, // containsSyntheticMedia is set on the upload itself
  })
  await db.update(reels).set({ status: 'published', updatedAt: new Date() }).where(eq(reels.id, reelId))
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
