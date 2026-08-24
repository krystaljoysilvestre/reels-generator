# Current Metrics

---

Status: Active

Owner: Finance & Operations Partner

Approver: Founder

Review Frequency: Weekly

Purpose: Living Strategy

Depends On:

* company/metrics.md
* company/roadmap.md
* company/pricing.md

Current Phase (authority: company/roadmap.md):

Phase 0 — Foundation

Last Updated:

2026-08-24

---

## Purpose

This document captures Kendrix's current operating metrics.

Unlike `metrics.md`, which defines timeless measurement philosophy, this document reflects today's reality.

Everything in this document is expected to change as Kendrix evolves.

This weekly review is the heartbeat that feeds the monthly roadmap and metrics reviews.

A metric that is not yet measured says so explicitly. An honest "not yet measured" beats an impressive guess.

---

## Current Phase Objective

Current Goal

Build a reliable storytelling workflow that consistently produces publishable, high-quality stories.

Current Bottleneck

**The retained-publish zero is cleared; repeatability and meaningful audience evidence are now the bottleneck.** Crossroads published *The Urinal Rejected but Immortalized* to YouTube on 2026-08-24 (`6gcyx9bK2mE`) and the public Data API confirmed it is watchable. Fourteen minutes after upload it had 10 views / 0 likes / 0 comments — Kendrix's first non-zero viewer signal, but not enough evidence for a creative intervention. What Kendrix has still never done is repeat the result.

**Correction of record (2026-08-22).** This document briefly recorded *Stories Published: 1*. That was wrong, and the error is instructive. On 2026-08-11 *Edge of Everything* did go public on YouTube through Kendrix's own per-channel authorization path — YouTube issued a real id (`RRvU0b1TFAc`), processed it, and served it publicly. But it was a **proving run for the OAuth path, never intended to stay up**, and the founder took it down. The channel today reports `videoCount: 0` and `viewCount: 0`.

That made the count **0 live, 1 upload proven** at the time — and the two are different things that our metric could not tell apart. On 2026-08-24 the state changed: Kendrix now has **1 live retained publish and 2 uploads proven**. The new reel was checked for public liveness after upload; it does not inherit proof from the existence of a `publications` row alone.

**The zero was not neglect — it was a defect, found and fixed on 2026-08-21.** The performance poller returned at its own first line for ten days. `runMetricsPoll` gated on `isYouTubeConfigured()`, which required an installation-wide `YOUTUBE_REFRESH_TOKEN` — the exact credential the 08-11 per-channel migration replaced. Two sibling callers were stranded the same way: the worker's **auto-publish** was gated on the same dead check *and* called `uploadToYouTube` with no per-channel auth at all (an operator-wide token would have uploaded to whichever account minted it, regardless of which channel asked), and the **Settings gate** hid the auto-publish option on connected channels while offering it on unconnected ones. Every caller now resolves the channel's own grant through one function.

**What remains is observation and repetition, not another system expansion.** The first Crossroads candidate cleared factual/visual-truth, render QA, and independent editorial, visual and sound review; the founder delegated the final call, and it was published as-is. Measurement no longer depends on the publishing grant. Leave reel #1 untouched, run reel #2 through the same workflow, and choose an engineering intervention only after a recurring production failure or meaningful audience pattern appears.

**Scope correction (2026-08-24).** The founder designated **Crossroads** as the sole Customer Zero channel for the current lap. Earlier briefings grouped Crossroads with Lihim ng Nayon as an engineering fixture and pointed the publish gate elsewhere; that operating assumption is retired. The depictive-fidelity, verified-identity and sourced-narrative work run on Crossroads is directly relevant foundation progress. It becomes roadmap proof only when a Crossroads reel stays live and produces an audience reading.

The previous bottleneck — *packaging and surface*, from the 2026-08-10 audit — is **retired as resolved for one Crossroads artifact**. The three named disqualifiers are fixed in the product, the Crossroads reel cleared the taste decision, and it is being left up. This is evidence at n=1, not consistency. Do not read the retained publish as the Phase 0 exit criterion being cleared; repeatability and audience evidence remain open.

Only one primary bottleneck should exist at any given time.

---

## North Star

Current North Star

Customer Zero consistently publishes high-quality stories using Kendrix.

---

## Current Priorities

Priority 1

**Produce Crossroads reel #2 without changing the system.** The retained-publish zero and first non-zero viewer signal were cleared on 2026-08-24. Ten early views do not justify tuning. The next proof is whether the same workflow can produce another artifact we leave up.

Priority 2

**Leave reel #1 untouched and verify the scheduled metrics write.** The public API read 10 views after fourteen minutes. The six-hourly poll should persist that signal without intervention; the 24-hour and seven-day snapshots are the first useful audience observations.

Priority 3

**Then choose the next engineering lap from recurring evidence.** One tiny sample is not a mandate. Act only on a repeated production failure or a meaningful pattern across the retained publishes.

**Demoted from the previous period:**

* *Packaging repair (was Priority 1)* — **confirmed on one retained Crossroads publish.** Thumbnail concept, portrait crop, titles and caption resolution shipped; the current artifact cleared founder-delegated taste review. Repeatability remains unproven.
* *First publish (was Priority 3)* — **complete at n=1.** `6gcyx9bK2mE` is live and intended to stay up. Consistency is the next standard.

---

## Creator Success

| Metric                     | Current | Trend |     Target | Notes |
| -------------------------- | ------: | :---: | ---------: | ----- |
| Stories Published (live)   |       1 |   ↑   |     Weekly | *The Urinal Rejected but Immortalized* → `6gcyx9bK2mE`, public and intended to stay up |
| Uploads Proven             |       2 |   ↑   |          — | One OAuth proving run taken down; one retained Crossroads publish live |
| Publishing Consistency     | Started, n=1 |   ↑   |     Weekly | The zero is cleared; repeat publishing is not yet proven |
| Customer Zero Satisfaction | Publishable once |   ↑   |  Improving | Crossroads cleared the founder-delegated leave-it-up decision. Consistency and audience response remain unresolved |
| Workflow Completion        | Crossroads active · 1 live |   ↑   | Increasing | Full factual/visual-truth → render → review → YouTube path completed. TikTok/Facebook remain manual |
| Audience Evidence          | **10 views · 0 likes · 0 comments** |   ↑   | Meaningful 24h/7d reading | First non-zero signal at +14 minutes; scheduled metrics write still pending |

---

## Product Quality

| Metric               | Current | Trend |     Target | Notes |
| -------------------- | ------: | :---: | ---------: | ----- |
| Editorial Pass Rate  | Not systematically tracked |   →   | 60% first-attempt | Unchanged this period |
| Story Quality Review | No detectable text-level defect |   →   |  Improving | Unchanged. 2026-08-06-003 stands |
| Watched-Reel Quality | Crossroads publishable, 1 kept up |   ↑   |  Improving | Editorial, visual and sound review independently returned publish as-is; no disqualifying issue |
| Packaging Quality | **Cleared on one Crossroads publish** |   ↑   |  Improving | The three named disqualifiers are gone. Ranked cover and post package shipped; YouTube rejected the custom Shorts thumbnail on account eligibility and kept an automatic frame |
| Depictive Fidelity | Enforced in code, verified on a live paid reel |   ↑   |  Holding | Four invariants with unit tests; five defects found and fixed by running it for real. `specs/depictive-fidelity.md` |
| Visual Consistency   | Qualitative only |   →   |  Improving | Visual Director baseline audit still unrun |
| Audio Quality Review | Qualitative only |   →   |  Improving | The cross-register blind ear A/B that gates Phase B has still not been recorded |

---

## Operational Health

| Metric                        | Current | Trend |     Target | Notes |
| ----------------------------- | ------: | :---: | ---------: | ----- |
| Generation Success Rate       | Not yet measured |   →   |       >95% | Two long-form `generate_story` runs were reaped for exceeding the stuck threshold (08-12, 08-17) on a fixture channel — the only reliability signal in the window |
| Average Story Generation Time | Not yet measured |   →   |     Stable |       |
| Average AI Cost per Story     | Crossroads reviewable reels: $6.55–10.63 |   ↑   | Decreasing — never at taste's expense | Published reel: **$10.63**. Exact measured Crossroads reel spend: **$25.20**, including one $0.09 failed start. Other channels are excluded from the active proof metric |
| Production Reliability        | Improving |   ↑   |  Improving | Unattended operation still unproven — and auto-publish could not have run at all until 2026-08-21 |

---

## Business Health

Current phase does not optimize business metrics.

Monitor only.

| Metric             |          Current | Trend | Notes                   |
| ------------------ | ---------------: | :---: | ----------------------- |
| Revenue            |                — |   →   | Informational           |
| Active Creators    |    Customer Zero |   →   | Informational           |
| Willingness to Pay | Not yet measured |   →   | Roadmap phase dependent |
| Fixed Costs        | kendrix.io $50/yr |   →   | Domain, Cloudflare Registrar (2026-08-04-001) |

---

## Active Experiments

Each experiment tests a named assumption in company/assumptions.md.

| Experiment | Hypothesis | Expected Metric Impact | Status |
| ---------- | ---------- | ---------------------- | ------ |
| Packaging repair | The named disqualifiers are packaging, not story, and fixing them changes the publish answer | Stories published 0 → ≥1 | **CLOSED AT n=1 (2026-08-24).** Crossroads cleared the durable leave-it-up decision and published. Repeatability is tracked under publishing consistency, not this repair experiment |
| **The audience is readable** | A published reel's real performance can reach `metrics` and feed few-shot selection without manual logging | Audience evidence 0 → ≥1 | **PARTIALLY CONFIRMED.** The public API returned the first non-zero signal (10 views at +14 minutes). The scheduled database write is still pending; manual readability alone does not close the automation claim |
| Depictive fidelity beyond places | A real subject must be *sourced*, and a real person's face must never be invented | Depictive truth held under real-world subjects | **CLOSED — SHIPPED (2026-08-17).** Graduated to `specs/depictive-fidelity.md`. A third guard was **rejected on measurement**: a lexical "depicts what it doesn't tag" detector scored 1 true positive to 2–3 false, and would have stamped `R.MUTT 1917` on shop-window plumbing |
| Overlay text needs a gate, not guidance | Naming the exact failure in the prompt is enough to stop a thumbnail overlay drifting vaguer than its title | Packaging quality ↑ | **NEGATIVE, n=4 (2026-08-10).** Carried forward unchanged: the fourth independent instance of soft guidance being satisficed, and still no gate built — n=4 does not clear the machinery bar |
| Judge-and-force at the plan level | Structural agency failures are fixed by forced re-planning, not line rewrites | Editorial pass rate ↑ | Built and merged; `STORY_PLAN_GATE` **still unset**, so it has still never run in production. The one published reel does not settle whether it helps |
| Prescribe variation, not shortness | The sentence-rhythm monoculture is self-inflicted by "short lines" prompts | Story quality review ↑ | Shipped (PR #14); children's-validated only. Cross-genre regression sweep still open |

---

## Current Risks

* **The first proof channel is deliberately narrower and technically harder.** Crossroads is the sole evidence source and exercises factual grounding, depictive fidelity and verified identity. It still cleared the first retained publish; do not escape the remaining repeatability and audience questions by switching channels.
* **A per-channel migration that converted one caller left three reading a world that no longer existed.** Fixed for YouTube on 2026-08-21, but the pattern is the risk — TikTok and Facebook are still honest manual destinations, and whatever converts them next should convert every caller in the same commit.
* **Testing-mode OAuth grants expire in seven days**, which taxes every publish. Measurement is now decoupled from this via `YOUTUBE_API_KEY`; **publishing is not**, and cannot be.
* **Every render before 2026-08-21 burned a roaming Kendrix watermark.** Any Crossroads candidate from before that date must be re-rendered before publishing, or the logo ships. The render pass is free (`render` books `costCents: 0`).
* **A metric read "1" when the truth was "0 live, 1 upload proven."** A `publications` row records a successful upload, not a watchable video, and neither the schema nor the weekly briefing distinguished them — so a proving run counted as a publish for eleven days. Any metric whose subject can be *undone by someone else* (a platform, or us) needs its liveness re-checked, not just its creation recorded.
* **Our automated quality instruments do not track the founder's ear.** Standing, and unchallenged this period — no automated instrument predicted that the packaging repair would flip the publish answer.
* **Marketing surface is still ahead of product proof.** Kendrix now has one retained Customer Zero publish, but kendrix.io, the landing page and a four-cut hero trailer imply a repeatable product. One artifact narrows the gap; it does not close it.
* **Unattended reliability is unproven** — and now known to have been unprovable: auto-publish was gated on a credential that no longer existed, so no hands-off lap could have completed its last mile.
* **Long-form auto-publish is still blocked by the YouTube uploader** — whole file held in memory, no resume. Non-issue at short-form sizes; a real blocker at ~1GB.

---

## Key Learnings

From the current period (2026-08-11 → 2026-08-24):

* **A silent `return` is a defect with no symptoms.** The performance poller exited at its first line for ten days. Nothing failed, nothing logged, no dashboard went red — the only evidence was an empty table nobody queried. Any guard that skips work should say that it skipped, and why.
* **A migration converts callers, not concepts.** Per-channel publishing landed on 08-11 for the one path a human clicks. The worker's auto-publish, the performance poller and the Settings gate went on reading an installation-wide token that the same commit had made meaningless — one of them in a way that would have uploaded to the wrong account. When a credential's *ownership* changes, grep for every reader before calling it done.
* **Measure with the weakest credential that suffices.** Public view counts are public data. Reading them through the publishing grant coupled the audience signal to a token that expires in seven days, so the instrument we most needed was the most fragile thing we owned.
* **Name the channel that counts before interpreting its evidence.** Crossroads was previously treated as a fixture and is now the founder-designated Customer Zero channel. Its paid depiction runs were valid foundation evidence all along; from 2026-08-24 forward, its publishing and audience outcomes are the company proof this phase is seeking.
* **"Ask the instrument" generalizes one level out.** The 08-10 lesson was that we left the founder's judgment unread for seven weeks. The audience is the next instrument in the same chain, and we left it unread for ten days — this time because it was broken, which is the harder version of the same failure.
* **A repair confirmed by the instrument that made the complaint is worth more than any judge** — but check that the instrument was actually asked. The packaging lap looked like the first intervention validated that way, and it was not: the founder approving a reel *to prove a code path* is a different act from deciding to leave it up, and I recorded the first as if it were the second.
* **Define a metric by the state it claims, not the event that created it.** "Stories Published" was implemented as "a `publications` row exists", so a proving run that was later deleted counted as a publish for eleven days. The claim was *watchable*; the measurement was *uploaded*.

Carried forward and still standing: craft needs judgment not asking; naming a failure in a prompt does not fix it; a judge that agrees with itself proves nothing; diagnose the layer the complaint lives in; pre-registering the interpretation works; raw writer output ≈ final output.

---

## Decisions Made

Major decisions are recorded in company/decision-log.md; this section lists the period's entries.

* **2026-08-24-001** — Crossroads is the sole Customer Zero channel for the current lap; other channels are excluded from current roadmap progress.
* **2026-08-22-001** — The 08-11 upload was a proving run, not a publish; Stories Published is 0 live, and the metric is redefined by liveness.
* **2026-08-21-002** — Publishing credentials are per channel, everywhere; the operator-wide token path is removed rather than switched off.
* **2026-08-21-001** — The Kendrix watermark comes off our own videos, and the unreachable mechanism is deleted rather than disabled.
* **2026-08-17-001** — Depictive fidelity covers every real subject; a real person's face is never invented; the lexical tag-detector is rejected on measurement.
* **2026-08-11-001** — Publishing accounts are owned per channel (corrected by 2026-08-22-001 on what the upload proved).
* **2026-08-10-001** — The bottleneck was packaging, not story (the decision this period's Priority 1 closed out).

Shipped this period without needing a decision entry: the storyboard cutting room rebuilt to the design spec, the caption system matched to design, per-channel YouTube authorization and direct publish, cover-frame ranking with per-step spend attribution, the saturated-database auth fix, and the access-inbox notification fix.

---

## Next Review

Date

2026-08-28

Questions

* Is a Crossroads reel live right now — and did a real audience number land?
* Did anything counted as done turn out to describe an event rather than a state?
* Was the next engineering lap chosen from evidence, or from prediction?
* Is anything still reading a credential that changed ownership?
* Does the roadmap phase still accurately describe the company?
