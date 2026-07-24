// One EBN render lap (PAID). Seeds an EBN channel in AUTO mode + a reel with a curated historical dossier,
// enqueues generate_story, and lets the RUNNING worker drive the full chain end-to-end (auto-gate advances
// EBN reels post-Slice-2). Polls the DB until terminal, then downloads the finished render (or, if the
// render stack fails, the furthest illustrative artifact — the scene images persist to R2 either way, so
// the illustrative LOOK is inspectable regardless). Prints per-step progress + total cost.
//
// Prereq: the worker must be running (pnpm --filter worker dev) and postgres+redis up (pnpm db:up).
// Usage: pnpm --filter worker exec tsx scripts/ebn-render-lap.ts
import '../src/env.js'
void (async () => {
  const { getDb, channels, reels, assets, pipelineSteps } = await import('@reels/db')
  const { eq, and, desc } = await import('drizzle-orm')
  const { enqueueStep } = await import('@reels/queue')
  const { downloadBuffer } = await import('@reels/providers')
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const db = getDb()
  const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/a45199ea-ecb0-4139-8c38-2989abf29a04/scratchpad/ebn-lap'
  mkdirSync(OUT, { recursive: true })

  const DOSSIER = `ENCYCLOPEDIA ENTRY: The Tacoma Narrows Bridge, in Washington State, USA, opened on July 1, 1940 and collapsed on November 7, 1940.
ENGINEERING ANALYSIS (Billah & Scanlan, 1991): The bridge collapsed due to aeroelastic flutter — a self-exciting, negatively-damped torsional oscillation in which the deck's own twisting motion drew energy from a steady ~40 mph wind and fed it into an ever-growing twist. It was NOT caused by simple mechanical resonance (an external periodic force matching the bridge's natural frequency); that "resonance" account is a well-known but incorrect textbook explanation.
RECORD: There were no human fatalities in the collapse. The bridge had been nicknamed "Galloping Gertie" because its deck oscillated vertically from the day it opened.`

  // ~35s reel → few scenes → modest cost. Auto mode so the worker runs the whole chain hands-off.
  const [ch] = await db.insert(channels).values({
    name: 'EBN Lap — Galloping Gertie', nicheDescription: 'documentary reconstructions of specific settled public engineering failures',
    languages: ['english'], storyMode: 'ebn', ebnSpecialization: 'historical_events', targetSeconds: 35,
    generationMode: 'auto',
    worldBible: { region: 'Washington State, USA', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} },
    stylePreset: 'gritty documentary still, candid reportage photography, photorealistic', // deliberately PHOTOREAL — proves EBN forcing overrides it
  }).returning()
  const [reel] = await db.insert(reels).values({ channelId: ch!.id, status: 'drafting', language: 'english', dossier: DOSSIER }).returning()
  console.log(`channel=${ch!.id.slice(0, 8)} reel=${reel!.id.slice(0, 8)} (channel style is photoreal on purpose — EBN must override it)`)
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: ch!.id, language: 'english' })
  console.log('enqueued generate_story; polling…\n')

  const TERMINAL = new Set(['approved', 'published', 'failed'])
  const seen = new Set<string>()
  let last = ''
  const started = 1  // logical tick counter (no Date.now in some envs; use loop index)
  for (let i = 0; i < 90; i++) { // ~90 × 10s = 15 min cap
    const r = await db.query.reels.findFirst({ where: eq(reels.id, reel!.id) })
    const steps = await db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.reelId, reel!.id) })
    for (const s of steps) {
      const key = `${s.stepName}:${s.status}`
      if (!seen.has(key)) { seen.add(key); console.log(`  step ${s.stepName} → ${s.status}${s.error ? ` (${String(s.error).slice(0, 120)})` : ''}`) }
    }
    if (r && r.status !== last) { console.log(`  REEL status → ${r.status}${r.alertNote ? ` [${r.alertNote}]` : ''}`); last = r.status }
    if (r && TERMINAL.has(r.status)) break
    await new Promise((res) => setTimeout(res, 10_000))
  }

  const rFinal = await db.query.reels.findFirst({ where: eq(reels.id, reel!.id) })
  const bible = rFinal?.evidenceBible as { facts?: unknown[] } | null
  const allAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reel!.id), orderBy: [desc(assets.createdAt)] })
  console.log(`\n── FINAL ── reel status: ${rFinal?.status}, cost: ${rFinal?.costCents}¢ ($${((rFinal?.costCents ?? 0) / 100).toFixed(2)}), bible facts: ${bible?.facts?.length ?? 0}, assets: ${allAssets.length}`)
  for (const a of allAssets) console.log(`   asset ${a.kind} ${a.storageKey}`)

  // Download the render if present, else the scene images (the illustrative look, persisted either way).
  const render = allAssets.find((a) => a.kind === 'render')
  const images = allAssets.filter((a) => a.kind === 'scene' || a.storageKey.includes('/scenes/') || a.storageKey.endsWith('.webp'))
  try {
    if (render) {
      writeFileSync(`${OUT}/reel.mp4`, await downloadBuffer(render.storageKey))
      console.log(`\n✓ downloaded final render → ${OUT}/reel.mp4`)
    }
    for (const [i, img] of images.slice(0, 6).entries()) {
      writeFileSync(`${OUT}/scene-${i}.webp`, await downloadBuffer(img.storageKey))
    }
    if (images.length) console.log(`✓ downloaded ${Math.min(images.length, 6)} scene image(s) → ${OUT}/scene-*.webp`)
  } catch (err) {
    console.log(`download issue: ${String(err).slice(0, 120)}`)
  }
  console.log(`\n(seeded rows kept for inspection: channel ${ch!.id}, reel ${reel!.id})`)
  process.exit(0)
})()
