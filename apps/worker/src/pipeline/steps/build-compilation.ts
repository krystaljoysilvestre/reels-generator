import { eq, inArray } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { getDb, compilations, reels, stories, assets, channels } from '@reels/db'
import { llmCall, buildInputHash, ElevenLabsTtsProvider, downloadBuffer, uploadBuffer } from '@reels/providers'
import {
  CompilationScriptSchema,
  assertConnectiveTissueLength,
  TimingsSchema,
  DEFAULT_BUDGET_CAPS_CENTS,
  assertBudget,
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
    storyEntries: orderedReels.map((r) => ({
      title: r.story?.title ?? 'Untitled',
      logline: r.story?.logline ?? '',
      subgenreTags: r.story?.subgenreTags ?? [],
    })),
    theme: compilation.theme ?? 'horror encounters',
  })

  const inputHash = buildInputHash(COMPILATION_V1_VERSION, {
    reelIds: compilation.reelIds,
    theme: compilation.theme,
  })

  const llm = await llmCall({
    templateVersion: COMPILATION_V1_VERSION,
    schema: CompilationScriptSchema,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })

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

  const tmp = join(tmpdir(), `compilation-${compilationId}`)
  await mkdir(tmp, { recursive: true })

  // Narrate intro
  const introTts = await tts.synthesize({ narration: script.intro_script, voiceId, reelId: `comp-${compilationId}-intro` })
  const introBuf = await downloadBuffer(introTts.audioStorageKey)
  const introPath = join(tmp, 'intro.mp3')
  await writeFile(introPath, introBuf)

  // Narrate transitions
  const transitionPaths: string[] = []
  for (let i = 0; i < script.transitions.length; i++) {
    const tr = script.transitions[i]!
    const trTts = await tts.synthesize({ narration: tr.script, voiceId, reelId: `comp-${compilationId}-tr${i}` })
    const trBuf = await downloadBuffer(trTts.audioStorageKey)
    const trPath = join(tmp, `transition_${i}.mp3`)
    await writeFile(trPath, trBuf)
    transitionPaths.push(trPath)
  }

  // Narrate outro
  const outroTts = await tts.synthesize({ narration: script.outro_script, voiceId, reelId: `comp-${compilationId}-outro` })
  const outroBuf = await downloadBuffer(outroTts.audioStorageKey)
  const outroPath = join(tmp, 'outro.mp3')
  await writeFile(outroPath, outroBuf)

  // ── Step 3: Assemble — concatenate existing reel renders ──────────────────
  const concatParts: string[] = []

  // Intro TTS only (no video for connective tissue in Phase 1 — text overlay or black frame)
  const introVideoPath = join(tmp, 'intro_segment.mp4')
  await makeAudioOnlySegment(introPath, introVideoPath)
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
      await makeAudioOnlySegment(transitionPaths[i]!, trVideoPath)
      concatParts.push(trVideoPath)
    }
  }

  // Outro
  const outroVideoPath = join(tmp, 'outro_segment.mp4')
  await makeAudioOnlySegment(outroPath, outroVideoPath)
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

  await db.update(compilations).set({
    renderUrl: storageKey,
    chapterMarks: chapterMarks as never,
    status: 'approved',
    costCents: llm.costCents,
  }).where(eq(compilations.id, compilationId))

  console.log(`[compilation] done: ${compilationId} (${chapterMarks.length} chapters)`)
}

// Creates a black-frame video segment with audio-only narration (connective tissue)
async function makeAudioOnlySegment(audioPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi', '-i', 'color=black:s=1080x1920:r=30',
    '-i', audioPath,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-c:a', 'copy',
    '-shortest',
    '-y', outputPath,
  ])
}
