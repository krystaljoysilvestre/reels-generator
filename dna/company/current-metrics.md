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

2026-09-04

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

**Product-only workflow completion is now the bottleneck.** Crossroads has four retained, publicly verified
YouTube reels: `6gcyx9bK2mE` (2026-08-24), `DTi3ZhEuPpk` (2026-08-26), `xIeZIn46B_o` (2026-08-29), and
`WCRkYws2Kho` (2026-09-01). That is enough to establish repeated founder-approved production provisionally.
It is not enough to establish product reliability: Reel #4 required operator scripts, queue inspection and manual
salvage after paid motion timeouts and a lost render lock. The active question is whether one fresh short-form reel
can complete through the deployed product with visible failure, safe retry, tenant isolation and intact cost
accounting—without the builder becoming an invisible pipeline stage.

The four live reels keep collecting audience data passively. At the 2026-09-01 04:54 UTC poll they read
**90 / 0 / 0**, **187 / 8 / 0**, **217 / 4 / 0**, and the new reel's **0 / 0 / 0 baseline** respectively.
Those signals remain too small to justify a creative intervention, and a fifth reel is frozen during the ten-day
Phase 0 exit sprint (decision 2026-09-01-001).

**Correction of record (2026-08-22).** This document briefly recorded *Stories Published: 1*. That was wrong, and the error is instructive. On 2026-08-11 *Edge of Everything* did go public on YouTube through Kendrix's own per-channel authorization path — YouTube issued a real id (`RRvU0b1TFAc`), processed it, and served it publicly. But it was a **proving run for the OAuth path, never intended to stay up**, and the founder took it down. The channel today reports `videoCount: 0` and `viewCount: 0`.

That made the count **0 live, 1 upload proven** at the time — and the two are different things that our metric could not tell apart. The four retained Crossroads uploads since then make the current state **4 live retained publishes and 5 uploads proven**. Each retained reel was checked for public liveness after upload; none inherits proof from the existence of a `publications` row alone.

**The zero was not neglect — it was a defect, found and fixed on 2026-08-21.** The performance poller returned at its own first line for ten days. `runMetricsPoll` gated on `isYouTubeConfigured()`, which required an installation-wide `YOUTUBE_REFRESH_TOKEN` — the exact credential the 08-11 per-channel migration replaced. Two sibling callers were stranded the same way: the worker's **auto-publish** was gated on the same dead check *and* called `uploadToYouTube` with no per-channel auth at all (an operator-wide token would have uploaded to whichever account minted it, regardless of which channel asked), and the **Settings gate** hid the auto-publish option on connected channels while offering it on unconnected ones. Every caller now resolves the channel's own grant through one function.

**What remains is a product acceptance lap, not another ordinary production lap.** The active exit gate is one
fresh standard short-form reel completed from invite/sign-in through export in the deployed product, with no
terminal, SQL, one-off script or engineering salvage. Creative review is allowed. Recovery must be creator-visible,
one click, durable-work preserving and cost-idempotent; tenant and spend boundaries must be automated; the
acceptance build must pass lint, typecheck, tests and build. Direct social publishing, billing, teams, long-form and
public-launch polish are outside this gate.

**Gate status on 2026-09-04 — day 4 of 10 working days; the window closes 2026-09-14.** Criterion 5 is met: an
explicit shared-key allowlist, per-resource ownership and real-Postgres suites prove owner access, foreign denial,
foreign resource IDs returning 404, suspended and pending sessions blocked, and reel/user/global spend gates halting
before a paid step starts. Criterion 6 is green on the **consolidated build** (`721a987`), verified 2026-09-04 in CI's environment: clean
typecheck, lint with 0 errors and 6 pre-existing warnings, **696 passing and 1 skipped** of 697 tests across 80
files with all three integration suites present, and a clean production build. Criteria 3 and 4 now have automated proof rather than
mechanism alone: a default-off `FORCE_STEP_FAILURE` boundary induces the 2026-09-01 lost-lock failure as
configuration instead of an intervention, and a real-Postgres suite shows the failure recorded, the
storyboard/retry predicate seeing it, a completed paid step re-entering as a cache hit with no provider call, and
the reel's ledger unmoved across failure and recovery. What remains for both is the live hosted lap
(`specs/phase0-forced-recovery-lap.md`), which the runbook recommends running inside the acceptance reel rather
than paying for a second one — but that lap is blocked until the hosted stack actually runs the build: on
2026-09-04 Railway had no auto-deploy and its worker was still on `fa156da`, without the forced-failure code.
Criteria 1 and 2, the fresh product-only reel, have not started.

**The gate's test command is now also the convenient one (fixed 2026-09-04).** Root `pnpm test` recursed into
`test` scripts, and `apps/web` and `@reels/providers` define only `test:unit`, so the local shorthand exited 0
while running **neither** of criterion 5's integration suites. Root `test` is now `pnpm -r test:unit`, identical
to CI. `TEST_DATABASE_URL` still has to be set or all three integration suites self-skip silently — so read an
acceptance run by whether those suites *appear* (5 + 5 + 3 tests), not by its exit code. A blanket "0 skipped"
would be the wrong rule and briefly was the recorded one: `redis-limiter.test.ts` skips without `REDIS_URL` and
CI provisions no Redis, so a correct CI run reads 696 passing / 1 skipped, and that suite has never run in CI.

**Nine commits since the sprint opened came out of driving the product, not planning it (2026-09-02 → 09-03).**
The load-bearing one is a failure recorder that could not record. `markReelFailed` returned early whenever *any*
row already existed for the step — including a successful substep — so a permanently failed reel never received a
`failed` row. The creator saw no failed phase and Retry had no resume boundary, which is precisely how a stuck reel
became builder-rescue work. Failed attempts are now recorded per step, and the storyboard falls back to the newest
durable row for reels stranded by the old bug. Alongside it: swallowed scene-reshoot failures now surface to the
creator, stale factual identity routing no longer blocks factual storyboards, music survives directed endings (with
ending stems reported by render QA), and the storyboard reports rendered duration instead of planned. These are
reliability repairs on the acceptance path, not new creative architecture.

**Always-on deployment cut over to Railway (2026-09-02).** `app.kendrix.io` now answers from the Railway Hobby
stack in Singapore rather than the founder's Mac: an external probe on 2026-09-03 returned `/api/health` **200**
with Railway edge headers. The accepted topology — one public web service, one private all-role worker, private
Postgres and Redis, existing R2 assets, a $30 usage alert and a $50 monthly compute cap — is recorded in
`specs/phase0-deployment.md`. **Health is the only one of that spec's five canary checks confirmed in writing.**
Operator sign-in, migrated row/spend parity, one queue job surviving a worker restart, and R2 read/write are
unrecorded, so the Cloudflare Tunnel route to the Mac remains the rollback path until they are. Scheduled
production stays disabled until the forced-recovery lap and one fresh product-only acceptance reel clear the
Phase 0 gate.

**Reel #4 publication read (2026-09-01).** *The 31 Million Bottle Decision* (`91ebdcf9`) is founder-approved and publicly verified on YouTube as `WCRkYws2Kho`. The 84.288-second candidate passed render QA after a zero-cost repair reused a stable passage from its already-paid music source so the music-focused `resolve` ending survived the final narration. Its exact accounted reel spend is **$9.32 against an $11.20 cap**: this includes a conservative **$5.60 estimate** for eight submitted 10-second motion calls that timed out before provider usage returned. One verified clip survived; the other two motion beats degraded to their approved stills. A long final upload also lost its BullMQ lock after the graded visual had committed; the operator recovered that durable visual, remuxed the existing audio, range-verified the final 86,476,595-byte object, and ran QA rather than paying or rendering again. **Founder first playback liked the reel and supplied one forward-looking note: future endings need more room after the final word.** Explicit `resolve` tails now hold 2.6s instead of 1.8s; buttons, ring-outs and deliberate silence retain their own bounded shapes. After the seven-day testing-mode grant expired, the founder renewed the Crossroads connection and authorized publication. The guarded upload cost $0, the public API confirmed liveness, and the metrics poll recorded the 0 / 0 / 0 baseline. YouTube rejected the custom Shorts thumbnail on account eligibility and kept an automatic frame. TikTok and Facebook remain manual, so the reel stays `approved` while its YouTube publication is `published`.

**Scope correction (2026-08-24).** The founder designated **Crossroads** as the sole Customer Zero channel for the current lap. Earlier briefings grouped Crossroads with Lihim ng Nayon as an engineering fixture and pointed the publish gate elsewhere; that operating assumption is retired. The depictive-fidelity, verified-identity and sourced-narrative work run on Crossroads is directly relevant foundation progress. It becomes roadmap proof only when a Crossroads reel stays live and produces an audience reading.

The previous bottleneck — *packaging and surface*, from the 2026-08-10 audit — is **retired as resolved for one
Crossroads artifact**. The three named disqualifiers are fixed in the product, the Crossroads reel cleared the
taste decision, and it is being left up. Do not read four retained publishes as Phase 0 exit: product-only
completion, recovery and boundary proof remain open. Audience value continues in observation rather than driving
the sprint.

Only one primary bottleneck should exist at any given time.

---

## North Star

Current North Star

Customer Zero consistently publishes high-quality stories using Kendrix.

---

## Current Priorities

Priority 1

**Run the ten-working-day Phase 0 exit sprint.** Stabilize the current build, prove tenant/cost boundaries and
creator-visible recovery, then complete one fresh short-form acceptance reel entirely through the deployed product.
Day 4 of 10; the window closes 2026-09-14. The evidence is now consolidated: `main` and
`codex/verified-visual-identity` both point at `721a987`, which carries PR #23's suites, the Railway deployment,
the 09-02 reliability repairs and the forced-recovery lap, with all four CI steps green against real Postgres
(696 passing / 1 skipped, all three integration suites present).
The build is unpushed, so the deployed stack is still pre-merge. What remains is the hosted lap and the reel.

Priority 2

**Make failure recoverable without the builder.** Force a provider or queue/render failure, verify the creator sees
the failed phase, and prove Retry resumes from durable outputs without repeating paid work or double-counting cost.
The 2026-09-02 failure-recorder repair is the code this lap has to trust; it is now exercised by an automated
forced-failure suite, and the live hosted lap is the remaining step (`specs/phase0-forced-recovery-lap.md`).

Priority 3

**Keep the four published reels live and observe without producing Reel #5.** Audience polling continues while
the ending ledger stays paused at two of three. Crossroads resumes only as a release canary or deliberate bounded
experiment after the Phase 0 decision.

**Demoted from the previous period:**

* *Crossroads Reel #5 (was Priority 2)* — **paused by founder decision 2026-09-01-001.** Four retained publishes
  provisionally prove repeated production; another artifact does not resolve operator dependence.
* *Packaging repair (was Priority 1)* — **confirmed on one retained Crossroads publish.** Thumbnail concept, portrait crop, titles and caption resolution shipped; the current artifact cleared founder-delegated taste review. Repeatability remains unproven.
* *First publish (was Priority 3)* — **complete at n=1.** `6gcyx9bK2mE` is live and intended to stay up. Consistency is the next standard.

---

## Creator Success

| Metric                     | Current | Trend |     Target | Notes |
| -------------------------- | ------: | :---: | ---------: | ----- |
| Stories Published (live)   |       4 |   ↑   |     Weekly | Four retained Crossroads videos are publicly verified and intended to stay up |
| Uploads Proven             |       5 |   ↑   |          — | One OAuth proving run taken down; four retained Crossroads publishes live |
| Publishing Consistency     | Repeated, n=4 |   ↑   |     Weekly | Four retained publishes prove repetition; sustained weekly cadence is still open |
| Customer Zero Satisfaction | Founder-approved four times |   ↑   |  Improving | All four approved artifacts are live on YouTube; audience value remains unresolved |
| Workflow Completion        | Crossroads active · 4 live |   ↑   | Increasing | Full factual/visual-truth → render → review → YouTube path repeated. TikTok/Facebook remain manual |
| Audience Evidence          | **#1: 90 / 0 / 0 · #2: 187 / 8 / 0 · #3: 217 / 4 / 0 · #4: 0 / 0 / 0 baseline** |   ↑   | Meaningful 24h/7d reading | 2026-09-01 04:54 UTC poll. Four public videos remain too small a sample for a creative intervention |

---

## Product Quality

| Metric               | Current | Trend |     Target | Notes |
| -------------------- | ------: | :---: | ---------: | ----- |
| Editorial Pass Rate  | Not systematically tracked |   →   | 60% first-attempt | Unchanged this period |
| Story Quality Review | No detectable text-level defect |   →   |  Improving | Unchanged. 2026-08-06-003 stands |
| Watched-Reel Quality | Four founder-approved and live |   ↑   |  Improving | Reel #4 was liked on first playback and needed no semantic or delivery repair |
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
| Average AI Cost per Story     | Crossroads retained reels: $5.21–10.63 |   ↓   | Decreasing — never at taste's expense | The lowest retained reel is **$5.21**; Reel #4 is **$9.32**, including a conservative $5.60 timeout estimate, so failed paid calls remain visible rather than reading as free. Other channels are excluded from the active proof metric |
| Production Reliability        | Four approved artifacts live |   →   |  Improving | Reel #4 completed only through bounded operator recovery: two motion scenes degraded to stills, and a durable visual was salvaged after a render-upload queue-lock failure. In-product Retry now has a resume boundary for stranded reels (2026-09-02), but the forced lap that would prove it is unrun. Unattended operation and multi-destination publishing remain unproven |

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
| **Phase 0 product-only acceptance** | The deployed product can complete and recover one standard short-form reel without its builder becoming a hidden stage | Workflow completion and production reliability ↑ | **ACTIVE — day 4 of 10 (2026-09-04).** One consolidated build (`721a987`) now carries the tenancy, spend and forced-recovery suites, the Railway deployment and the reliability repairs, all four CI steps green with every integration suite present (5+5+3). The live recovery lap and the fresh product-only reel have not run |
| Packaging repair | The named disqualifiers are packaging, not story, and fixing them changes the publish answer | Stories published 0 → ≥1 | **CLOSED AT n=1 (2026-08-24).** Crossroads cleared the durable leave-it-up decision and published. Repeatability is tracked under publishing consistency, not this repair experiment |
| **The audience is readable** | A published reel's real performance can reach `metrics` and feed few-shot selection without manual logging | Audience evidence 0 → ≥1 | **CONFIRMED (2026-08-26).** One scheduled poll read both public videos through `YOUTUBE_API_KEY`, appended both time-series rows, and refreshed both reel snapshots without manual logging. Reel #1 read 81 views; reel #2 established its immediate zero baseline |
| Depictive fidelity beyond places | A real subject must be *sourced*, and a real person's face must never be invented | Depictive truth held under real-world subjects | **CLOSED — SHIPPED (2026-08-17).** Graduated to `specs/depictive-fidelity.md`. A third guard was **rejected on measurement**: a lexical "depicts what it doesn't tag" detector scored 1 true positive to 2–3 false, and would have stamped `R.MUTT 1917` on shop-window plumbing |
| Overlay text needs a gate, not guidance | Naming the exact failure in the prompt is enough to stop a thumbnail overlay drifting vaguer than its title | Packaging quality ↑ | **NEGATIVE, n=4 (2026-08-10).** Carried forward unchanged: the fourth independent instance of soft guidance being satisficed, and still no gate built — n=4 does not clear the machinery bar |
| Judge-and-force at the plan level | Structural agency failures are fixed by forced re-planning, not line rewrites | Editorial pass rate ↑ | Built and merged; `STORY_PLAN_GATE` **still unset**, so it has still never run in production. Four published reels do not settle whether it helps |
| Prescribe variation, not shortness | The sentence-rhythm monoculture is self-inflicted by "short lines" prompts | Story quality review ↑ | Shipped (PR #14); children's-validated only. Cross-genre regression sweep still open |

---

## Current Risks

* **The builder is still an invisible pipeline stage.** Four retained Crossroads publishes prove creative production,
  but Reel #4 completed only after scripts, queue inspection and manual durable-artifact recovery. Until the same
  class of failure is visible and recoverable in-product, another creator cannot reproduce the founder's outcome.
  The 09-02 failure-recorder repair removes one known cause; the lap that would prove it has not run.
* **The acceptance build exists and is pushed; the hosted stack is not running it** (certain / high). Resolved
  half-way on 2026-09-04: `e3f8c9b` carries criterion 5's suites, the deployment work, the reliability repairs and
  the forced-recovery lap, all four CI steps pass locally against real Postgres, and GitHub CI passed
  independently on `main`. But Railway has **no auto-deploy** — `web` runs `fb53e7d` and `worker` runs `fa156da`,
  so the hosted worker has no forced-failure code at all. A lap run today would arm a variable nothing reads and
  return a clean reel that proved neither criterion 3 nor 4. Redeploy both services before the lap.
* **Build identity is fixed in code and unverified hosted** (certain / low). Until 2026-09-04 `/api/health`
  returned only `{"ok": true}`, so "the acceptance reel ran on the verified build" rested on remembering a manual
  deploy — and that memory had already failed for two services. Health now reports the stamped commit, the worker
  logs its own on boot, and `scripts/deploy-railway.sh` refuses a dirty or unpushed tree and polls until the
  service confirms the commit. All of it is green locally and none of it has run against Railway; the first
  deploy through the script is the proof. Same event-versus-state family as the `publications` row that counted a
  deleted upload as a publish.
* **Three and a half of the five hosted canary checks are still unrun** (certain / medium). `app.kendrix.io`
  resolves to Railway while `specs/phase0-deployment.md` says the local tunnel holds until sign-in, data parity,
  queue-restart survival and R2 access pass. A canary log now exists in that spec rather than the checks living in
  memory: health passes and anonymous access is correctly refused. Sign-in completing, row/spend parity, queue
  survival and R2 read/write must run **after** the redeploy, or they certify a build that will not produce the
  acceptance reel.
* **The first proof channel is deliberately narrower and technically harder.** Crossroads remains the sole Customer
  Zero evidence source and exercises factual grounding, depictive fidelity and verified identity. Its four live reels
  continue collecting audience evidence while new production is paused for the Phase 0 exit sprint.
* **Evidence acquisition marks thin dossiers sufficient, and its quality is not stable across runs.** Reel #2's first dossier contained only two secondary sources and was marked sufficient; the story gate caught unsupported death claims and the candidate was rejected for $0.10 before visual spend. Reel #3's pre-production acquisition (2026-08-27, three runs at 2¢) sharpened this: a subject phrased around the *anecdote* returned Wikipedia plus a content-farm blog; the same subject phrased around the *records* returned two primary 1912 inquiry transcripts from titanicinquiry.org; a second run of that identical phrasing returned a fandom wiki instead. A sixth direct observation on 2026-08-31 repeated the failure: despite readily available FDA primary history for the 1982 Tylenol recall, acquisition returned only the Washington Post and PBS in its source list, relied on unlisted Wikipedia citations for three facts, compressed the death chronology, and still reported `sufficient: true`; the operator rejected it before reel creation. **All six results reported `sufficient: true`.** So the variable is not only how the operator names the subject — it is also run-to-run luck in live search. This is now recurring rather than a single occurrence, and it is cheap to see (2¢, before any reel exists). It still does not justify new machinery: the operator can read the dossier before spending, and the story gate has caught the failure downstream both times. What it does justify is never creating an evidence-required reel without looking at the dossier first.
* **A truth-safe board can still need source curation at Gate 2.** Reel #2's automated gates rejected invented memo staging and misleading orbital diagrams, but two surviving generated beats were not publishable. Replacing them with verified public-domain Apollo media produced the approved board. Reel #4 repeated the instrument gap in a different form: visual-truth QA passed six synthetic frames containing fabricated Tylenol labels or official-document text. Manual review rejected them; targeted conceptual replacements added $0.50 and cleared the board without touching the four safe frames. The gate is necessary but not sufficient for depicted text and branding, and manual storyboard review remains load-bearing.
* **A provider timeout is not evidence of zero cost, and a queue failure is not evidence that no artifact exists.** Reel #4 submitted nine 10-second motion calls across the bounded retry set; one returned a verified clip and eight timed out without usage. The ledger conservatively attributes all eight at the documented $0.07/sec rate ($5.60) instead of making the failures look free. Later, the render job lost its BullMQ lock after `visual.mp4` had committed but before `render.mp4` and the asset row did. Inspecting the durable boundary recovered the finished visual and avoided another frame pass. This is one operational lap, not yet a mandate for new machinery, but both failure modes must stay visible in unit economics and reliability evidence.
* **A per-channel migration that converted one caller left three reading a world that no longer existed.** Fixed for YouTube on 2026-08-21, but the pattern is the risk — TikTok and Facebook are still honest manual destinations, and whatever converts them next should convert every caller in the same commit.
* **Testing-mode OAuth grants expire in seven days**, which taxes every publish. Measurement is now decoupled from this via `YOUTUBE_API_KEY`; **publishing is not**, and cannot be.
* **Every render before 2026-08-21 burned a roaming Kendrix watermark.** Any Crossroads candidate from before that date must be re-rendered before publishing, or the logo ships. The render pass is free (`render` books `costCents: 0`).
* **A metric read "1" when the truth was "0 live, 1 upload proven."** A `publications` row records a successful upload, not a watchable video, and neither the schema nor the weekly briefing distinguished them — so a proving run counted as a publish for eleven days. Any metric whose subject can be *undone by someone else* (a platform, or us) needs its liveness re-checked, not just its creation recorded.
* **Our automated quality instruments do not track the founder's ear.** Standing, and unchallenged this period — no automated instrument predicted that the packaging repair would flip the publish answer.
* **Marketing surface is still ahead of product proof.** Kendrix now has four retained Customer Zero publishes, but kendrix.io, the landing page and a four-cut hero trailer imply a reliably repeatable product with audience value. Four artifacts narrow the gap; they do not close it.
* **Unattended reliability is unproven** — and now known to have been unprovable: auto-publish was gated on a credential that no longer existed, so no hands-off lap could have completed its last mile.
* **Long-form auto-publish is still blocked by the YouTube uploader** — whole file held in memory, no resume. Non-issue at short-form sizes; a real blocker at ~1GB.

---

## Key Learnings

From the current period (2026-08-11 → 2026-09-03):

* **A silent `return` is a defect with no symptoms.** The performance poller exited at its first line for ten days. Nothing failed, nothing logged, no dashboard went red — the only evidence was an empty table nobody queried. Any guard that skips work should say that it skipped, and why.
* **A migration converts callers, not concepts.** Per-channel publishing landed on 08-11 for the one path a human clicks. The worker's auto-publish, the performance poller and the Settings gate went on reading an installation-wide token that the same commit had made meaningless — one of them in a way that would have uploaded to the wrong account. When a credential's *ownership* changes, grep for every reader before calling it done.
* **Measure with the weakest credential that suffices.** Public view counts are public data. Reading them through the publishing grant coupled the audience signal to a token that expires in seven days, so the instrument we most needed was the most fragile thing we owned.
* **Name the channel that counts before interpreting its evidence.** Crossroads was previously treated as a fixture and is now the founder-designated Customer Zero channel. Its paid depiction runs were valid foundation evidence all along; from 2026-08-24 forward, its publishing and audience outcomes are the company proof this phase is seeking.
* **"Ask the instrument" generalizes one level out.** The 08-10 lesson was that we left the founder's judgment unread for seven weeks. The audience is the next instrument in the same chain, and we left it unread for ten days — this time because it was broken, which is the harder version of the same failure.
* **A repair confirmed by the instrument that made the complaint is worth more than any judge** — but check that the instrument was actually asked. The packaging lap looked like the first intervention validated that way, and it was not: the founder approving a reel *to prove a code path* is a different act from deciding to leave it up, and I recorded the first as if it were the second.
* **Define a metric by the state it claims, not the event that created it.** "Stories Published" was implemented as "a `publications` row exists", so a proving run that was later deleted counted as a publish for eleven days. The claim was *watchable*; the measurement was *uploaded*.
* **A green test run can prove less than it looks like.** Root `pnpm test` exited 0 while skipping both the tenancy
  and spend integration suites — one because `apps/web` has no `test` script, the other because it self-skips
  without `TEST_DATABASE_URL`. A skip that reports success is the poller's silent `return` wearing a green check.
* **A failure that records nothing is not only invisible — it is unretriable.** `markReelFailed` skipped its insert
  whenever the step already had any row, so the reels that most needed in-product recovery were the ones the product
  could not describe. Same family as the poller's silent `return`: a cheap guard, and a human left as the recovery
  path.
* **Driving the product finds what reviewing it does not.** Nine commits in two days — a swallowed reshoot error,
  stale factual identity routing, endings that lost their music, a duration the UI never showed — came from
  operating the workflow end to end rather than reading it.
* **Timeouts and lost locks make the boundary, not the exception string, the source of truth.** Reel #4's motion exceptions concealed potentially billable submitted work, while its render exception concealed a complete graded visual already stored durably. Account the former conservatively; inspect and reuse the latter before retrying expensive work.

* **An armed switch proves nothing if the code that reads it was never deployed.** The forced-failure boundary
  was committed, tested against real Postgres and pushed, and CI passed — while the hosted worker still ran a
  build from two days earlier that contained none of it. Setting `FORCE_STEP_FAILURE` there would have produced a
  clean reel and a false gate pass. Configuration is only evidence about the build that can read it, so a lap has
  to establish which commit is running before it establishes anything else.
* **A deploy you have to remember is a deploy that drifts.** Railway has no auto-deploy, and its two services had
  silently diverged by two days and two critical commits. Nothing was broken and nothing reported it — the same
  shape as the poller's silent `return`, one layer out in the infrastructure.

Carried forward and still standing: craft needs judgment not asking; naming a failure in a prompt does not fix it; a judge that agrees with itself proves nothing; diagnose the layer the complaint lives in; pre-registering the interpretation works; raw writer output ≈ final output.

---

## Decisions Made

Major decisions are recorded in company/decision-log.md; this section lists the period's entries.

* **2026-09-01-001** — Freeze Reel #5; make a product-only Phase 0 acceptance lap the active work, then use Crossroads as a release canary.
* **2026-08-31-001** — Retire the cited EBN Editor mechanism after the preregistered probe failed its hard contract on 8/9 Editor outputs.
* **2026-08-25-003** — The story chooses its ending function; short-form does not mean a universal moral, CTA, or hard-stop.
* **2026-08-25-002** — Factual Shorts end on one complete human payoff; archival callbacks stay visual when speaking them would create a second ending.
* **2026-08-25-001** — Ending meaning belongs to sound direction, not renderer-invented genre tails or post-mux repair.
* **2026-08-24-001** — Crossroads is the sole Customer Zero channel for the current lap; other channels are excluded from current roadmap progress.
* **2026-08-22-001** — The 08-11 upload was a proving run, not a publish; Stories Published is 0 live, and the metric is redefined by liveness.
* **2026-08-21-002** — Publishing credentials are per channel, everywhere; the operator-wide token path is removed rather than switched off.
* **2026-08-21-001** — The Kendrix watermark comes off our own videos, and the unreachable mechanism is deleted rather than disabled.
* **2026-08-17-001** — Depictive fidelity covers every real subject; a real person's face is never invented; the lexical tag-detector is rejected on measurement.
* **2026-08-11-001** — Publishing accounts are owned per channel (corrected by 2026-08-22-001 on what the upload proved).
* **2026-08-10-001** — The bottleneck was packaging, not story (the decision this period's Priority 1 closed out).

Shipped this period without needing a decision entry: the storyboard cutting room rebuilt to the design spec, the caption system matched to design, per-channel YouTube authorization and direct publish, cover-frame ranking with per-step spend attribution, the saturated-database auth fix, and the access-inbox notification fix.

Operational compatibility fix this period: OpenAI's retired search-preview model was replaced by the Responses API `web_search` tool on `gpt-4.1-mini`; its fixed input-token floor and per-call search fee are now included in spend accounting.

---

## Next Review

Date

At the Phase 0 acceptance lap, or 2026-09-15 if the gate has not cleared

Questions

* Did one fresh short-form reel complete through the deployed product without engineering intervention?
* Did a forced failure surface clearly and recover in one click without repeating paid work or cost?
* Are tenant isolation, suspended-user, storage-ownership and spend-boundary checks automated and green?
* Are lint, typecheck, tests and production build green on the acceptance build?
* Does the founder approve Phase 0 → Phase 1, or which single failed criterion remains the bottleneck?
