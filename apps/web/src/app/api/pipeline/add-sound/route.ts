import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, stories, scenes } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { llmCall, listVoices, ProviderRateLimitError } from '@reels/providers'
import { OperatorSfxSchema, cueVolumeDb, type OperatorCue } from '@reels/core'
import { buildAddSoundPrompt, AddSoundSchema, ADD_SOUND_V1_VERSION } from '@reels/core/prompts/add-sound.v1'
import { requireReelOwner, requireSpendBudget } from '@/lib/api-access'

const MAX_MANUAL_CUES = 5

function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0
  let n = 0, i = 0
  while ((i = text.indexOf(sub, i)) !== -1) { n++; i++ }
  return n
}

// Add ONE operator-authored sound to a specific scene (manual cue) — e.g. an off-screen voice saying
// "Buti gising ka pa". Separate from the reel-level smart Sound design; both render together.
export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, instruction } = (await req.json().catch(() => ({}))) as { reelId: string; sceneIdx?: number; instruction?: unknown }
  // Must be a non-empty string — a non-string would crash on .trim(). Cap length (it's fed to an LLM).
  if (typeof instruction !== 'string' || !instruction.trim()) {
    return NextResponse.json({ error: 'Describe the sound you want.' }, { status: 400 })
  }
  const instructionText = instruction.trim().slice(0, 1000)

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) return NextResponse.json({ error: 'Reel or story not found' }, { status: 404 })

  const existing = OperatorSfxSchema.parse(reel.operatorSfx ?? [])
  const manualCount = existing.filter((c) => c.source === 'manual').length
  if (manualCount >= MAX_MANUAL_CUES) {
    return NextResponse.json({ error: `You can add up to ${MAX_MANUAL_CUES} per-scene sounds.` }, { status: 400 })
  }

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })
  const scene = sceneIdx != null
    ? await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })
    : null

  try {
    const { system, userMessage } = buildAddSoundPrompt({
      instruction: instructionText,
      sceneText: scene?.narrationText ?? story.body.slice(0, 400),
      fullNarration: story.body,
    })
    const { data } = await llmCall({
      templateVersion: ADD_SOUND_V1_VERSION,
      schema: AddSoundSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 400,
    })

    const hits = countOccurrences(story.body, data.anchor)
    if (hits !== 1) {
      return NextResponse.json(
        { error: hits === 0 ? "Couldn't find where to place that — try naming the exact words it should land on." : 'That spot appears more than once — be a bit more specific.' },
        { status: 422 },
      )
    }

    let voiceId: string | undefined
    if (data.kind === 'speech') {
      if (!data.words?.trim()) return NextResponse.json({ error: 'What should the voice say? Put the words in quotes.' }, { status: 422 })
      const catalog = await listVoices(reel.language, data.voiceSearchKeyword ? { search: data.voiceSearchKeyword } : undefined)
      const pool = data.gender !== 'any' ? catalog.filter((v) => v.gender.toLowerCase() === data.gender) : catalog
      voiceId = (pool[0] ?? catalog[0])?.id
      if (!voiceId) return NextResponse.json({ error: 'No voice available for that — try a different description.' }, { status: 502 })
    }

    const cue: OperatorCue = {
      id: crypto.randomUUID(),
      source: 'manual',
      anchor: data.anchor,
      offsetMs: data.offsetMs ?? 0,
      volumeDb: cueVolumeDb(data.kind),
      kind: data.kind,
      ...(data.kind === 'sfx'
        ? { prompt: data.prompt || instructionText }
        : { words: data.words ?? '', speaker: data.speaker || undefined, delivery: data.delivery || undefined, voiceId }),
    }

    await db.update(reels).set({ operatorSfx: [...existing, cue], updatedAt: new Date() }).where(eq(reels.id, reelId))
    return NextResponse.json({ ok: true, cue })
  } catch (err) {
    if (err instanceof ProviderRateLimitError) return NextResponse.json({ error: 'Busy right now — try again in a moment.' }, { status: 429 })
    return NextResponse.json({ error: 'Could not add that sound — try rephrasing.' }, { status: 502 })
  }
}
