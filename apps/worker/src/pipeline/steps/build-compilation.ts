import { eq, inArray, sql } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { getDb, compilations, reels, stories, assets, channels } from '@reels/db'
import { llmCall, buildInputHash, ElevenLabsTtsProvider, downloadBuffer, uploadBuffer } from '@reels/providers'
import {
  CompilationScriptSchema,
  assertConnectiveTissueLength,
  TimingsSchema,
  DEFAULT_BUDGET_CAPS_CENTS,
  assertBudget,
  PLATFORM_PRESETS,
} from '@reels/core'
import { buildCompilationPrompt, COMPILATION_V1_VERSION } from '../../prompts-bridge.js'

const execFileAsync = promisify(execFile)
const tts = new ElevenLabsTtsProvider()

// build_compilation — manual-trigger step (docs/02 §4 long-form pipeline).
// Input: a compilations row with reel_ids[] already set.
// Generates connective tissue → TTS → assembles reel segments → publishes.

export async function buildCompilation(compilationId: string): Promise<void> {
  const db = getDb()

  const compilation = await db.query.compilations.findFirst({
    where: eq(compilations.id, compilationId),
  })
  if (!compilation) throw new Error(`Compilation not found: ${compilationId}`)

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, compilation.channelId),
  })
  if (!channel) throw new Error('Channel not found')

  // Load the source reels (must be published)
  const sourceReels = await db.query.reels.findMany({
    where: inArray(reels.id, compilation.reelIds),
    with: { story: true },
  })
  if (sourceReels.length < 2) throw new Error('Need at least 2 reels for a compilation')

  // Sort by reel_ids order
  const orderedReels = compilation.reelIds
    .map((id) => sourceReels.find((r) => r.id === id))
    .filter(Boolean) as typeof sourceReels

  // ── Step 1: Generate connective tissue ──────────────────────────────────
  const { system, userMessage } = buildCompilationPrompt({
    channelName: channel.name,
    nicheDescription: channel.nicheDescription,
    genreCategory: channel.genreCategory,
    language: channel.languages[0] ?? 'English',
    storyEntries: orderedReels.map((r) => ({
      title: r.story?.title ?? 'Untitled',
      logline: r.story?.logline ?? '',
      subgenreTags: r.story?.subgenreTags ?? [],
    })),
    theme: compilation.theme ?? 'a themed collection',
  })

  // The recipe covers everything the output actually depends on, not just the reel set: the connective
  // tissue is narrated with the channel's voice, the black segments are cut to the platform's frame, and
  // the body is each source reel's CURRENT render — so re-rendering a constituent reel must invalidate the
  // compilation. Hashing only (reelIds, theme) would leave a stale video standing after any of those.
  const inputHash = buildInputHash(COMPILATION_V1_VERSION, {
    reelIds: compilation.reelIds,
    theme: compilation.theme,
    voiceId: (channel.voicePool as Array<{ providerId?: string }>)[0]?.providerId ?? '',
    targetPlatform: channel.targetPlatform ?? 'all',
    sourceTakes: orderedReels.map((r) => `${r.id}:${r.updatedAt?.getTime() ?? 0}`).join('|'),
  })

  // Idempotency, which this step lacks by not running inside runStep (it's keyed to a compilation, not a
  // reel, and pipeline_steps rows hang off reels). A finished compilation on the same recipe is done —
  // re-triggering it used to re-pay the script LLM plus every connective-tissue TTS call, because the
  // hash was computed and then never compared to anything. `published` counts as finished too: it's where
  // a successful compilation ENDS UP, so omitting it would re-pay for everything on the next trigger.
  const isBuilt = compilation.status === 'approved' || compilation.status === 'published'
  if (compilation.inputHash === inputHash && isBuilt && compilation.renderUrl) {
    console.log(`[compilation] ${compilationId} already built on this recipe — skipping (no re-spend)`)
    return
  }

  // Budget ceiling checked BEFORE any paid call, against LIFETIME spend on this compilation (prior failed
  // attempts included) — the same shape runStep uses for reels. Checking after the calls would let every
  // retry re-pay the full script + TTS and only then refuse to assemble: money spent, never a video.
  assertBudget(compilationId, compilation.costCents, DEFAULT_BUDGET_CAPS_CENTS.compilation)

  // Cost is recorded the moment each call is billed, via an atomic increment. Previously a single absolute
  // SET landed after ffmpeg assembly, so an assembly failure lost every paid call, and a retry OVERWROTE
  // the prior attempt's spend instead of adding to it. `spent` tracks this attempt for the budget assert;
  // the column holds the true lifetime total across attempts.
  let spent = 0
  const addCost = async (cents: number): Promise<void> => {
    if (!(cents > 0)) return
    spent += cents
    await db
      .update(compilations)
      .set({ costCents: sql`${compilations.costCents} + ${cents}`, updatedAt: new Date() })
      .where(eq(compilations.id, compilationId))
  }

  const llm = await llmCall({
    templateVersion: COMPILATION_V1_VERSION,
    schema: CompilationScriptSchema,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })
  await addCost(llm.costCents)

  assertConnectiveTissueLength(llm.data)  // ≤90s guard

  const script = llm.data

  // Persist connective tissue scripts
  await db.update(compilations).set({
    introScript: script.intro_script,
    transitions: script.transitions as never,
    chapterMarks: script.chapter_titles.map((title, i) => ({
      title,
      idx: i,
    })) as never,
    status: 'rendering',
  }).where(eq(compilations.id, compilationId))

  // ── Step 2: TTS all connective tissue segments ────────────────────────────
  const voiceId = (channel.voicePool as Array<{ id: string; providerId: string }>)[0]?.providerId ?? ''
  if (!voiceId) throw new Error('No voice configured for channel')

  // Connective black segments must match the constituent reels' frame (the channel's platform preset).
  const preset = PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all
  const frame = `${preset.width}x${preset.height}`

  const tmp = join(tmpdir(), `compilation-${compilationId}`)
  await mkdir(tmp, { recursive: true })
  try {

  // Narrate intro
  const introTts = await tts.synthesize({ narration: script.intro_script, voiceId, reelId: `comp-${compilationId}-intro` })
  await addCost(introTts.costCents)
  const introBuf = await downloadBuffer(introTts.audioStorageKey)
  const introPath = join(tmp, 'intro.mp3')
  await writeFile(introPath, introBuf)

  // Narrate transitions
  const transitionPaths: string[] = []
  for (let i = 0; i < script.transitions.length; i++) {
    const tr = script.transitions[i]!
    const trTts = await tts.synthesize({ narration: tr.script, voiceId, reelId: `comp-${compilationId}-tr${i}` })
    await addCost(trTts.costCents)
    const trBuf = await downloadBuffer(trTts.audioStorageKey)
    const trPath = join(tmp, `transition_${i}.mp3`)
    await writeFile(trPath, trBuf)
    transitionPaths.push(trPath)
  }

  // Narrate outro
  const outroTts = await tts.synthesize({ narration: script.outro_script, voiceId, reelId: `comp-${compilationId}-outro` })
  await addCost(outroTts.costCents)
  const outroBuf = await downloadBuffer(outroTts.audioStorageKey)
  const outroPath = join(tmp, 'outro.mp3')
  await writeFile(outroPath, outroBuf)

  // All paid work (LLM + TTS) is done. Re-assert on lifetime spend before the (free, local) ffmpeg
  // assembly, so a single attempt that blew through the cap on its own is caught too — the pre-check above
  // is what actually prevents spending; this one catches an overrun within the attempt.
  assertBudget(compilationId, compilation.costCents + spent, DEFAULT_BUDGET_CAPS_CENTS.compilation)

  // ── Step 3: Assemble — concatenate existing reel renders ──────────────────
  const concatParts: string[] = []

  // Intro TTS only (no video for connective tissue in Phase 1 — text overlay or black frame)
  const introVideoPath = join(tmp, 'intro_segment.mp4')
  await makeAudioOnlySegment(introPath, introVideoPath, frame)
  concatParts.push(introVideoPath)

  for (let i = 0; i < orderedReels.length; i++) {
    const reel = orderedReels[i]!
    const reelAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reel.id) })
    const renderAsset = reelAssets.find((a) => a.kind === 'render')
    if (!renderAsset) throw new Error(`No render asset for reel ${reel.id}`)

    const reelBuf = await downloadBuffer(renderAsset.storageKey)
    const reelPath = join(tmp, `reel_${i}.mp4`)
    await writeFile(reelPath, reelBuf)
    concatParts.push(reelPath)

    // Transition between reels (not after the last one)
    if (i < orderedReels.length - 1 && transitionPaths[i]) {
      const trVideoPath = join(tmp, `transition_segment_${i}.mp4`)
      await makeAudioOnlySegment(transitionPaths[i]!, trVideoPath, frame)
      concatParts.push(trVideoPath)
    }
  }

  // Outro
  const outroVideoPath = join(tmp, 'outro_segment.mp4')
  await makeAudioOnlySegment(outroPath, outroVideoPath, frame)
  concatParts.push(outroVideoPath)

  // Concatenate all parts
  const concatListPath = join(tmp, 'concat.txt')
  await writeFile(concatListPath, concatParts.map((p) => `file '${p}'`).join('\n'))

  const outputPath = join(tmp, 'compilation.mp4')
  await execFileAsync('ffmpeg', [
    '-f', 'concat', '-safe', '0', '-i', concatListPath,
    '-c', 'copy',
    '-y', outputPath,
  ])

  // ── Step 4: Build chapter timestamps for YT description ──────────────────
  let cursorMs = 0
  const chapterMarks: Array<{ title: string; startMs: number }> = []

  // Estimate intro duration
  const introDurationMs = Math.ceil(script.intro_script.split(' ').length / 2.5) * 1000
  chapterMarks.push({ title: 'Intro', startMs: 0 })
  cursorMs += introDurationMs

  for (let i = 0; i < orderedReels.length; i++) {
    const reel = orderedReels[i]!
    const timings = reel.timings ? TimingsSchema.safeParse(reel.timings) : null
    const reelDurationMs = timings?.success ? timings.data.durationMs : 60_000

    chapterMarks.push({
      title: script.chapter_titles[i] ?? reel.story?.title ?? `Story ${i + 1}`,
      startMs: cursorMs,
    })
    cursorMs += reelDurationMs

    if (i < orderedReels.length - 1 && script.transitions[i]) {
      cursorMs += Math.ceil(script.transitions[i]!.script.split(' ').length / 2.5) * 1000
    }
  }

  // ── Step 5: Upload + update DB ────────────────────────────────────────────
  const renderBuf = await readFile(outputPath)
  const storageKey = `compilations/${compilationId}/compilation.mp4`
  await uploadBuffer(storageKey, renderBuf, 'video/mp4')

  // costCents is NOT written here — it was already accrued atomically as each call was billed.
  await db.update(compilations).set({
    renderUrl: storageKey,
    chapterMarks: chapterMarks as never,
    status: 'approved',
    inputHash,
    updatedAt: new Date(),
  }).where(eq(compilations.id, compilationId))

  console.log(`[compilation] done: ${compilationId} (${chapterMarks.length} chapters)`)
  } finally {
    // Reclaim the compilation scratch dir (every constituent reel MP4 + narration segments) on success
    // or failure.
    await rm(tmp, { recursive: true, force: true })
  }
}

// Creates a black-frame video segment with audio-only narration (connective tissue)
async function makeAudioOnlySegment(audioPath: string, outputPath: string, frame: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi', '-i', `color=black:s=${frame}:r=30`,
    '-i', audioPath,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-c:a', 'copy',
    '-shortest',
    '-y', outputPath,
  ])
}
