import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, channels } from '@reels/db'
import { ToneConfigSchema, WorldBibleSchema, CaptionStyleSchema, TargetPlatformSchema, PLATFORM_PRESETS, MAX_TARGET_SECONDS, AudioPacksSchema, MusicMoodSchema, PostingRulesSchema } from '@reels/core'
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
    targetPlatform: TargetPlatformSchema,
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
    // Auto-produce cadence (the consistency engine). Lives in the postingRules jsonb, merged below.
    autoProduce: z.object({
      enabled: z.boolean(),
      reelsPerDay: z.number().int().min(1).max(8),
      startHourUtc: z.number().int().min(0).max(23),
      autoPublishYouTube: z.boolean(),
    }),
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
    if (k === 'musicMood' || k === 'autoProduce') continue
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

  // Auto-produce cadence → merge into postingRules (the rest of the rules are untouched).
  if (patch.autoProduce !== undefined) {
    const rules = PostingRulesSchema.parse(existing.postingRules ?? {})
    rules.autoProduce = patch.autoProduce
    updates['postingRules'] = rules
  }

  // Keep length within the (possibly newly-chosen) platform's hard cap.
  const platform = (patch.targetPlatform ?? existing.targetPlatform) as keyof typeof PLATFORM_PRESETS
  const maxSeconds = (PLATFORM_PRESETS[platform] ?? PLATFORM_PRESETS.all).maxSeconds
  const effectiveSeconds = (patch.targetSeconds ?? existing.targetSeconds ?? 75)
  if (patch.targetSeconds !== undefined || patch.targetPlatform !== undefined) {
    updates['targetSeconds'] = Math.min(effectiveSeconds, maxSeconds)
  }

  await db.update(channels).set(updates).where(eq(channels.id, id))
  return NextResponse.json({ ok: true })
}
