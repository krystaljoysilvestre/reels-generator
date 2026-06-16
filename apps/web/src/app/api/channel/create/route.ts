import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb, channels } from '@reels/db'
import { ToneConfigSchema, WorldBibleSchema, ChannelVoiceSchema, VoiceModeSchema } from '@reels/core'
import { getSession } from '@/lib/auth'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  avatarKey: z.string().trim().min(1).nullish(),
  description: z.string().trim().max(140).nullish(),
  nicheDescription: z.string().trim().min(1).max(2000),
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
  toneConfig: ToneConfigSchema,
  stylePreset: z.string().trim().min(1),
  worldBible: WorldBibleSchema,
  voiceMode: VoiceModeSchema,
  voicePool: z.array(ChannelVoiceSchema).max(8), // empty allowed for per_story (chosen at render)
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const db = getDb()

  const [channel] = await db
    .insert(channels)
    .values({
      name: c.name,
      avatarKey: c.avatarKey ?? null,
      description: c.description ?? null,
      nicheDescription: c.nicheDescription,
      languages: c.languages,
      toneConfig: c.toneConfig,
      stylePreset: c.stylePreset,
      worldBible: c.worldBible,
      voiceMode: c.voiceMode,
      voicePool, // real ElevenLabs voices selected by the operator
      // Configured later (need real asset files): keep schema defaults.
      lutConfig: { grain: 0.15, vignette: 0.25 },
      audioPacks: { ambientPacks: {}, musicPack: [] },
      postingRules: { platforms: ['fb', 'yt'], scheduleUtcHour: 13, qualityThreshold: 0 },
    })
    .returning()

  return NextResponse.json({ channelId: channel!.id })
}
