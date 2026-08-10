// W6 verification — is acquired evidence REAL, or remembered?
//
// The whole design rests on one claim: on an evidence-required channel we can obtain live source
// material, and when we cannot we abstain instead of writing from model memory. That claim cannot be
// verified with a mock, so this runs live and checks the two directions that matter:
//
//   a REAL subject     → sufficient:true, with source URLs that actually resolve
//   a NONSENSE subject → sufficient:false  (the abstain; a padded dossier here is the failure)
//
// The URL check is deliberately a real HEAD request. A model can produce a plausible-looking URL it
// never retrieved, and a fabricated citation is worse than no citation — it launders invention as
// sourcing. Fetching is the only way to tell.
//
// Usage (cwd apps/worker): pnpm exec tsx scripts/verify-evidence-acquisition.ts
// Cost: ~4 search calls, roughly 12-16¢.
import '../src/env.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildEvidenceAcquirePrompt, EvidenceAcquireSchema, EVIDENCE_ACQUIRE_V1_VERSION } = await import(
    '@reels/core/prompts/evidence-acquire.v1'
  )

  const NICHE =
    'Filipino current-events explainers: what happened, why it happened, who is affected, and what is confirmed versus still uncertain.'
  const CASES: { subject: string; expectSufficient: boolean; why: string }[] = [
    { subject: 'The 2018 Boracay island closure and rehabilitation', expectSufficient: true, why: 'well documented' },
    { subject: 'Philippine inflation and rice prices in 2024', expectSufficient: true, why: 'heavily reported' },
    // The abstain cases. Plausible-sounding but non-existent: exactly what a model would be tempted to
    // "remember". A dossier here is a fabricated news story waiting to be produced.
    { subject: 'The Barangay Malinaw levitation incident of 2019', expectSufficient: false, why: 'does not exist' },
    { subject: 'The Philippine government ban on left-handed driving, 2023', expectSufficient: false, why: 'does not exist' },
  ]

  let cost = 0
  let fail = 0
  for (const c of CASES) {
    const p = buildEvidenceAcquirePrompt({
      subject: c.subject,
      channelName: 'NewsTodayPH',
      nicheDescription: NICHE,
      language: 'english',
      allowPeople: true,
    })
    let ok = false
    let detail = ''
    try {
      const r = await llmCall({
        templateVersion: EVIDENCE_ACQUIRE_V1_VERSION,
        schema: EvidenceAcquireSchema,
        webSearch: true,
        system: p.system,
        messages: [{ role: 'user', content: p.userMessage }],
        maxTokens: 2500,
      })
      cost += r.costCents
      const d = r.data
      const sources = d.sources ?? []
      ok = d.sufficient === c.expectSufficient

      if (d.sufficient) {
        // Every claimed URL must actually resolve. A 404 or a DNS failure means the citation was
        // constructed, not retrieved — the exact laundering this check exists to catch.
        // WHAT COUNTS AS REAL. The question is "did this URL exist to be retrieved", not "will it serve
        // an anonymous script". Government and news sites routinely answer 403/405/429 to a bare HEAD
        // from an unknown client — the server ANSWERED, so the URL is real. Only a 404/410 (the path
        // does not exist) or a transport failure (the host does not exist) indicates a constructed URL.
        // An earlier version of this check counted 403 as dead and reported three real PSA/PNA/PIA
        // sources as fabrications; the check was wrong, not the acquisition.
        const REAL_BUT_PROTECTED = new Set([401, 403, 405, 406, 429, 999])
        const probe = async (url: string) => {
          for (const method of ['HEAD', 'GET'] as const) {
            try {
              const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(15000) })
              if (res.status < 400 || REAL_BUT_PROTECTED.has(res.status)) return { live: true, status: res.status }
              if (method === 'GET') return { live: false, status: res.status } // 404/410/5xx after both
            } catch {
              if (method === 'GET') return { live: false, status: 0 } // host unreachable ⇒ invented domain
            }
          }
          return { live: false, status: 0 }
        }
        const checks = await Promise.all(
          sources.slice(0, 4).map(async (s) => ({ url: s.url, ...(await probe(s.url)) })),
        )
        const dead = checks.filter((x) => !x.live)
        detail = `${sources.length} source(s), ${checks.length - dead.length}/${checks.length} real (403/405 = real but bot-protected)`
        if (dead.length > 0) {
          ok = false
          detail += ` — DEAD: ${dead.map((d2) => `${d2.url} (${d2.status || 'unreachable'})`).join(', ')}`
        }
      } else {
        detail = `abstained: ${d.reason || '(no reason given)'}`
        if ((d.dossier ?? '').trim().length > 0) { ok = false; detail += ' — BUT RETURNED A DOSSIER ANYWAY' }
      }
    } catch (err) {
      detail = `threw: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`
    }
    if (!ok) fail++
    console.log(`${ok ? '✓' : '✗'} expect ${c.expectSufficient ? 'SOURCED' : 'ABSTAIN'} (${c.why})`)
    console.log(`   "${c.subject}"`)
    console.log(`   ${detail}`)
  }

  console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`}`)
  console.log(`TOTAL COST: ${cost.toFixed(0)}¢`)
  process.exit(fail === 0 ? 0 : 1)
})()
