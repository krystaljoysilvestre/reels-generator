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

2026-08-22

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

**The publish loop does not close.** We can publish — once, on 2026-08-11 — and we have never repeated it, and we have never read a single number back from a real viewer.

**Correction of record (2026-08-22).** This document briefly recorded *Stories Published: 1*. That was wrong, and the error is instructive. On 2026-08-11 *Edge of Everything* did go public on YouTube through Kendrix's own per-channel authorization path — YouTube issued a real id (`RRvU0b1TFAc`), processed it, and served it publicly. But it was a **proving run for the OAuth path, never intended to stay up**, and the founder took it down. The channel today reports `videoCount: 0` and `viewCount: 0`.

So the count is **0 live, 1 upload proven** — and the two are different things that our metric could not tell apart. A `publications` row records that an upload *succeeded*, not that a video is *watchable*, and nothing in the schema or the briefing distinguished them. **Kendrix has never published a reel intended to stay up.** That is the real state, and it is a stronger statement than "published once and did not repeat."

**The zero was not neglect — it was a defect, found and fixed on 2026-08-21.** The performance poller returned at its own first line for ten days. `runMetricsPoll` gated on `isYouTubeConfigured()`, which required an installation-wide `YOUTUBE_REFRESH_TOKEN` — the exact credential the 08-11 per-channel migration replaced. Two sibling callers were stranded the same way: the worker's **auto-publish** was gated on the same dead check *and* called `uploadToYouTube` with no per-channel auth at all (an operator-wide token would have uploaded to whichever account minted it, regardless of which channel asked), and the **Settings gate** hid the auto-publish option on connected channels while offering it on unconnected ones. Every caller now resolves the channel's own grant through one function.

**What remains is a two-minute human action, not a build.** The 08-11 grant was minted under a Testing-mode OAuth app, so it lapsed around 08-18; the poller now says so on the connection instead of returning silently. Measurement no longer has to depend on it: a `YOUTUBE_API_KEY` reads public view counts with no grant at all.

**Where the ten days went.** Depictive fidelity beyond places — real people, objects and animals — plus the storyboard cutting room, the caption system, the saturated-database auth fix and the watermark removal. Real work, correctly classified as a foundation. **But every lap of it was verified on Crossroads and Lihim ng Nayon, the two channels the founder disregards as evidence.** The two channels that do count were untouched from 08-12 onward.

The previous bottleneck — *packaging and surface*, from the 2026-08-10 audit — is **retired as resolved on its mechanical half only**. The three named disqualifiers are fixed, and the reel that followed was good enough for the founder to approve and send through the pipe. What has *not* happened is the durable version of the question: **nobody has yet decided to leave a Kendrix reel up.** Do not read the 08-11 upload as the publish bar being cleared; read it as the plumbing being proven.

Only one primary bottleneck should exist at any given time.

---

## North Star

Current North Star

Customer Zero consistently publishes high-quality stories using Kendrix.

---

## Current Priorities

Priority 1

**Publish one reel that stays up.** This is the whole gate, and everything downstream is waiting behind it. **Emberlight** is the nearest candidate: `spot_check`, finished render, full packaging repair already applied (cover plus *"A Ladder for Stars"*). Three steps — re-render it (free: the watermark left the render fingerprint, and `render` books `costCents: 0`, so the pass costs nothing and removes the logo), watch it and decide, then connect that channel to YouTube and post. The connection step is not friction to route around; it is Phase 1's *"repeat the workflow without setup assistance"*, asked for real on a second channel.

Priority 2

**The first audience number, which now arrives by itself.** No work is pending here — this is a consequence, not a task. The poller was repaired on 2026-08-21, `YOUTUBE_API_KEY` is configured and verified against a control video, and the schedule runs every six hours needing no OAuth grant. Within a day of anything going live, real views, likes and comments land in `metrics` as **the first external evidence in the company's history.** Until then every instrument we own is internal: judges, gates, and the founder's eye.

Priority 3

**Then choose the next engineering lap from what the numbers say.** Deliberately unassigned, on the same principle that made the 2026-08-10 audit work: the seat is chosen by evidence, not by prediction.

**Demoted from the previous period:**

* *Packaging repair (was Priority 1)* — **mechanically done; the taste half is untested.** Thumbnail concept, portrait-crop defect, titles and legacy caption re-resolution all shipped, and the reel that followed was approved and uploaded. Whether it clears the bar as a post someone leaves up is a question that has not been asked yet.
* *First publish (was Priority 3)* — **the path is proven; the act is not.** Folded into Priority 1, restated as a reel that stays live.

---

## Creator Success

| Metric                     | Current | Trend |     Target | Notes |
| -------------------------- | ------: | :---: | ---------: | ----- |
| Stories Published (live)   |       0 |   →   |     Weekly | **The metric that counts.** A reel a viewer can watch right now. Never yet achieved |
| Uploads Proven             |       1 |   ↑   |          — | *Edge of Everything* → `RRvU0b1TFAc`, 2026-08-11: real id, processed, served publicly, then taken down as the proving run it was. The publish PATH is demonstrated end-to-end |
| Publishing Consistency     | Not yet started |   →   |     Weekly | Cannot begin before the first reel stays up |
| Customer Zero Satisfaction | Unresolved |   →   |  Improving | The three named disqualifiers are fixed and a reel was approved. Nobody has yet decided to leave one up, which is the question that matters |
| Workflow Completion        | 2 rendered · 1 approved · 0 live |   →   | Increasing | Emberlight `spot_check`, Edge of Everything `approved`. Disregarding Crossroads and Lihim ng Nayon, which are engineering fixtures rather than Customer Zero evidence |
| Audience Evidence          | **0 readings, ever** |   →   | Any reading | Two causes, both now cleared: the poller was dead at its first line (fixed 2026-08-21), and nothing was live to read (Priority 1). Arrives on its own within ~6h of a live reel |

---

## Product Quality

| Metric               | Current | Trend |     Target | Notes |
| -------------------- | ------: | :---: | ---------: | ----- |
| Editorial Pass Rate  | Not systematically tracked |   →   | 60% first-attempt | Unchanged this period |
| Story Quality Review | No detectable text-level defect |   →   |  Improving | Unchanged. 2026-08-06-003 stands |
| Watched-Reel Quality | 1 approved, 0 kept up |   ↑   |  Improving | The reel after the packaging repair was approved and uploaded — as a proving run. Prior reading was 3/3 declined, so this is movement, but not yet a durable accept |
| Packaging Quality | **Mechanically repaired; taste half untested** |   ↑   |  Improving | The three named disqualifiers are gone. Still measured by nothing but the founder's eye, still owned by no coworker seat, proven on one 55s vertical reel and unproven on long-form |
| Depictive Fidelity | Enforced in code, verified on a live paid reel |   ↑   |  Holding | Four invariants with unit tests; five defects found and fixed by running it for real. `specs/depictive-fidelity.md` |
| Visual Consistency   | Qualitative only |   →   |  Improving | Visual Director baseline audit still unrun |
| Audio Quality Review | Qualitative only |   →   |  Improving | The cross-register blind ear A/B that gates Phase B has still not been recorded |

---

## Operational Health

| Metric                        | Current | Trend |     Target | Notes |
| ----------------------------- | ------: | :---: | ---------: | ----- |
| Generation Success Rate       | Not yet measured |   →   |       >95% | Two long-form `generate_story` runs were reaped for exceeding the stuck threshold (08-12, 08-17) on a fixture channel — the only reliability signal in the window |
| Average Story Generation Time | Not yet measured |   →   |     Stable |       |
| Average AI Cost per Story     | $4.81–6.41 measured per reel |   →   | Decreasing — never at taste's expense | Lifetime measured spend **~$22.19** ($20.10 reel pipeline + $2.09 channel setup). Per-step attribution is live |
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
| Packaging repair | The named disqualifiers are packaging, not story, and fixing them changes the publish answer | Stories published 0 → ≥1 | **PARTIALLY CLOSED — corrected 2026-08-22.** Briefly recorded as CONFIRMED on the reasoning *"the founder published instead of declining."* That over-read the evidence: the upload was a proving run for the OAuth path, taken down afterwards, so the falsifier was never actually put. Mechanical half **confirmed** — the three named defects are fixed and a reel was approved. Taste half **still open**: nobody has decided to leave a reel up |
| **The audience is readable** | A published reel's real performance can reach `metrics` and feed few-shot selection without manual logging | Audience evidence 0 → ≥1 | **OPEN (2026-08-21).** Code shipped: per-channel auth, an API-key path that needs no grant, connection errors surfaced. Falsifier: numbers still do not land after a reconnect, meaning the defect was not the whole story |
| Depictive fidelity beyond places | A real subject must be *sourced*, and a real person's face must never be invented | Depictive truth held under real-world subjects | **CLOSED — SHIPPED (2026-08-17).** Graduated to `specs/depictive-fidelity.md`. A third guard was **rejected on measurement**: a lexical "depicts what it doesn't tag" detector scored 1 true positive to 2–3 false, and would have stamped `R.MUTT 1917` on shop-window plumbing |
| Overlay text needs a gate, not guidance | Naming the exact failure in the prompt is enough to stop a thumbnail overlay drifting vaguer than its title | Packaging quality ↑ | **NEGATIVE, n=4 (2026-08-10).** Carried forward unchanged: the fourth independent instance of soft guidance being satisficed, and still no gate built — n=4 does not clear the machinery bar |
| Judge-and-force at the plan level | Structural agency failures are fixed by forced re-planning, not line rewrites | Editorial pass rate ↑ | Built and merged; `STORY_PLAN_GATE` **still unset**, so it has still never run in production. The one published reel does not settle whether it helps |
| Prescribe variation, not shortness | The sentence-rhythm monoculture is self-inflicted by "short lines" prompts | Story quality review ↑ | Shipped (PR #14); children's-validated only. Cross-genre regression sweep still open |

---

## Current Risks

* **Ten days of engineering were verified entirely on channels that are not evidence.** Every lap from 08-12 to 08-21 was proven on Crossroads and Lihim ng Nayon, which the founder disregards. The work was sound and the verification was real, but it produced no movement on the two channels Phase 0 is measured by. Watch for this shape: a fixture is easier to iterate on than the thing that counts.
* **A per-channel migration that converted one caller left three reading a world that no longer existed.** Fixed for YouTube on 2026-08-21, but the pattern is the risk — TikTok and Facebook are still honest manual destinations, and whatever converts them next should convert every caller in the same commit.
* **Testing-mode OAuth grants expire in seven days**, which taxes every publish. Measurement is now decoupled from this via `YOUTUBE_API_KEY`; **publishing is not**, and cannot be.
* **Every render before 2026-08-21 burned a roaming Kendrix watermark**, so both existing reels still carry one. No longer a dilemma — the 08-11 upload is gone, so nothing needs delete-and-reupload — but **re-render before posting anything**, or the logo ships. The pass is free (`render` books `costCents: 0`).
* **A metric read "1" when the truth was "0 live, 1 upload proven."** A `publications` row records a successful upload, not a watchable video, and neither the schema nor the weekly briefing distinguished them — so a proving run counted as a publish for eleven days. Any metric whose subject can be *undone by someone else* (a platform, or us) needs its liveness re-checked, not just its creation recorded.
* **Our automated quality instruments do not track the founder's ear.** Standing, and unchallenged this period — no automated instrument predicted that the packaging repair would flip the publish answer.
* **Marketing surface is running further ahead of product proof.** kendrix.io, the landing page and a four-cut hero trailer describe a product with one published video. The gap widened.
* **Unattended reliability is unproven** — and now known to have been unprovable: auto-publish was gated on a credential that no longer existed, so no hands-off lap could have completed its last mile.
* **Long-form auto-publish is still blocked by the YouTube uploader** — whole file held in memory, no resume. Non-issue at short-form sizes; a real blocker at ~1GB.

---

## Key Learnings

From the current period (2026-08-11 → 2026-08-21):

* **A silent `return` is a defect with no symptoms.** The performance poller exited at its first line for ten days. Nothing failed, nothing logged, no dashboard went red — the only evidence was an empty table nobody queried. Any guard that skips work should say that it skipped, and why.
* **A migration converts callers, not concepts.** Per-channel publishing landed on 08-11 for the one path a human clicks. The worker's auto-publish, the performance poller and the Settings gate went on reading an installation-wide token that the same commit had made meaningless — one of them in a way that would have uploaded to the wrong account. When a credential's *ownership* changes, grep for every reader before calling it done.
* **Measure with the weakest credential that suffices.** Public view counts are public data. Reading them through the publishing grant coupled the audience signal to a token that expires in seven days, so the instrument we most needed was the most fragile thing we owned.
* **Verify on the channels that count.** The depiction work was verified properly — on a live paid reel, which found five defects the code review missed. It was simply verified on a fixture. Correct verification aimed at the wrong subject still leaves the measured thing unmeasured.
* **"Ask the instrument" generalizes one level out.** The 08-10 lesson was that we left the founder's judgment unread for seven weeks. The audience is the next instrument in the same chain, and we left it unread for ten days — this time because it was broken, which is the harder version of the same failure.
* **A repair confirmed by the instrument that made the complaint is worth more than any judge** — but check that the instrument was actually asked. The packaging lap looked like the first intervention validated that way, and it was not: the founder approving a reel *to prove a code path* is a different act from deciding to leave it up, and I recorded the first as if it were the second.
* **Define a metric by the state it claims, not the event that created it.** "Stories Published" was implemented as "a `publications` row exists", so a proving run that was later deleted counted as a publish for eleven days. The claim was *watchable*; the measurement was *uploaded*.

Carried forward and still standing: craft needs judgment not asking; naming a failure in a prompt does not fix it; a judge that agrees with itself proves nothing; diagnose the layer the complaint lives in; pre-registering the interpretation works; raw writer output ≈ final output.

---

## Decisions Made

Major decisions are recorded in company/decision-log.md; this section lists the period's entries.

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

* Is a Kendrix reel live right now — and did a real audience number land?
* Did anything counted as done turn out to describe an event rather than a state?
* Was the next engineering lap chosen from evidence, or from prediction?
* Is anything still reading a credential that changed ownership?
* Does the roadmap phase still accurately describe the company?
