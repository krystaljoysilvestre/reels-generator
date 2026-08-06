# Decision Log

---

Status: Active

Owner: Founder

Contributors:

* All AI coworkers

Review Frequency: Ongoing

Purpose: Living Strategy

Referenced By:

* company/decision-framework.md
* company/roadmap.md
* company/assumptions.md
* company/current-metrics.md
* research/competitors.md

---

## Purpose

The Decision Log records significant company decisions and the reasoning behind them.

It exists to preserve institutional memory.

Decisions should remain understandable months or years later, even when the original context has been forgotten.

---

## Principles

### Record Decisions, Not Discussions

Capture the outcome.

Do not attempt to preserve every conversation.

### Record the Reasoning

A decision without reasoning has little long-term value.

Future teammates should understand why a decision was made.

### Decisions May Change

Changing a decision is not failure.

When evidence changes, record a new decision rather than rewriting history.

Institutional memory is more valuable than the appearance of consistency.

### Conventions

Entries are chronological, oldest first. New entries are appended at the end.

Accepted entries are never edited. To change a decision, append a new entry and flip the old one's status to Superseded.

Not every decision belongs here. Day-to-day engineering decisions live in specs, RFCs, and commit history — this log is for decisions that shape the product, the business, or the principles.

---

## Decision Template

### Decision ID

YYYY-MM-DD-001

### Status

* Proposed
* Accepted
* Superseded
* Rejected

### Title

Short, descriptive title.

### Decision

State the decision clearly.

### Why

Explain the reasoning.

Reference assumptions, metrics, roadmap phases, customer evidence, or competitor research where appropriate.

### Alternatives Considered

List meaningful alternatives.

Explain why they were not chosen.

### Expected Impact

Which metrics are expected to improve?

Which assumptions are being tested?

### Review Trigger

What future evidence would justify revisiting this decision?

### Related Documents

Link the documents that encode or depend on this decision.

---

## Entries

### 2026-06-30-001

Status: Accepted

Title: Operator Review Gate Removed

Decision

The pipeline runs straight through, with no built-in human review step for cast, places, or scenes.

Why

A mandatory review gate contradicted the minimal-review goal and added operator friction without a proportionate catch rate.

Alternatives Considered

Keeping the review UI and editor that had already been built. Rejected: friction outweighed value; non-review fixes were kept.

Expected Impact

Workflow completion up, production friction down. Tests the assumption: Minimal-Review Quality Is Achievable.

Review Trigger

Quality escapes that a light review step would have caught keep recurring after the gate gets teeth.

Related Documents

product/workflow.md (Review Is Graduated)

---

### 2026-07-01-001

Status: Accepted

Title: One Music Bed Per Reel

Decision

Two-section music collapsed to a single sustained bed with a dynamic envelope plus sound effects.

Why

Section transitions sounded worse than one bed with real dynamics. Simpler and better.

Alternatives Considered

Multi-section scored music per reel. Rejected by listening.

Expected Impact

Audio quality review up; simpler audio pipeline.

Review Trigger

A full render-and-listen tuning pass shows sustained beds failing on longer formats.

---

### 2026-07-03-001

Status: Accepted

Title: Near-Term Goal — Viral Quality With Minimal Review

Decision

Ship best-of-N generation with a taste rubric and sampled auditing now; defer the full Story IR architecture.

Why

Publishable quality without hand-review is the product's promise. Deeper architecture must be earned by evidence, not built up front.

Alternatives Considered

Building the full Story IR ("Kendrix" three-system architecture) first. Deferred, not rejected — it remains the north star.

Expected Impact

Editorial pass rate becomes the metric that couples generation work to the goal.

Review Trigger

Evidence that the engine is blocked without deeper IR — the hypotheses graduation bar.

Related Documents

specs/story-ir-architecture.md, ARCHITECTURE.md

---

### 2026-07-06-001

Status: Accepted

Title: Voice Delivery Is Auto-Only

Decision

Manual delivery sliders removed. Delivery is decided automatically per story; the operator picks the voice, nothing else.

Why

Knobs added cognitive load, and the system tuned delivery better than manual settings.

Alternatives Considered

Per-reel delivery sliders (already built); exposing LLM-picked settings as controls. Removed.

Expected Impact

Reduced production friction; fewer controls to maintain.

Review Trigger

Alpha creators repeatedly request delivery control for real projects.

Related Documents

product/product-principles.md (#4: a removed control that nobody missed stays removed)

---

### 2026-07-15-001

Status: Accepted

Title: The Writer Is the Product

Decision

Story generation pivoted to a staged writer (Planner → Genre Writer → Editor → Naturalizer → Critic gate), with an evidence rule — no new stage without roughly twenty same-failure stories — and A/B against legacy before deleting it.

Why

Story quality is the differentiator; stage sprawl without evidence is how pipelines rot.

Alternatives Considered

Keeping best-of-6 selection only. Superseded as the primary path; retained for A/B comparison.

Expected Impact

Editorial pass rate up; story quality review up.

Review Trigger

A stage fails its A/B, or the evidence rule blocks a fix the gate proves is needed.

Related Documents

product/storytelling-philosophy.md, company/founder-principles.md (#7)

---

### 2026-07-17-001

Status: Accepted

Title: Taglish Stays

Decision

Taglish code-switching is kept (tuned via addendum); the writer model stays gpt-4o.

Why

Tested directly: language was not the quality gap — agency and causality were. Changing language or model would not have fixed the real problem.

Alternatives Considered

English-only output; switching writer models. Rejected: wrong lever.

Expected Impact

None expected on quality metrics — that was the finding.

Review Trigger

Audience data shows language-driven drop-off, or creators report language friction.

---

### 2026-07-18-001

Status: Accepted

Title: reddit_story Is a Format, and It Is Frozen

Decision

reddit_story is defined as a format: authenticity-first, dilemma-first selection (not twist-first), processing voice.

Why

Proven — remaining failures are explainable as "wrong grammar," which means the definition is right.

Alternatives Considered

Twist-first selection. Rejected: authenticity is the format's contract.

Expected Impact

Stable format quality; failures become diagnosable.

Review Trigger

Failures stop being explainable as "wrong grammar."

Related Documents

specs/story-modes.md

---

### 2026-07-19-001

Status: Accepted

Title: The Gate Gets Teeth

Decision

The quality gate will enforce regenerate-until-pass with a bounded cap and human escalation for exceptions. It stays advisory until the flip trigger.

Why

Judgment reliably works where guidance does not — but enforcing teeth while pass rates are near zero would block everything.

Alternatives Considered

Advisory forever (ships known failures); teeth immediately (blocks all production). Both rejected.

Expected Impact

Editorial first-attempt pass rate becomes the coupling metric. Tests the assumption: Minimal-Review Quality Is Achievable.

Review Trigger

Ratified: flip when first-attempt pass rate reaches 60% (regeneration cap and mechanics owned by the minimal-review gate policy).

Related Documents

product/quality-gates.md

---

### 2026-07-19-002

Status: Accepted

Title: Universal Craft in Code, Cultural Form in Channel DNA

Decision

Genre code encodes universal craft (subtext, specificity, agency, causality) hard. Cultural form (agency-vs-endurance, melodrama intensity, revelation-vs-choice) belongs to channel DNA. Never diagnose a craft problem as "cultural" from monocultural evidence.

Why

A cross-culture drama probe settled it: the dead-parent-revelation attractor appeared identically in English — the problem was universal, not Filipino.

Alternatives Considered

Hardcoding Filipino narrative conventions into genre code. Rejected: bias cuts both ways.

Expected Impact

Genre modules stay culture-portable for SaaS; craft fixes transfer across languages.

Review Trigger

A cross-culture probe shows a craft rule producing different outcomes by culture.

Related Documents

product/storytelling-philosophy.md (Genre Matters)

---

### 2026-07-20-001

Status: Accepted

Title: Retention Work Parked

Decision

All retention-optimization work is parked behind the believability path and real audience data.

Why

Optimizing retention of stories audiences don't believe is wrong-phase work. Two verified defects (long-form hookHint wiring, dormant on-screen text) were logged for later, not fixed now.

Alternatives Considered

Fixing the retention defects immediately. Deferred, not rejected.

Expected Impact

Effort concentrates on the bottleneck (editorial pass rate) instead of downstream tuning.

Review Trigger

Ratified: believability proven (pass rate at the flip trigger) and real audience data flowing.

Related Documents

company/metrics.md (Phase Metrics), company/roadmap.md (Phase 0–1)

---

### 2026-07-23-001

Status: Accepted

Title: Story Quality Is Never Tiered

Decision

Every creator receives Kendrix's best storytelling engine regardless of subscription tier.

Why

Story quality is central to Kendrix's positioning and long-term trust.

Premium plans should increase capacity, convenience, and production richness—not storytelling quality.

Alternatives Considered

Tiered storytelling models.

Rejected because they weaken product positioning and encourage artificial degradation.

Expected Impact

* Protect creator trust
* Reinforce positioning
* Improve long-term retention

Review Trigger

Only revisit if evidence suggests this principle no longer serves creators or the business.

Related Documents

company/pricing.md (What Is Never Tiered); specs/audio-tiers.md (read as production-richness tiering, which remains permitted)

---

### 2026-07-23-002

Status: Accepted

Title: Foundations Principle Added to the Constitution (v1.1)

Decision

"Delaying features is discipline; delaying foundations is debt" became constitution principle 7: retrofit-expensive foundations (tenant isolation, authorization boundaries, cost accounting, auditability, data ownership) are built correctly from the start.

Why

Without it, phase discipline ("avoid building for users who don't exist") could be read as license to skip tenant isolation — the opposite of what was deliberately built.

Alternatives Considered

Leaving it as a note inside the roadmap. Rejected: it is an engineering principle, not a roadmap remark.

Expected Impact

Foundations survive phase-discipline arguments; no retrofit debt.

Review Trigger

Constitution amendments happen only by deliberate owner review — this entry records the first.

Related Documents

ARCHITECTURE.md (principle 7), company/roadmap.md (Build Foundations Early)

---

### 2026-07-23-003

Status: Accepted

Title: The Company DNA Is Established

Decision

Kendrix's thinking lives in `dna/` — the stable constitution plus a living loop (current-metrics weekly, assumptions monthly, this log ongoing) — wired through CLAUDE.md so every AI coworker reads it. Coworkers propose changes to living documents; the founder approves changes to the constitution.

Why

Future agents need the company's philosophy and its reasons, not just its code. Session memory is not institutional memory.

Alternatives Considered

Keeping company knowledge in session memory and scattered docs. Rejected: it doesn't survive sessions or scale to multiple coworkers.

Expected Impact

Consistent decisions across agents and time; faster onboarding of AI coworkers.

Review Trigger

DNA documents repeatedly contradicting practice, or the governance model failing in use.

Related Documents

dna/START-HERE.md, CLAUDE.md

---

### 2026-07-24-001

Status: Accepted

Title: EBN Leads With Historical Events / Documentary, Not True Crime

Decision

Evidence-Based Narrative's first *published* specialization is Historical Events / documentary reconstruction of specific, settled, public-record events — not True Crime. True Crime remains the fidelity stress-test that shaped the chain and becomes a later, config-cost specialization once first-party retention data and the owner-owned legal/sourcing discipline both exist.

Why

A three-coworker council (Product, Editorial, Marketing) reached this independently, via three lenses. Build cost is identical across specializations (a specialization is a config bundle), so the choice is one of experiment quality and risk. True Crime gives a *confounded* first retention read: its three proven retention engines — a charismatic host, real archival footage, and photoreal reconstruction — are all unavailable to EBN v1 or banned by the visual guardrail, so a poor result could not distinguish product failure from a hobbled format. It also front-loads every owner-owned legal gate. Documentary/history gives a *clean, interpretable* read: illustrative retention is proven in exactly this register, the discriminator is motion/pacing/craft (not photorealism), and EBN's architecture (causality via the Narrative Claims graph, verified weight via the Evidence Bible) *enforces* what the register's payoff needs — the constraints are a moat here and a tax in true crime. The roadmap already names Documentary as a Customer-Zero channel; True-Crime-first was the outlier. All supporting evidence is rank-4 (competitor) with zero first-party data yet.

Alternatives Considered

Keep True Crime first (the RFC's "most demanding first" framing). Rejected as the first *product/retention* proof — True Crime already served its purpose as the *fidelity* stress-test (the causal-paraphrase probe cleared exactly that hardest case), and leading with it would contaminate the one question Phase 1 exists to answer while front-loading legal risk.

Expected Impact

A cleaner first read on the "Illustrative Rendering Profile Holds Retention" assumption; lower legal exposure through Phase 0–1; Customer Zero becomes a proof-channel for the ideal-customer segment (history/documentary/faceless creators).

Review Trigger

A blind paired read (rich attributed true-crime dossier vs. history dossier, both under v1 permissions) — or first-party data — shows evidence-constrained true crime retaining within striking distance of history. Then lead with / add True Crime.

Related Documents

specs/evidence-based-narrative.md, dna/company/roadmap.md (Phase 1 Customer Zero), dna/company/assumptions.md (Illustrative Rendering Profile Holds Retention), dna/company/marketing.md, dna/company/ideal-customer.md

---

### 2026-08-03-001

Status: Accepted

Title: EBN Accepts No Ungrounded Narration — One Production Entrypoint Per Story Mode

Decision

Every production reel on an Evidence-Based channel originates from a source dossier; no production entrypoint may introduce narration before evidence exists. Concretely: the BYO route (provide-story, both doors — pasted text and shelf scripts) fails closed on EBN channels, the same way create-reel already fails closed without a dossier, and the reel-creation UI on EBN channels collects the dossier instead. The script shelf remains a writing space on EBN channels (save/edit/duplicate/delete), but never a production door. BYO-with-dossier is a hypothesis (hypotheses/ebn-byo-fact-check.md), not a path.

The corollary is a design principle stated here so future proposals resolve mechanically: **one production entrypoint per story mode** — standard channels begin from a topic, Evidence-Based channels begin from a dossier. A new dossier *source* (an upload, a URL fetcher) extends the entrypoint and is welcome; a second *entrypoint* (pasting narration) violates it and is not.

Why

EBN guarantees provenance, not factual similarity. Generated narration carries an explicit claim lineage back to the Evidence Bible — every sentence expands a claim, every claim cites facts, so the Fact-Fidelity Checker is a lookup, not a fuzzy comparison. Human narration has no such lineage: even if every sentence happened to be true, the architecture could not demonstrate *why* any statement is justified by the evidence. Accepting BYO would therefore not be a relaxation of EBN but a different system — semantic document comparison in place of deterministic evidence verification. Secondary: the FFC has only ever been validated on generated narration; its behaviour on human prose is unmeasured. Rejection is reversible; an unverified factual path on the reputation-critical mode is not.

The gap this closes was found 2026-08-03: the entire evidence chain lives inside generate_story, which provide-story skips by design — and since the reel-creation UI never collected a dossier, the *only* clickable production path on an EBN channel was the ungrounded one. The spec was silent on BYO because it never anticipated it.

Alternatives Considered

Accept BYO with a required dossier, routed through generate_story so the Fact-Fidelity Checker grades the creator's prose against their sources. Filed as a hypothesis rather than built: the probe that would justify it (inject known errors into human-written narration, measure FFC catch rate) has never run, and even a perfect catch rate proves similarity, not provenance. Also noted for later: the cleaner long-term route shape is mode-aligned APIs (provide-story for fiction, provide-dossier for EBN) instead of an in-route reject — deferred because the principle, not the route topology, is the commitment; revisit if a third story mode arrives.

Expected Impact

EBN channels become correctly usable end-to-end in the UI for the first time (dossier in, evidence-built reel out), and the mode's core guarantee — auditable generation — can no longer be silently bypassed by the most convenient path. Standard channels are untouched.

Review Trigger

The FFC-on-human-prose probe (hypotheses/ebn-byo-fact-check.md) passes its bar, AND a real creator asks to bring their own script to an Evidence-Based channel. Both, not either.

Related Documents

specs/evidence-based-narrative.md (the invariant, §"The invariant (constitutional)"), hypotheses/ebn-byo-fact-check.md, specs/story-modes.md, dna/product/product-principles.md

---

### 2026-08-04-001

Status: Accepted

Title: Kendrix's Public Home Is kendrix.io

Decision

Purchased kendrix.io (2026-08-04, Cloudflare Registrar, $50/yr wholesale — current .io registry price; auto-renew and transfer lock on). Cloudflare chosen deliberately as the long-term home: registrar, DNS, email forwarding (hello@kendrix.io), and Turnstile form protection consolidate into one account with no future migration. kendrix.co was deliberately skipped (add only if squatting becomes a real concern).

Why

The exact-match .com is registered but dormant (2001, no nameservers) — no confusion risk today, and a possible broker acquisition later; waiting on it would block the Phase-0 build-in-public page for an uncertain, costlier path. kendrix.ai was available but rejected on positioning grounds: AI is an implementation detail, and putting `.ai` in the company's address would contradict positioning.md at the front door.

Expected Impact

A permanent public home for the build-in-public trust anchor and follow-the-build list (marketing.md Phase-0 mandate). Landing page work is now unblocked on the domain side.

Review Trigger

kendrix.com becomes acquirable at a sane price (acquire and redirect), or .io renewal pricing/TLD stability materially worsens.

Related Documents

dna/company/positioning.md, dna/company/marketing.md (Part II, Phase-0 goals)

---

### 2026-08-06-001

Status: Accepted

Title: A Story Ends When the Viewer's Mental Model Changes — Endings Are Three Layers

Decision

Endings are treated as a designed experience with three coordinated layers, not as "the last paragraph":

1. **Cinematic (time).** A reel holds its closing image for a per-genre beat after the final spoken word, while the music steps back and resolves and the room tone ramps out. Comedy buttons out at 800ms; drama, fairytale and children's linger to 2600ms. Implemented as `compute-timings` §4.65.
2. **Narrative (text).** Every genre has an ending criterion written in its own craft terms, and the universal gate check gains a mechanical DELETION TEST: cut the closing lines — if the viewer loses nothing, the payoff already happened and the ending is decoration. `WriterIdentity` gains `closingCraft`, the missing counterpart to `openingCraft`.
3. **Psychological (mind).** The plan now states the story's CONTRACT before its middle is planned: `hookPromise` (what the opening promises to change) and `viewerTransformation` (before → after belief). The planner decides the destination, then builds the journey that earns it.

Why

The founder's finding, watching two supervised laps: "we lack at endings, our reels just stop." Both halves were literally true. The reel's final frame was the last spoken character's timestamp, and the music bed — whose envelope held PEAK to the final sample — was cut off by ffmpeg at full volume; nothing in the codebase faded anything at the end. Meanwhile ending-craft coverage was wildly uneven in exactly the pattern that predicted the failures: lifestyle had no ending criterion at all, comedy tested only its punchline, informational's "carryable shape" is aced by an aphorism. Two stories the same day failed by the same mechanism — closing on a statement of meaning instead of placing the last concrete thing — which we named **terminal exposition**.

The lever is deliberately judge-side. Shape law 4 already told the Writer to SHOW the change, so the standard existed and the judge was blind to it; adding another generative mandate is how the sentence-rhythm monoculture was manufactured (2026-07-20).

Alternatives Considered

A single universal ending rule across all genres — rejected: a comedy button, a fairytale restoration and a horror afterimage are different crafts, and one shared shape would manufacture a new monoculture. Children's was deliberately left alone: naming a moral warmly IS its register.

Expected Impact

Reels end rather than stop. First-attempt gate pass-rate may DIP short-term as the stricter ending criteria bite — that is the gate doing its job, and it is tracked against the 60% teeth-flip trigger.

Review Trigger

The falsifier is closing-kind DIVERSITY: `apps/worker/scripts/endings-audit.ts` labels what each ending places and prints a histogram. If diversity collapses (every explainer closing "…in your room right now"), we traded one AI tell for another and the criteria come back out. Also: if a blind paired read prefers the aphorism close, drop the criterion entirely.

Related Documents

packages/core/src/timings/compute-timings.ts (§4.65), packages/core/src/prompts/story-critic.v2.ts (v2.19), packages/core/src/prompts/writer-identities.v1.ts (closingCraft), packages/core/src/prompts/story-planner.v1.ts (the contract), apps/worker/scripts/endings-audit.ts, ARCHITECTURE.md:146 (the aftermath beat this generalizes)

---

### 2026-08-06-002

Status: Accepted

Title: Bounded Edits Do Not Ship — A Blind Read Overruled Every Automated Signal

Decision

The bounded-edit architecture (`critic → surgeon → verifier → splice → re-index`) is NOT enabled. `STORY_ENDING_REPAIR` stays off. The mechanism is kept, documented, and left dormant; the judgment layer that drives it is rejected.

Why

The pass was built, tuned across two laps, and measured to what looked like a clear success: on eight independently-graded weak endings it applied six edits, and the automated judge graded **6 of 6** repaired closes as no longer weak, with zero regressions and the prefix guarantee intact across 28 stories. Then the founder read six pairs blind — same story, byte-identical prefix, only the closing lines differing, order shuffled — and preferred the REPAIRED close in **at most 2 of 6**.

The automated instrument and the human ear did not merely differ in degree; they pointed in opposite directions. Every number that justified continuing came from the judge, and the judge was wrong. This is the outcome the probe was designed to be able to produce, and the interpretation was written down before the read (5–6 ship · 4 supervised · 3 dead end · 0–2 stop), so no argument about it was possible afterwards.

Alternatives Considered

Tuning further — rejected. Two rounds already moved the critic from over-firing to under-firing and back, and the surgeon's own fix (v1.1) induced a new failure mode that the verifier caught. Another round would tune against a judge now known not to track human preference, which is optimizing the wrong objective more precisely.

Deleting the work — rejected. The MECHANISM was never what failed: the prefix held 28/28, no story was ever damaged, and all four guards proved load-bearing, each catching a different real case (peak-inside-region, replacement oversize, post-splice peak loss, and the verifier rejecting a well-formed, correctly-sized edit that smuggled in a new object and a POV shift). That is a reusable, proven chassis for any future edit region. What failed was the taste driving it.

Expected Impact

No production behaviour changes. The lasting deliverables are negative-result knowledge and three reusable assets: `packages/core/src/editing/bounded-edit.ts` (the primitive, 34 unit tests), `apps/worker/scripts/probe-critic-calibration.ts` (a 43-item labelled dev set that reports BOTH error rates per run), and the demonstrated discipline of pre-registering an interpretation before looking.

Review Trigger

**This result trips the falsifier already recorded on 2026-08-06-001.** That entry named the endings text-layer criteria's own kill condition: *"if a blind paired read prefers the aphorism close, drop the criterion entirely."* The closes the founder preferred are exactly the stated-conclusion and aphorism closes the shipped DELETION TEST condemns — so `story-critic.v2.19`, `closingCraft`, and the finishing judge's `ending` axis are now UNDER SUSPICION on main, not merely unvalidated.

The blind read cannot by itself separate "the surgeon writes badly" from "the judge's notion of a weak ending is wrong", because it compared original against repaired rather than judge-weak against judge-strong. The cheap decisive test: show the founder ~16 closes blind — half graded weak by `endings-audit`, half graded strong, from different stories — and ask which merely STOP. If they cannot tell, the endings criteria are miscalibrated on main and come back out.

Until that runs, treat any claim resting on `endings-audit.ts` as unverified. Its measured failings are already on record: ~8% test-retest noise overall, concentrating on borderline items (2 of 5 in one run), and both unedited controls flipping in the final scoring.

Related Documents

NOTE: the bounded-edit implementation is retained in the working tree and deliberately NOT committed — the decision was not to ship it. The paths below describe what was built, not what is on main.

packages/core/src/editing/bounded-edit.ts, apps/worker/src/pipeline/steps/ending-repair.ts, apps/worker/scripts/probe-critic-calibration.ts, apps/worker/scripts/endings-audit.ts, packages/core/src/prompts/story-ending-critic.v1.ts (v1.4), packages/core/src/prompts/story-ending-surgeon.v1.ts (v1.2), packages/core/src/prompts/story-edit-verifier.v1.ts, decision-log 2026-08-06-001 (the falsifier this trips)

---

### 2026-08-06-003

Status: Accepted

Title: The Endings Complaint Was About TIME, Not TEXT — the Text-Layer Criteria Rest on a Misdiagnosis

Decision

Revert or neutralize the endings TEXT layer shipped on 2026-08-06 — the DELETION TEST additions in `story-critic.v2.19`, the per-genre `closingCraft` entries, the finishing judge's `ending` axis, and `scenes.v1.45`'s closing-shot block. **Keep the TIME layer** (`compute-timings` §4.65's outro tail, the music/ambient resolve, the final-scene demotion fix, the black-frame fix) — it is validated and is what the founder actually reported.

Why

A blind test settled it. Twelve unseen stories, six graded weak by `endings-audit` and six graded fine, order hidden, none repaired. The founder read all twelve and marked **every one as ending properly** — 0 of 6 versus 0 of 6, a difference of zero against a pre-registered bar of 4. The judge's agreement with the founder's ear was 6 of 12: exactly chance, and it agreed only on the items it had called fine. The ending critic, built from the same standard, flagged 3 of the 12 closes the founder reads as fine.

The deeper finding is the reframe. The original complaint was *"our reels just stops. we lack at endings."* That was a complaint about WATCHING a rendered reel, and it described a real, measured defect: the reel's final frame was the last spoken character's timestamp, and the music bed held PEAK to the final sample before ffmpeg cut it at full volume — **nothing in the codebase faded anything at the end.** The TIME layer fixed exactly that, and the founder's response on watching it was *"it's so much better now."*

The TEXT layer was built by generalizing that viewing complaint into a writing complaint. This test is the first time the writing was examined on its own, and on its own the founder finds nothing wrong with it. The criteria were solving a problem that had already been solved one layer down.

That also explains, at a stroke, three results that were otherwise puzzling: why the text criteria never validated against anything but their own judge; why bounded-edit repair made endings WORSE in a blind read (it replaced closes that were already fine); and why the judge and the critic disagree with each other on a quarter of cases despite sharing one standard.

Alternatives Considered

Keeping the criteria as harmless extra rigor — rejected, because they are not inert. They are GATE criteria that can reject a story, and a rejection re-rolls the whole chain (regeneration is not revision, decision-log 2026-08-06-002). Miscalibrated ending criteria therefore cost real money and real quality: they reject stories whose endings the founder finds good, and the rewrite that follows is a fresh story rather than a fixed one. Leaving them in also keeps the 60% first-attempt pass-rate flip trigger under pressure from a standard we cannot defend.

Deleting `endings-audit.ts` — rejected. As a *describer* it is still useful: the `landingKind` histogram remains a legitimate monoculture tripwire, and the instrument correctly identified the time-layer defect's symptoms. What it cannot do is JUDGE quality. Demote it from arbiter to descriptor.

Expected Impact

Reverting returns ending judgment to where the evidence says it belongs: the human gate, over a reel that now actually ends in time. First-attempt gate pass-rate should recover whatever the criteria were suppressing.

Review Trigger

This test measured TEXT read silently on a page. It does not prove these closes work in a rendered reel with voice, timing and music — the founder's original complaint lived precisely there. So the honest scope of the finding is: *there is no text-level ending defect large enough for the founder to see, and no automated instrument we own can measure one.* If a future watched reel again feels like it stops, the first suspects are timing and mix, not the writing.

Related Documents

packages/core/src/prompts/story-critic.v2.ts (v2.19), packages/core/src/prompts/writer-identities.v1.ts (closingCraft), packages/core/src/prompts/story-finishing-judge.v1.ts (v1.2), packages/core/src/prompts/scenes.v1.ts (v1.45), packages/core/src/timings/compute-timings.ts (§4.65 — KEEP), apps/worker/scripts/endings-audit.ts, decision-log 2026-08-06-001 (the falsifier this fires), decision-log 2026-08-06-002

---

## Relationship to the Decision Framework

The Decision Framework explains how decisions are made.

The Decision Log records the decisions that were made.

---

## Relationship to Assumptions

Many decisions exist to test assumptions.

When assumptions change, new decisions should be recorded instead of rewriting previous entries.

---

## Relationship to Metrics

Expected impacts should be measurable whenever possible.

If a decision has no measurable outcome, reconsider whether it is significant enough to record.

---

## Definition of Success

A successful Decision Log allows a future teammate to understand not only what Kendrix decided, but why.
