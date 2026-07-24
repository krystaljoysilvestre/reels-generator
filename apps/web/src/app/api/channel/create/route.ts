import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, channels, stories } from '@reels/db'
import { ToneConfigSchema, WorldBibleSchema, ChannelVoiceSchema, VoiceModeSchema, CaptionStyleSchema, TargetPlatformSchema, PLATFORM_PRESETS, MusicIntensitySchema, MusicModeSchema, AudioMoodSchema, peakFracForType } from '@reels/core'
import { classifyGenre, GENRE_MODULE_VALUES, asGenreModule } from '@reels/core/prompts/scenes.v1'
import { STYLE_VALUES, resolveStyle } from '@reels/core/prompts/story-styles.v1'
import { VOICE_VALUES, resolveVoice } from '@reels/core/prompts/story-voices.v1'
import { requireApiUser } from '@/lib/api-access'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatarKey: z.string().trim().min(1).nullish(),
  description: z.string().trim().max(140).nullish(),
  nicheDescription: z.string().trim().min(1).max(8000),
  tagline: z.string().trim().max(200).default(''), // AI-derived one-line positioning
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
  targetPlatform: TargetPlatformSchema.default('all'), // shapes caption/length + render presets
  toneConfig: ToneConfigSchema,
  voiceSearchKeyword: z.string().trim().max(80).default(''), // AI-derived genre tag for voice matching
  stylePreset: z.string().trim().min(1),
  styleImageKey: z.string().trim().min(1).nullish(), // previewed style image, if the operator rendered one
  targetSeconds: z.number().int().min(15).max(600).default(75), // per-channel video length (long-form allows minutes; clamped to the platform cap below)
  captionStyle: CaptionStyleSchema.default({}), // burned-in caption look
  worldBible: WorldBibleSchema,
  // Genre bucket from channel.v1; falls back to keyword classification if absent.
  genreCategory: z.enum(GENRE_MODULE_VALUES).optional(),
  // PROSE dimensions (story-styles / story-voices) — operator-selectable. Re-validated against the
  // genre below. NOT the TTS voice (voicePool) or visual style (stylePreset).
  narrativeStyle: z.enum(STYLE_VALUES).optional(),
  narrativeVoice: z.enum(VOICE_VALUES).optional(),
  styleInfluence: z.enum(['light', 'medium', 'full']).optional(),
  // Story MODE (a separate axis from genre). 'ebn' = the Evidence-Based Narrative factual path
  // (dossier → Evidence Bible → cited story). Defaults to the fiction studio. Per decision-log
  // 2026-07-24-001, EBN leads with the 'historical_events' specialization.
  storyMode: z.enum(['standard', 'ebn']).default('standard'),
  ebnSpecialization: z.enum(['historical_events']).default('historical_events'),
  voiceMode: VoiceModeSchema,
  voicePool: z.array(ChannelVoiceSchema).max(8), // empty allowed for per_story (chosen at render)
  sampleScript: z.string().trim().max(20000).nullish(), // Step-2 narration → first reference story.
  // 20k is a generous sanity ceiling (a reference story gets fed into few-shot prompts, so a pasted
  // novel would blow up token cost) — not a UX limit; real scripts are far shorter.
  sampleSource: z.enum(['user', 'ai']).default('user'),
  extraSampleScripts: z.array(z.string().trim().min(1).max(20000)).max(2).default([]), // additional references
  costCents: z.number().int().min(0).default(0), // accumulated creation cost (derive + style + previews)
  draftChannelId: z.string().uuid().nullish(), // finishing a saved draft → promote that row instead of inserting
  // Sound step: optional background-music track (AI-generated or preset; null = no music),
  // the SFX toggle, music loudness, and the derived mood (kept for later regeneration).
  sound: z.object({
    musicMode: MusicModeSchema.default('preset'),  // ai | preset | upload | none
    // Pool of chosen tracks (preset/upload). >1 → the renderer draws one at random per reel.
    tracks: z.array(z.object({
      path: z.string().trim().min(1),  // R2 key of the track
      type: z.enum(['low_drone', 'drone_swell', 'riser_sting']),
      moodTags: z.array(z.string()).default([]),
      id: z.string().trim().min(1).optional(),  // preset id
    })).max(20).default([]),
    sfxEnabled: z.boolean().default(true),          // defaulted; edited in Settings, not onboarding
    musicIntensity: MusicIntensitySchema.default('balanced'),
    audioMood: AudioMoodSchema.optional(),
  }).default({}),
})

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const c = parsed.data
  if (c.voiceMode === 'single' && c.voicePool.length < 1) {
    return NextResponse.json({ error: 'Pick a voice for single-voice channels' }, { status: 400 })
  }
  // Single keeps exactly one voice; per-story stores none (chosen per reel at render).
  const voicePool = c.voiceMode === 'single' ? c.voicePool.slice(0, 1) : []
  // Length must fit the platform's hard cap (e.g. Shorts ≤60s) regardless of what was derived.
  const targetSeconds = Math.min(c.targetSeconds, PLATFORM_PRESETS[c.targetPlatform].maxSeconds)

  // Chosen track pool → the channel's musicPack ([] = no stored bed; the renderer draws one per
  // reel when >1). peakFrac is estimated from the type (generated/preset beds have no measured peak).
  const musicPack = c.sound.tracks.map((t) => ({
    id: t.id ?? randomUUID(),
    path: t.path,
    type: t.type,
    peakFrac: peakFracForType(t.type),
    moodTags: t.moodTags,
  }))
  const audioPacks = {
    ambientPacks: {},
    musicPack,
    musicMode: c.sound.musicMode,
    sfxEnabled: c.sound.sfxEnabled,
    musicIntensity: c.sound.musicIntensity,
    ...(c.sound.audioMood ? { audioMood: c.sound.audioMood } : {}),
  }
  const db = getDb()

  const values = {
    name: c.name,
    userId: user.id, // owning user (multi-tenancy)
    avatarKey: c.avatarKey ?? null,
    description: c.description ?? null,
    nicheDescription: c.nicheDescription,
    tagline: c.tagline,
    languages: c.languages,
    targetPlatform: c.targetPlatform,
    toneConfig: c.toneConfig,
    stylePreset: c.stylePreset,
    styleImageKey: c.styleImageKey ?? null,
    targetSeconds,
    captionStyle: c.captionStyle,
    worldBible: c.worldBible,
    // Prefer the LLM-derived bucket; fall back to keyword classification so the column is never 'general' by accident.
    genreCategory: c.genreCategory ?? classifyGenre(c.nicheDescription),
    // Story mode (fiction studio vs Evidence-Based Narrative). Specialization only meaningful when ebn.
    storyMode: c.storyMode,
    ebnSpecialization: c.ebnSpecialization,
    // Prose dimensions: keep narrativeStyle only if it's actually valid for the resolved genre
    // (resolveStyle → null on mismatch); '' otherwise. Voice is genre-agnostic. Influence default 'medium'.
    narrativeStyle:
      c.narrativeStyle && resolveStyle(asGenreModule(c.genreCategory ?? classifyGenre(c.nicheDescription)) ?? 'general', c.narrativeStyle)
        ? c.narrativeStyle
        : '',
    narrativeVoice: c.narrativeVoice && resolveVoice(c.narrativeVoice) ? c.narrativeVoice : '',
    styleInfluence: c.styleInfluence ?? 'medium',
    voiceMode: c.voiceMode,
    voiceSearchKeyword: c.voiceSearchKeyword,
    voicePool, // real ElevenLabs voices selected by the operator
    // LUT configured later (needs real asset files): keep schema defaults.
    lutConfig: { grain: 0.15, vignette: 0.25 },
    audioPacks,
    postingRules: { platforms: ['fb', 'yt'], scheduleUtcHour: 13, qualityThreshold: 0 },
    costCents: c.costCents, // what creating this channel cost us (derive + style options/previews)
  }

  // If finishing a saved draft, promote that same row (draft → active, state cleared) so the dashboard
  // entry the operator already saw becomes the real channel — no orphaned draft left behind. Otherwise
  // (or if the draft was deleted / already promoted) insert a fresh channel as usual.
  let channel: typeof channels.$inferSelect | undefined
  if (c.draftChannelId) {
    const existing = await db.query.channels.findFirst({ where: eq(channels.id, c.draftChannelId) })
    const owns = user.role === 'admin' || existing?.userId === user.id || existing?.userId == null
    if (existing && existing.status === 'draft' && owns) {
      const updated = await db
        .update(channels)
        .set({ ...values, status: 'active', draftState: null, updatedAt: new Date() })
        .where(eq(channels.id, c.draftChannelId))
        .returning()
      channel = updated[0]
    }
  }
  if (!channel) {
    const inserted = await db.insert(channels).values(values).returning()
    channel = inserted[0]
  }

  // Step-2 sample script(s): USER-written scripts become the channel's first reference stories — the
  // creator's actual voice, which nothing else can supply. AI-generated samples persist for the record
  // but are NOT references: they're derived from the same profile the Writer already reads (circular
  // DNA), and as the newest story they'd out-rank earned references in few-shot selection exactly when
  // they'd do the most shaping. The reference pool fills with EARNED examples instead (spot-check
  // approvals + performance promotions).
  const primary = c.sampleScript?.trim()
  const refBodies = [
    ...(primary ? [{ body: primary, source: c.sampleSource }] : []),
    ...c.extraSampleScripts.map((s) => ({ body: s, source: 'user' as const })),
  ]
  for (const ref of refBodies) {
    const firstLine = ref.body.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
    await db.insert(stories).values({
      channelId: channel!.id,
      source: ref.source,
      language: c.languages[0]!.toLowerCase(),
      title: firstLine ? firstLine.slice(0, 80) : 'Reference example',
      body: ref.body,
      isReference: ref.source === 'user',
    })
  }

  // AI-music channels compose a fresh, story-fit bed PER REEL at render time (generate_music) seeded by
  // the channel's audioMood — nothing to pre-generate here. (Was: a bespoke channel bed pool at creation.)

  return NextResponse.json({ channelId: channel!.id })
}
