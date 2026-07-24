// Paid ear-A/B: render the Tacoma calm-documentary reel's AUDIO under two arms and capture both mixes for
// a blind listen. A = routing-only (production sound designer, EBN→informational now that routing shipped).
// B = routing + de-bias (SOUND_DEBIAS=1: neutral example + register-first override). Same reel, same
// narration/scenes/voiceover — the only variable is the sound design. Audio only (no video render) to keep
// it cheap. The founder disliked the SOUND, so the mix is what gets judged, not the JSON.
//
// Usage: pnpm --filter worker exec tsx scripts/ebn-audio-ab.ts   (worker DB + fal/ElevenLabs env). ~$0.30–0.60.
import '../src/env.js'
void (async () => {
  const { annotateAudioScript, runComputeTimings, generateSfx, generateMusicStep, mixAudioStep } = await import('../src/pipeline/index.js')
  const { getDb, reels, assets, pipelineSteps } = await import('@reels/db')
  const { eq, and } = await import('drizzle-orm')
  const { downloadBuffer } = await import('@reels/providers')
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const db = getDb()
  const rid = 'a2757168-325b-4436-ba19-8ccbed7d3ec1'
  const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/a45199ea-ecb0-4139-8c38-2989abf29a04/scratchpad/ebn-lap'
  mkdirSync(OUT, { recursive: true })

  // The audio steps are idempotent by inputHash. To force a clean re-run per arm (the design changed),
  // delete this reel's audio step rows before each arm so runStep can't serve a cached mix.
  const AUDIO_STEPS = ['annotate_audio_script', 'compute_timings', 'generate_sfx', 'generate_music', 'mix_audio']
  const clearAudioSteps = async () => {
    for (const s of AUDIO_STEPS) await db.delete(pipelineSteps).where(and(eq(pipelineSteps.reelId, rid), eq(pipelineSteps.stepName, s))).catch(() => {})
  }

  const { existsSync } = await import('node:fs')
  const runArm = async (arm: 'A' | 'B', debias: boolean) => {
    if (existsSync(`${OUT}/audio-${arm}.m4a`)) { console.log(`\n── ARM ${arm}: already rendered, skipping (delete audio-${arm}.m4a to redo) ──`); return }
    if (debias) process.env.SOUND_DEBIAS = '1'
    else delete process.env.SOUND_DEBIAS
    console.log(`\n── ARM ${arm} (SOUND_DEBIAS=${debias ? '1' : 'off'}) ──`)
    // annotate can flake on OpenAI schema/truncation; retry the whole arm a few times.
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { await clearAudioSteps(); await annotateAudioScript(rid); break }
      catch (err) { console.log(`   annotate attempt ${attempt} failed: ${String(err).slice(0, 80)}`); if (attempt === 4) throw err }
    }
    await runComputeTimings(rid)
    await generateSfx(rid)
    await generateMusicStep(rid)
    await mixAudioStep(rid)
    // Report what the sound design chose (the audible A/B lever) + capture the mix.
    const r = await db.query.reels.findFirst({ where: eq(reels.id, rid) })
    const as = r?.audioScript as { music?: { type?: string; moodTags?: string[] } | null; sfx?: { prompt?: string }[]; ambient?: { packTags?: string[] } } | null
    console.log(`   music: ${as?.music ? `${as.music.type} moods=[${(as.music.moodTags ?? []).join(',')}]` : 'null'} · ambient=[${(as?.ambient?.packTags ?? []).join(',')}] · ${as?.sfx?.length ?? 0} sfx`)
    for (const c of as?.sfx ?? []) console.log(`     sfx: "${c.prompt}"`)
    const mix = await downloadBuffer(`reels/${rid}/mix.m4a`)
    writeFileSync(`${OUT}/audio-${arm}.m4a`, mix)
    console.log(`   ✓ mix → ${OUT}/audio-${arm}.m4a (${(mix.length / 1024).toFixed(0)} KB)`)
  }

  await runArm('A', false)
  await runArm('B', true)
  console.log(`\nDone. Two mixes written: audio-A.m4a (routing only) + audio-B.m4a (routing + de-bias).`)
  process.exit(0)
})()
