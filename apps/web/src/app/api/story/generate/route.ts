import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { llmCall } from '@reels/providers'
import { getDb, channels, stories, recordSpendEvent } from '@reels/db'
import { ToneConfigSchema, WorldBibleSchema, PLATFORM_PRESETS } from '@reels/core'
import {
  buildChannelSamplePrompt,
  ChannelSampleSchema,
  CHANNEL_SAMPLE_V2_VERSION,
} from '@reels/core/prompts/channel-sample.v2'
import { requireChannelOwner, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

// Write a story into the channel's library, optionally from the creator's idea — banked for later,
// no reel and no production spend yet. Same writer identity + craft core the channel was set up with,
// so a library story sounds like the channel.
//
// Making a reel from one of these lands at the story_review gate (provide-story), NOT straight into
// production: this is a single pass with no planner and no critic, unlike the real Writer chain.
//
// Evidence-Based channels are excluded. Their whole contract is that narration is generated only from
// a curated dossier through the Extractor → Evidence Bible → Fact-Fidelity chain, and this prompt
// fictionalizes freely. Letting it write here — and then skipping generate_story on the way to a reel —
// would route around that discipline entirely. (create-reel fails closed the same way.)

const InputSchema = z.object({
  channelId: z.string().uuid(),
  idea: z.string().trim().max(8000).optional(),
})

export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { channelId, idea } = parsed.data

  const gate = await requireChannelOwner(channelId)
  if (gate instanceof NextResponse) return gate
  const user = gate

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  if (channel.storyMode === 'ebn') {
    return NextResponse.json(
      { error: 'This is an Evidence-Based channel — its stories come from a source dossier, so start a reel with one instead.' },
      { status: 400 },
    )
  }

  // Paid call — respect the app-wide kill-switch and the caller's monthly budget before spending.
  const budgetGate = await requireSpendBudget(user)
  if (budgetGate) return budgetGate

  const tone = ToneConfigSchema.safeParse(channel.toneConfig)
  const world = WorldBibleSchema.safeParse(channel.worldBible)
  // targetPlatform is free text on the row (no DB constraint), so index defensively.
  const preset = PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS]

  const { system, userMessage } = buildChannelSamplePrompt({
    name: channel.name,
    nicheDescription: channel.nicheDescription,
    language: (channel.languages[0] ?? 'tagalog').toLowerCase(),
    toneJson: JSON.stringify(tone.success ? tone.data : {}),
    worldJson: JSON.stringify(world.success ? world.data : {}),
    targetSeconds: channel.targetSeconds,
    ...(preset?.hookHint ? { hookHint: preset.hookHint } : {}),
    ...(channel.genreCategory ? { genreCategory: channel.genreCategory } : {}),
    ...(channel.narrativeStyle ? { narrativeStyle: channel.narrativeStyle } : {}),
    ...(channel.narrativeVoice ? { narrativeVoice: channel.narrativeVoice } : {}),
    ...(channel.styleInfluence ? { styleInfluence: channel.styleInfluence as 'light' | 'medium' | 'full' } : {}),
    ...(idea ? { promptHint: idea } : {}),
  })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_SAMPLE_V2_VERSION,
      schema: ChannelSampleSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1500,
    })
    await recordSpendEvent({
      userId: user.id,
      channelId: channel.id,
      surface: 'story_library_generate',
      provider: 'openai',
      costCents: result.costCents,
    })

    const [story] = await db
      .insert(stories)
      .values({
        channelId: channel.id,
        source: 'ai',
        origin: 'library',
        language: (channel.languages[0] ?? 'tagalog').toLowerCase(),
        title: result.data.title.slice(0, 120),
        body: result.data.script,
        // Never a reference: it's written from the same profile the Writer already reads (circular DNA),
        // and as the newest story it would out-rank earned references in few-shot selection.
        isReference: false,
      })
      .returning({ id: stories.id, title: stories.title, body: stories.body })

    return NextResponse.json({ storyId: story!.id, title: story!.title, body: story!.body, costCents: result.costCents })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: user.id, channelId: channel.id, surface: 'story_library_generate', provider: 'openai' })
    console.error('[story/generate] failed:', err)
    return NextResponse.json({ error: 'Story generation failed' }, { status: 502 })
  }
}
