// Read-only report: first-attempt gate pass rate across generate_story runs — makes the ratified
// "60% flip trigger" (final gate gets teeth once first-attempt pass ~60%) MEASURABLE. Today gate
// verdicts live only inside pipeline_steps.output JSON (StudioOutput.gate); nothing aggregates them.
//
// Usage: pnpm --filter worker exec tsx scripts/gate-pass-rate.ts [windowDays=30]
//   (cwd apps/worker so ../src/env.js finds the root .env.local; needs the local DB up)
//
// Definitions (from StudioOutput in src/pipeline/steps/generate-story.ts):
//   a row COUNTS iff output.mode==='studio' && output.gate.status==='ok' && verdicts.length>0
//   first-attempt pass := verdicts[0].pass   (the pre-retry verdict; verdicts[1] exists only on a fail+retry)
//   final pass          := verdicts[last].pass
// gate.status==='failed' (the gate call errored) is reported separately and EXCLUDED from the denominator.
//
// CAVEAT: runStep OVERWRITES the (reelId, 'generate_story') row on each regeneration round, so each reel
// contributes only its LATEST round's verdicts — earlier rounds are not recoverable here. Acceptable for
// the trigger, which measures the CURRENT chain's first-attempt rate. Zero writes; selects only.
import '../src/env.js'

interface GateOk {
  status: 'ok'
  version: string
  verdicts: Array<{ pass: boolean; reason: string }>
  retried: boolean
}
interface StudioOutputShape {
  mode?: string
  plannerStatus?: string
  gate?: GateOk | { status: 'failed'; error: string }
}

interface Tally {
  n: number // rows that count (studio + gate ok + verdicts present)
  firstPass: number
  finalPass: number
  retried: number
  gateErrors: number // gate.status==='failed' — excluded from n
  plannerFallbacks: number
}

function emptyTally(): Tally {
  return { n: 0, firstPass: 0, finalPass: 0, retried: 0, gateErrors: 0, plannerFallbacks: 0 }
}

function pct(num: number, den: number): string {
  return den === 0 ? '—' : `${Math.round((num / den) * 100)}%`
}

function row(scope: string, t: Tally) {
  return {
    scope,
    n: t.n,
    firstPass: t.firstPass,
    firstPassPct: pct(t.firstPass, t.n),
    finalPassPct: pct(t.finalPass, t.n),
    retriedPct: pct(t.retried, t.n),
    gateErrors: t.gateErrors,
    plannerFallbacks: t.plannerFallbacks,
  }
}

void (async () => {
  const windowDays = Number(process.argv[2] ?? 30) || 30
  const { getDb, pipelineSteps, reels, channels } = await import('@reels/db')
  const { and, eq, gte } = await import('drizzle-orm')
  const db = getDb()

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      output: pipelineSteps.output,
      finishedAt: pipelineSteps.finishedAt,
      startedAt: pipelineSteps.startedAt,
      channelName: channels.name,
      genre: channels.genreCategory,
    })
    .from(pipelineSteps)
    .innerJoin(reels, eq(pipelineSteps.reelId, reels.id))
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(and(eq(pipelineSteps.stepName, 'generate_story'), gte(pipelineSteps.startedAt, cutoff)))

  const overall = emptyTally()
  const byChannel = new Map<string, Tally>()
  const byGenre = new Map<string, Tally>()
  const bump = (m: Map<string, Tally>, k: string) => m.get(k) ?? m.set(k, emptyTally()).get(k)!

  for (const r of rows) {
    const out = r.output as StudioOutputShape | null
    if (!out || out.mode !== 'studio' || !out.gate) continue

    const ch = bump(byChannel, r.channelName ?? '(unknown)')
    const ge = bump(byGenre, r.genre ?? '(unknown)')

    if (out.plannerStatus === 'failed_fell_back_to_v1_draft' || out.plannerStatus === 'failed_direct_writer') {
      overall.plannerFallbacks++
      ch.plannerFallbacks++
      ge.plannerFallbacks++
    }

    if (out.gate.status === 'failed') {
      overall.gateErrors++
      ch.gateErrors++
      ge.gateErrors++
      continue
    }

    const verdicts = out.gate.verdicts
    if (!Array.isArray(verdicts) || verdicts.length === 0) continue

    const firstPass = verdicts[0]!.pass === true
    const finalPass = verdicts[verdicts.length - 1]!.pass === true
    const retried = out.gate.retried === true

    for (const t of [overall, ch, ge]) {
      t.n++
      if (firstPass) t.firstPass++
      if (finalPass) t.finalPass++
      if (retried) t.retried++
    }
  }

  const sortByN = (m: Map<string, Tally>) => [...m.entries()].sort((a, b) => b[1].n - a[1].n)

  console.log(`\ngenerate_story gate outcomes — last ${windowDays} days (${rows.length} step rows scanned)\n`)
  console.table([
    row('OVERALL', overall),
    ...sortByN(byChannel).map(([k, t]) => row(`channel: ${k}`, t)),
    ...sortByN(byGenre).map(([k, t]) => row(`genre: ${k}`, t)),
  ])

  const belowSample = overall.n < 20 ? '; n<20 — below minimum sample' : ''
  const met = overall.n >= 20 && overall.n > 0 && overall.firstPass / overall.n >= 0.6
  console.log(
    `\n60% FLIP TRIGGER: ${met ? 'MET' : 'NOT MET'} — first-attempt ${pct(overall.firstPass, overall.n)} ` +
      `(n=${overall.n}, last ${windowDays} days${belowSample})`,
  )
  console.log(
    `(gate errors excluded from denominator: ${overall.gateErrors}; planner fallbacks: ${overall.plannerFallbacks})\n`,
  )
  process.exit(0)
})()
