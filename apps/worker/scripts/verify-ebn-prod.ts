// One-off verification of the EBN PRODUCTION path (not the probe). Seeds an EBN channel + a reel with a
// real, settled, public-record historical dossier, drives generateStory() exactly as the dispatcher does,
// then reads back what persisted: the frozen Evidence Bible on the reel, the story row + link, and the
// StudioOutput.ebn (citation map + Fact-Fidelity verdict). Also drives a STANDARD channel to confirm the
// fiction path is untouched (no ebn field). Cleans up its own rows. Usage:
//   pnpm --filter worker exec tsx scripts/verify-ebn-prod.ts   (cwd apps/worker)
import '../src/env.js'
void (async () => {
  const { getDb, channels, reels, stories, pipelineSteps } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const { generateStory } = await import('../src/pipeline/steps/generate-story.js')
  const db = getDb()

  const DOSSIER = `ENCYCLOPEDIA ENTRY: The Tacoma Narrows Bridge, in Washington State, USA, opened on July 1, 1940 and collapsed on November 7, 1940.
ENGINEERING ANALYSIS (Billah & Scanlan, 1991): The bridge collapsed due to aeroelastic flutter — a self-exciting, negatively-damped torsional oscillation in which the deck's own twisting motion drew energy from a steady ~40 mph wind and fed it into an ever-growing twist. It was NOT caused by simple mechanical resonance (an external periodic force matching the bridge's natural frequency); that "resonance" account is a well-known but incorrect textbook explanation.
RECORD: There were no human fatalities in the collapse. The bridge had been nicknamed "Galloping Gertie" because its deck oscillated vertically from the day it opened.`

  const cleanup: { channelIds: string[]; reelIds: string[] } = { channelIds: [], reelIds: [] }
  const log = (s: string) => console.log(s)
  let pass = true
  const check = (label: string, ok: boolean, detail = '') => { log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) pass = false }

  try {
    // ── EBN channel + reel ────────────────────────────────────────────────────
    const [ebnCh] = await db.insert(channels).values({
      name: 'VERIFY EBN Historical', nicheDescription: 'documentary reconstructions of specific settled public engineering failures',
      languages: ['english'], storyMode: 'ebn', ebnSpecialization: 'historical_events', targetSeconds: 60,
      worldBible: { region: 'Washington State, USA', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} },
    }).returning()
    cleanup.channelIds.push(ebnCh!.id)
    const [ebnReel] = await db.insert(reels).values({ channelId: ebnCh!.id, status: 'drafting', language: 'english', dossier: DOSSIER }).returning()
    cleanup.reelIds.push(ebnReel!.id)

    log('\n═══ EBN PRODUCTION PATH ═══')
    await generateStory(ebnReel!.id, ebnCh!.id, 'english')

    const reelAfter = await db.query.reels.findFirst({ where: eq(reels.id, ebnReel!.id) })
    const step = await db.query.pipelineSteps.findFirst({ where: eq(pipelineSteps.reelId, ebnReel!.id) })
    const out = step?.output as any
    const story = reelAfter?.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, reelAfter.storyId) }) : null
    const bible = reelAfter?.evidenceBible as any

    check('reel linked to a story + status story_review', !!reelAfter?.storyId && reelAfter?.status === 'story_review', `status=${reelAfter?.status}`)
    check('Evidence Bible frozen on the reel (versioned, has facts)', !!bible && bible.version === 1 && Array.isArray(bible.facts) && bible.facts.length > 0, `v${bible?.version}, ${bible?.facts?.length ?? 0} facts`)
    check('StudioOutput.ebn present with citation map', !!out?.ebn && Array.isArray(out.ebn.citationMap) && out.ebn.citationMap.length > 0, `${out?.ebn?.citationMap?.length ?? 0} cited sentences`)
    check('Fact-Fidelity verdict recorded', out?.ebn?.fidelity?.status === 'ok' || out?.ebn?.fidelity?.status === 'failed', `status=${out?.ebn?.fidelity?.status}`)
    check('story has title + logline (adapter)', !!story?.title && !!story?.logline, `"${story?.title}"`)
    // The real fidelity test: does the generated narration explain the collapse as FLUTTER (from the Bible),
    // not the resonance myth? A wrong causal model here would be the exact failure EBN exists to prevent.
    const body = (story?.body ?? '').toLowerCase()
    // Faithful = flutter is presented as the cause, AND if the resonance myth is mentioned at all it is
    // framed as incorrect/rejected (never asserted as the cause). This is the exact inverse of the
    // original Tacoma failure that motivated EBN.
    const debunksResonance = !body.includes('resonance') || /incorrect|reject|myth|not caused|but wrong|misunderst/.test(body)
    check('narration uses the sourced cause (flutter) + does not assert the resonance myth', body.includes('flutter') && debunksResonance, 'see narration below')
    const stanceOk = Array.isArray(bible?.facts) && bible.facts.some((f: any) => f.stance && f.stance !== 'FACT')
    check('extractor preserved non-FACT stances (not everything flattened to FACT)', stanceOk, bible?.facts?.map((f: any) => f.stance).join(','))

    log(`\n── FROZEN EVIDENCE BIBLE (${bible?.facts?.length ?? 0} facts) ──`)
    for (const f of bible?.facts ?? []) log(`  ${f.id} [${f.stance}/${f.weight}]  ${f.value}`)
    log(`\n── GENERATED EBN STORY ──\n  TITLE: ${story?.title}\n  LOGLINE: ${story?.logline}\n\n${story?.body}`)
    if (out?.ebn?.fidelity?.status === 'ok') {
      log(`\n── FACT-FIDELITY VERDICT ── ${out.ebn.fidelity.issues.length} issue(s)`)
      for (const i of out.ebn.fidelity.issues) log(`    [${i.axis}] ${i.offending} — ${i.detail}`)
    }
    log(`  reel costCents (EBN 4 stages): ${reelAfter?.costCents}`)

    // ── Fiction regression: a standard channel still runs the fiction path, no ebn field ──
    log('\n═══ FICTION REGRESSION (standard channel) ═══')
    const [stdCh] = await db.insert(channels).values({
      name: 'VERIFY Standard', nicheDescription: 'short spooky Filipino urban legends', languages: ['english'],
      storyMode: 'standard', genreCategory: 'horror', targetSeconds: 45,
      worldBible: { region: 'Metro Manila, Philippines', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} },
    }).returning()
    cleanup.channelIds.push(stdCh!.id)
    const [stdReel] = await db.insert(reels).values({ channelId: stdCh!.id, status: 'drafting', language: 'english' }).returning()
    cleanup.reelIds.push(stdReel!.id)
    await generateStory(stdReel!.id, stdCh!.id, 'english')
    const stdStep = await db.query.pipelineSteps.findFirst({ where: eq(pipelineSteps.reelId, stdReel!.id) })
    const stdOut = stdStep?.output as any
    check('standard channel produced a fiction story', !!stdOut?.winner?.narration)
    check('standard channel has NO ebn field (fiction path untouched)', stdOut?.ebn === undefined)
    check('standard channel ran the planner (angleId not ebn)', typeof stdOut?.angleId === 'string' && !String(stdOut.angleId).startsWith('ebn:'), `angleId=${stdOut?.angleId}`)

    log(`\n═══ RESULT: ${pass ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'} ═══`)
  } catch (err) {
    console.error('VERIFY FAILED (threw):', err)
    pass = false
  } finally {
    // Clean up seeded rows (stories cascade via reel link; delete reels then channels).
    for (const id of cleanup.reelIds) await db.delete(reels).where(eq(reels.id, id)).catch(() => {})
    for (const id of cleanup.channelIds) await db.delete(channels).where(eq(channels.id, id)).catch(() => {})
    log('(cleaned up seeded rows)')
  }
  process.exit(pass ? 0 : 1)
})()
