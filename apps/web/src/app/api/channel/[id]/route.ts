import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, channels } from '@reels/db'
import { ToneConfigSchema, WorldBibleSchema, CaptionStyleSchema, TargetPlatformsSchema, channelPlatformPreset, MAX_TARGET_SECONDS, AudioPacksSchema, MusicMoodSchema, PostingRulesSchema, PublishScheduleSchema } from '@reels/core'
import { STYLE_VALUES } from '@reels/core/prompts/story-styles.v1'
import { GENRE_MODULE_VALUES } from '@reels/core/prompts/scenes.v1'
import { VOICE_VALUES } from '@reels/core/prompts/story-voices.v1'
import { requireChannelOwner } from '@/lib/api-access'

// Edit a channel's creative bible after creation. Only the fields below are editable here;
// voices/avatar/language stay out of V1 (each needs its own picker flow). Every field is
// optional — we update just what's sent. Same zod schemas as creation, so values are
// validated/clamped identically.
const UpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(140).nullish(),
    nicheDescription: z.string().trim().min(1).max(8000),
    tagline: z.string().trim().max(200),
    targetPlatforms: TargetPlatformsSchema,
    toneConfig: ToneConfigSchema,
    // Ceiling = the largest platform cap (long-form YouTube); clamped to the actual platform below.
    targetSeconds: z.number().int().min(15).max(MAX_TARGET_SECONDS),
    stylePreset: z.string().trim().min(1),
    styleImageKey: z.string().trim().min(1).nullish(), // chosen style-sample image (preset thumb or custom render)
    captionStyle: CaptionStyleSchema,
    worldBible: WorldBibleSchema,
    generationMode: z.enum(['review', 'auto']),
    musicMood: MusicMoodSchema.nullable(), // channel-default background-music mood; null = auto (fall back to audioMood). Lives in audioPacks jsonb.
    tasteRubric: z.string().trim().max(4000).nullish(), // story-critic rubric; null/empty clears → default rubric
    // Genre — the AI's creation-time classification, correctable by the operator (re-scopes the
    // writer identity, registers, scene grammar, voice delivery, and the style menus).
    genreCategory: z.enum(GENRE_MODULE_VALUES),
    // PROSE dimensions (story-styles / story-voices) — '' allowed (pure genre / default voice).
    narrativeStyle: z.union([z.literal(''), z.enum(STYLE_VALUES)]),
    narrativeVoice: z.union([z.literal(''), z.enum(VOICE_VALUES)]),
    styleInfluence: z.enum(['light', 'medium', 'full']),
    // Story MODE (fiction studio vs Evidence-Based Narrative factual path) + its specialization.
    storyMode: z.enum(['standard', 'ebn']),
    ebnSpecialization: z.enum(['historical_events']),
    // Presentation identity — how narration reaches the audience (analyzer context; '' = no lean).
    presentation: z.enum(['', 'voiceover', 'hosted']),
    // Standalone fact gate opt-in — fact-check this channel's scripts against per-reel sources (advisory).
    factCheck: z.boolean(),
    // Auto-produce cadence (the consistency engine). Lives in the postingRules jsonb, merged below.
    autoProduce: z.object({
      enabled: z.boolean(),
      reelsPerDay: z.number().int().min(1).max(8),
      startHourUtc: z.number().int().min(0).max(23),
      autoPublishYouTube: z.boolean(),
    }),
    // Posting schedule — WHEN a finished reel goes out. Also in postingRules, merged below.
    publish: PublishScheduleSchema,
  })
  .partial()
  .strict()

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const gate = await requireChannelOwner(id)
  if (gate instanceof NextResponse) return gate

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const db = getDb()
  const existing = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // `description` may be explicitly null (cleared); everything else only updates if present.
  // `musicMood` isn't a column — it lives inside the audioPacks jsonb, merged in below.
  const patch = parsed.data
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'musicMood' || k === 'autoProduce' || k === 'publish') continue
    if (k === 'description') updates[k] = v ?? null
    else if (k === 'tasteRubric') updates[k] = v || null // clearing the textarea reverts to the default rubric
    else if (v !== undefined) updates[k] = v
  }

  // Channel-default music mood → merge into audioPacks (null clears it → reels fall back to audioMood).
  if (patch.musicMood !== undefined) {
    const packs = AudioPacksSchema.parse(existing.audioPacks ?? {})
    if (patch.musicMood === null) delete packs.musicMood
    else packs.musicMood = patch.musicMood
    updates['audioPacks'] = packs
  }

  // Auto-produce cadence + posting schedule → merge into postingRules (the rest is untouched).
  if (patch.autoProduce !== undefined || patch.publish !== undefined) {
    const rules = PostingRulesSchema.parse(existing.postingRules ?? {})
    if (patch.autoProduce !== undefined) rules.autoProduce = patch.autoProduce
    if (patch.publish !== undefined) rules.publish = patch.publish
    updates['postingRules'] = rules
  }

  // Keep length within the hard cap of the narrowest platform in the (possibly newly-chosen) set.
  const maxSeconds = channelPlatformPreset({ targetPlatforms: patch.targetPlatforms ?? existing.targetPlatforms }).maxSeconds
  const effectiveSeconds = (patch.targetSeconds ?? existing.targetSeconds ?? 75)
  if (patch.targetSeconds !== undefined || patch.targetPlatforms !== undefined) {
    updates['targetSeconds'] = Math.min(effectiveSeconds, maxSeconds)
  }

  await db.update(channels).set(updates).where(eq(channels.id, id))
  return NextResponse.json({ ok: true })
}

// Delete a channel, GitHub-style: the client re-sends the channel's name and we verify it against
// the stored row, so a stray or replayed request can never delete one. Reels, stories, scenes,
// assets, and compilations cascade in the DB; spend_events rows survive with channelId nulled —
// deleting a channel must not erase the record that money was spent. Known leftovers, both benign:
// R2 objects orphan until the r2-sweep script runs, and in-flight jobs for the channel's reels fail
// their retries on the missing row.
const DeleteSchema = z.object({ confirmName: z.string() }).strict()

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const gate = await requireChannelOwner(id)
  if (gate instanceof NextResponse) return gate

  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const db = getDb()
  const existing = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (parsed.data.confirmName !== existing.name) {
    return NextResponse.json({ error: 'That name doesn’t match this channel.' }, { status: 400 })
  }

  await db.delete(channels).where(eq(channels.id, id))
  console.log(`[audit] channel.delete actor=${gate.id} channel=${id} name="${existing.name}" outcome=deleted`)
  return NextResponse.json({ ok: true })
}
