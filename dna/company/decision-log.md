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

### 2026-08-10-001

Status: Accepted

Title: The Bottleneck Was Packaging, Not Story — Two of Three Disqualifiers Are Outside the Video

Decision

Retire *story quality* as the stated bottleneck and replace it with **packaging and surface**. Scope the current lap to exactly the three things the founder named — thumbnail, title, caption styling — and build nothing for endings.

Why

The publish-bar audit ran on 2026-08-10, seven weeks after the first reel was rendered and three days after it became Priority 1. The founder watched all three rendered reels and named the disqualifiers unprompted, without a rubric:

1. *"The thumbnails are not post-worthy. We need to look how current content creators do it. Same goes with their titles."*
2. *"The burned caption styles look so old."*
3. *"These 3 reels just ended."*

**Nothing named is story quality.** Not premise, not writing, not believability, not the ending criteria — which is what every automated judge, probe and gate we own had been measuring. And two of the three items are **not inside the video at all**: the thumbnail and the title are the packaging a viewer reads before deciding to watch. The engine was producing publishable stories wrapped in unpublishable packaging, and no instrument we own looks at packaging.

Each named item had a specific, verifiable cause, and in every case the cause was one layer deeper than "it looks dated":

* **Thumbnail** — wrong at the CONCEPT level. The composition burned the entire video title at 64-92px in `system-ui` over a bottom scrim. That is a caption, not a thumbnail: creators put 3-5 huge words on the image and let the title say something else. Fixed by a separate `thumbnailText` field plus one chosen treatment.
* **A worse defect, found only by rendering candidates.** A vertical reel's hero frame is 768x1344; the 16:9 thumbnail fitted it with `objectFit: cover`, keeping **32% of the height, centred**. Vertical composition does not put its subject in the middle — Emberlight's hero frame is a child standing atop a glowing ladder in the upper 6%, and the shipped thumbnail discarded them entirely, keeping three anonymous rungs on beige. Invisible in the code; obvious the moment real frames were rendered.
* **Title** — `post-meta.v1` instructed *"No clickbait caps, no emoji spam — intrigue comes from the story, not punctuation."* Restraint optimised on the one surface that rewards a curiosity gap, producing filenames: *"the one second thing"*, *"the rungs he left behind"*.
* **Caption** — `352f3a1` replaced every preset, but the remap moved only the preset **id**. The render step parses the stored **resolved** style, so all three channels kept their old `fontFamily`, `fontSizePx`, `animation`, `stroke` and `letterSpacing`. The new presets reached only channels created after the commit — none of the ones that prompted the change.
* **Ending** — already fixed. `e712dbe` (08-06) added the held outro beat and all three reels predate it. This is the one item with evidence *against* building more: an additional text-layer ending fix was built and reverted the same week (2026-08-06-003).

Alternatives Considered

**Treating "not post-worthy" as a styling problem and restyling the thumbnail.** Rejected — it would have left the whole title burned on the image, which is the actual defect. The remedy had to change what text goes there, not how it looks.

**Choosing the thumbnail treatment myself.** Rejected. This document's own standing risk is that our automated instruments do not track the founder's ear, demonstrated twice in one week in opposite directions. Four treatments x two fittings were rendered from the founder's own hero frames — 28 real 1280x720 candidates, $0 — and the founder's marks decided it. The losers were **deleted, not kept behind a prop**: four variants left in the codebase would have shipped the indecision as configuration.

**Researching current thumbnail conventions live, as the founder asked.** Attempted and **abandoned**. The search model fabricated its citations, returning placeholder URLs like `watch?v=video_id1`, because a text-search model cannot see images. The script was deleted rather than its schema loosened. The treatments therefore rest on durable fundamentals plus the founder's pick, and this gap is recorded rather than papered over.

**A SQL migration to re-resolve the three channels' caption styles.** Rejected in favour of upgrading on read. A legacy preset id in a stored row *is* the marker for "predates the new presets", so re-resolving at the schema boundary fixes every channel in every environment, needs no jsonb SQL across sixteen retired presets, and cannot destructively mis-write a row. Genuine creator tweaks are separated from old preset defaults by diffing against a frozen snapshot of the retired table — Crossroads' `#0057b8` brand blue survives; the two channels storing untouched defaults adopt their replacement whole.

Expected Impact

The first honest shot at Stories Published 0 → 1, which is the Phase 0 → Phase 1 gate. The lap ends by re-asking the founder *"would you publish this now?"* on re-rendered reels — the same instrument, pointed at a changed artifact.

Review Trigger

**The audit is repeatable, and this decision does not assume packaging was the whole of it.** If the founder still declines after the repair, the new reasons get named the same way rather than guessed at. Two scope limits are known in advance: the treatment was chosen on three reels, two of them the same 55s vertical format, so it is unproven for the 7:38 long-form; and packaging is now measured by nothing and owned by no coworker seat, which is how it went unexamined for seven weeks in the first place.

One negative result is recorded here so it is not re-litigated: **naming the exact failure in a prompt did not fix it.** `post-meta.v1.3` states verbatim that `"AI Takes Over?"` is wrong under *"What If AI Replaces Half of All Office Jobs?"* and that `"HALF THE JOBS"` is right; the same reel still returned `AI Takes Over Offices`. Two of four reels improved and one was a clear win, so the change is kept — but this is the fourth independent instance of soft guidance being satisficed, and **no gate was built**: n=4 does not clear the bar for new machinery.

Related Documents

packages/core/src/types/post-meta.ts (`thumbnailText`, `thumbnailOverlay`, `thumbnailDuplicatesTitle`), packages/core/src/prompts/post-meta.v1.ts (v1.3), packages/render/src/remotion/compositions/ThumbnailComposition.tsx, packages/core/src/types/channel.ts (`upgradeLegacyCaptionStyle`, `LEGACY_CAPTION_DEFAULTS`), packages/core/src/types/caption-upgrade.test.ts, apps/worker/scripts/thumbnail-candidates.ts, apps/worker/scripts/packaging-preview.ts, dna/company/current-metrics.md, decision-log 2026-08-06-003 (the ending evidence this defers to), 352f3a1, e712dbe

---


### 2026-08-11-001

Status: Accepted — **partially corrected by 2026-08-22-001.** The upload described here was a proving run and was taken down; the per-channel authorization decision stands, the "published for the first time" reading does not.

Title: Publishing Accounts Are Owned Per Channel — and Customer Zero Published for the First Time

Decision

Own platform authorization on the **channel**, not the installation. One creator connects different brand accounts to different Kendrix channels; `platform_connections` holds the grant, bound to the signed-in owner and encrypted at rest with AES-256-GCM. Then publish for real: *Edge of Everything* went public on YouTube on 2026-08-11 as `RRvU0b1TFAc`, through that path.

Why

The Phase 0 → Phase 1 gate is *"Customer Zero can consistently produce publishable content"*, and for seven weeks the count was zero. The packaging repair (2026-08-10-001) removed the founder's three named disqualifiers, and the reel that followed cleared the bar. **Stories Published moved 0 → 1.**

Per-channel ownership was not a convenience. A single operator-wide refresh token uploads to whichever YouTube account minted it, so a portfolio of channels either shares one destination or publishes to the wrong one. Since Kendrix's model is *one operator, multiple channels*, installation-wide credentials contradict the product's own shape.

Alternatives Considered

**One operator-wide token, deferring per-channel ownership.** Rejected — and the code comment that deferred it (*"a per-channel token store is a deliberate later step; Phase 1 assumes the operator's primary channel"*) is exactly the assumption that would have broken on the second channel.

**Direct TikTok and Facebook publishing in the same lap.** Rejected. TikTok needs Content Posting API audit and Facebook needs Meta Page review; both stay honest manual destinations through the post package, and neither blocks Customer Zero from publishing today.

Expected Impact

The gate is crossed once. **Consistency is not proven, and one publish must not be read as the exit criterion met** — the criterion is an adverb.

Review Trigger

General availability is a separate question from implementation: the Google OAuth app is in **Testing**, so grants expire after seven days and arbitrary users cannot rely on the path. Production verification is not the bottleneck while Customer Zero proves repeat publishing — promote it when inviting external creators becomes the committed action.

Related Documents

apps/web/src/app/api/pipeline/publish-youtube/route.ts, apps/web/src/app/api/publishing/youtube/, packages/db (platform_connections), migration 0060, decision-log 2026-08-10-001, decision-log 2026-08-21-002 (the callers this entry left behind)

---

### 2026-08-17-001

Status: Accepted

Title: Depictive Fidelity Covers Every Real Subject — and a Lexical Tag-Detector Is Rejected on Measurement

Decision

Extend depictive fidelity past places to **objects, animals and real people**. A subject classifier (`entity-source.v1`) routes each entity to one of three media modes, resolved once and read by every downstream gate: `generated`, `reference_plate` (a real image conditions the frame), or `archival_only` (a real image is presented as itself and never conditions anything). Graduate `hypotheses/real-places.md` to `specs/depictive-fidelity.md`.

Why

The real-photograph path was gated to a single line — `policy.realPlaces && kind === 'location'` — so a documentary about the Titanic, a Philippine eagle, or José Rizal invented all three. The human path is split by the depictive-ethics floor's own carve-outs: long-dead figures get a conditioning plate gated on a Wikidata `P570` death date ≥100 years, living people get genuine licensed archival photographs, and an identity we cannot verify is never sourced on either path. Four invariants are enforced in code with unit tests, the most important being that an `archival_only` person reaches a generated frame neither as a reference plate **nor as a name in the prompt** — the 2026-07-24 fabricated-press-photo failure.

**Running it for real is what found the defects.** A live paid reel surfaced five: a Commons licence guarantee resting on a regex miss, an identity anchor that never checked it anchored a *person* (a query for Duchamp resolved onto his artwork), a 1600px request that served the full-resolution original, archival fulfilment firing when a person was merely *present*, and vision QA failing identity-withheld scenes for obeying the floor — burning a paid re-roll each time.

Alternatives Considered

**A lexical "depicts an entity it doesn't tag" detector — REJECTED ON MEASUREMENT.** It scored 1 true positive to 2–3 false on the real reel and would have stamped `R.MUTT 1917` onto shop-window plumbing. The failure is conceptual, not a threshold to tune. Two guards were kept instead: `scene-qa` Check C2 errors when a scene's primary entity is a character but the prose describes no person, and invariant 2 now keys off the person being **named in the prose** rather than tagged — which closed a live path back to the 2026-07-24 failure.

Expected Impact

Depictive truth holds under real-world subjects. No change to fictional channels.

Review Trigger

Tagging is now load-bearing: a mis-tag costs depictive truth rather than a continuity wobble. Verified on one reel; watch the first factual channel with many entities per scene.

Related Documents

specs/depictive-fidelity.md, hypotheses/identity-conditioning.md, packages/core/src/prompts/entity-source.v1.ts, story-analyzer.v1.23, migration 0061, decision-log 2026-07-25 (the floor this obeys)

---

### 2026-08-21-001

Status: Accepted

Title: The Kendrix Watermark Comes Off Our Own Videos — Removed, Not Switched Off

Decision

Delete the roaming watermark overlay entirely: `WatermarkOverlay`, its wiring through the composition and render types, the dead `PlatformPreset.watermark` field, and `channels.watermark_key` (migration 0063).

Why

Every reel carried a Kendrix logo at 0.28 opacity, 26% of frame width, hopping position every three seconds so it could not be cropped out. It was on by default and **no surface in the app could ever set the per-channel override** — so the mechanism only ever branded our own output, including the one published video.

Removed rather than disabled because there is no creator-branding feature to serve today, and an unreachable overlay left in the renderer is dead configuration that drifts back on. `git revert` restores the whole mechanism if creator branding ever earns its place.

Alternatives Considered

**Switching the default off and keeping the mechanism.** Rejected on the same reasoning the bounded-edit chassis was kept *out* of main: a capability with no reachable surface is not a feature, it is a trap for the next reader.

**Keeping the negative-prompt guards.** Kept — those stop the image model *drawing* a watermark into a frame, which is the opposite problem.

Expected Impact

`watermark` leaves the render fingerprint, so existing reels re-render on the next pass and lose the logo. That pass is CPU-only (`render` books `costCents: 0`), so clearing it off an already-rendered reel is free.

Review Trigger

**YouTube cannot replace a published video's file.** `RRvU0b1TFAc` still carries the logo, so fixing publish #1 means delete-and-reupload, losing the URL. Whether that is worth doing is a founder call about public proof, not an engineering one.

Related Documents

packages/render/src/remotion/, apps/worker/src/pipeline/steps/render-step.ts, migration 0063, commit 07d424e

---

### 2026-08-21-002

Status: Accepted

Title: Publishing Credentials Are Per Channel *Everywhere* — the Operator-Wide Token Path Is Removed, and the Audience Read Stops Depending on It

Decision

Resolve YouTube credentials from the channel's own connection at **every** call site, through one function (`resolveYouTubeAuth` in `@reels/db`). Delete the operator-wide `YOUTUBE_REFRESH_TOKEN` path from the provider rather than leaving it as a fallback. Separately, let the performance poller read public statistics with a `YOUTUBE_API_KEY` when one is present, so measuring performance does not require permission to publish.

Why

The 2026-08-11 per-channel migration converted the one path a human clicks and left three callers reading a credential that the same commit had made meaningless:

* **The performance poller** returned at its first line for ten days. `metrics` held zero rows, no reel ever recorded an audience number, and `performanceScore` few-shot weighting could never receive data. Nothing failed and nothing logged — the only evidence was an empty table.
* **The worker's auto-publish** was gated on the same dead check *and* called `uploadToYouTube` with no per-channel auth at all. That is worse than dead: had the env token been set, an auto channel would have uploaded to whichever account minted it, ignoring the connection the creator made. Unattended operation was not merely unproven — its last mile was unreachable.
* **The Settings gate** hid the auto-publish option on a connected channel and offered it on an unconnected one, because it asked about the installation instead of the channel.

The second half is a design correction, not a workaround. **View counts on a public video are public data.** Reading them through the publishing grant coupled the performance loop to a token that expires in seven days under a Testing-mode OAuth app — so the instrument we most needed was the most fragile thing we owned. Watch-time and retention genuinely do need the grant (YouTube Analytics API, `yt-analytics.readonly`); public counts never did.

Alternatives Considered

**Keeping the env-token path as a fallback.** Rejected, on the precedent set the same day by 2026-08-21-001: an unreachable path left in place is dead configuration that drifts back on — and this one drifts back on as a *wrong-account upload*, which is the most expensive kind of quiet failure available to us.

**Fixing only the poller, which is what the approved action asked for.** Rejected as knowingly leaving a live mis-routing hazard one file away, on the same seam, in the path that runs unattended.

**A SQL or manual reconnect as the fix.** Rejected as a fix; a reconnect is still *required*, but it addresses the lapsed grant, not the code that could never have used it.

Expected Impact

Audience evidence goes from structurally impossible to one browser action away. Auto-publish becomes reachable for the first time. A lapsed grant now marks the connection (`status: 'error'`, `lastError`) so Settings asks for a reconnect, instead of a performance history that silently stops growing.

Verified: full workspace typecheck, 0 lint errors, 560 unit tests passing including three new ones pinning which credential the stats call presents and how — an API key in the query string, a grant in a header, and no request at all when nothing is published. Run against the real publication, the poller resolved the channel's grant, called Google, and returned `invalid_grant: Token has been expired or revoked` — the predicted lapse, now visible.

Review Trigger

**The pattern is the risk, not this instance.** TikTok and Facebook are still manual destinations; whatever converts them should convert every caller in the same commit. When a credential's *ownership* changes, grep for every reader before calling the migration done.

Related Documents

packages/db/src/publishing.ts (new — the single resolver), packages/providers/src/youtube/client.ts, packages/providers/src/youtube/stats-auth.test.ts, apps/worker/src/metrics-poll.ts, apps/worker/src/pipeline/auto-gate.ts, apps/web/src/app/api/pipeline/publish-youtube/route.ts, apps/web/src/app/(app)/channel/[id]/settings/page.tsx, decision-log 2026-08-11-001 (the migration this completes), decision-log 2026-08-21-001 (the removed-not-disabled precedent)

---


### 2026-08-22-001

Status: Accepted

Title: The 2026-08-11 Upload Was a Proving Run, Not a Publish — Stories Published Is Redefined by Liveness

Decision

Correct the record: **Stories Published is 0.** Track it as *reels a viewer can watch right now*, and track *uploads proven* as a separate, lesser number. Reopen the taste half of the packaging experiment, which was recorded as confirmed on evidence that does not support it.

Why

`RRvU0b1TFAc` went public on YouTube on 2026-08-11 — a real id, processed, served publicly, through Kendrix's own per-channel authorization path. It was a **proving run for the OAuth path, never intended to stay up**, and the founder deleted it. The channel today reports `videoCount: 0` and `viewCount: 0`.

Two errors followed from not knowing that, and both are worth recording because neither was a coding mistake:

**The metric measured an event and reported a state.** "Stories Published" was implemented as *a `publications` row exists*. A row records that an upload SUCCEEDED; the claim being made was that a video is WATCHABLE. Those diverge the moment anyone — a platform, or us — takes the video down, and nothing in the schema, the poller, or the weekly briefing could tell the difference. It read 1 for eleven days.

**A confirmation was read from an act that was not the test.** The packaging experiment's falsifier was *"the founder still declines, and names something new."* They did not decline — so it was recorded as CONFIRMED, and called the first repair in the project's history validated by the instrument that made the complaint. But approving a reel to prove a code path is a different act from deciding to leave it up, and only the second is the bar the 2026-08-10 audit was about. The falsifier was never actually put. **The mechanical half stands** — the thumbnail, title and caption defects are genuinely fixed, and the reel cleared review where three predecessors did not. The taste half is untested.

The honest state is sharper than the one it replaces: **Kendrix has never published a reel intended to stay up.**

Alternatives Considered

**Keeping "Stories Published: 1" with a footnote.** Rejected. The number feeds the Phase 0 → Phase 1 gate, and a gate that can be crossed by an upload nobody kept is not measuring what the roadmap means by *consistently produce publishable content*.

**Rewriting decision-log 2026-08-11-001.** Rejected — the log is append-only. Its Status line now carries a forward pointer instead, so a reader cannot walk away believing a video is live, and its reasoning about per-channel ownership (which was correct and still holds) is untouched.

**Treating this as a reason to distrust the 08-10 audit.** Rejected, and worth saying explicitly: the audit's finding — that the disqualifiers were packaging, and two of three sat outside the video — is unaffected. What is corrected is a claim about the *repair's* validation, made eleven days later.

Expected Impact

Priority 1 becomes *publish one reel that stays up*, which is a smaller and more honest gate than the one it replaces. The audience read stops being a task at all: the poller was repaired 2026-08-21 and `YOUTUBE_API_KEY` is verified, so numbers arrive within ~6 hours of anything going live.

Review Trigger

Apply the liveness test to every other metric that claims a state: does it measure the state, or the event that created it? `publications.status` and `reels.status` are both event-shaped and neither is re-verified against the platform. A periodic liveness check on published rows would have caught this in six hours instead of eleven days — worth building only once more than one reel is live.

Related Documents

dna/company/current-metrics.md, decision-log 2026-08-11-001 (annotated), decision-log 2026-08-10-001 (the audit this does NOT overturn), decision-log 2026-08-21-002 (the poller repair this unblocks), apps/worker/src/metrics-poll.ts

---


### 2026-08-24-001

Status: Accepted

Title: Crossroads Is the Sole Customer Zero Channel for the Current Proof Lap

Decision

Focus the active Phase 0 proof loop entirely on **Crossroads**. Other channels do not count toward current roadmap progress, even when their historical artifacts remain useful for regression tests or past decision context. Reclassify Crossroads from an engineering fixture to the founder's Customer Zero channel and point the immediate gate at one Crossroads reel that stays live.

Why

The founder explicitly chose Crossroads as *our channel*. Splitting the proof across channels obscured the question the roadmap is trying to answer: whether Kendrix can repeatedly produce work the founder genuinely wants to publish on the channel they intend to operate. Crossroads also exercises the factual-grounding, depictive-fidelity and verified-identity foundations that have received the most recent production work, so completing its loop converts that work from internal verification into relevant Customer Zero evidence.

This decision changes the subject of the experiment, not the phase or its exit criteria. Phase 0 still requires a reliable storytelling engine; the immediate evidence remains a reel that stays live, followed by a real audience reading.

Alternatives Considered

**Publish the previous nearest candidate.** Rejected by the founder. Nearness is not useful if success on that channel is not the proof they want to pursue.

**Count all internal channels equally.** Rejected. It permits work to migrate toward whichever artifact is easiest to finish and makes Customer Zero evidence ambiguous.

**Erase historical references to other channels.** Rejected. The decision log is append-only, and technical specs should retain real historical examples. They no longer control current priorities or metrics.

Expected Impact

Roadmap attention, workflow metrics and audience evidence now have one subject. Engineering work on Crossroads can move the company state when it ends in a retained publish; work on other channels cannot silently substitute for that proof.

Review Trigger

Review only after Crossroads has published consistently enough to reveal whether the single-channel focus is producing useful learning, or if the founder explicitly changes the Customer Zero channel again.

Related Documents

ROADMAP.md, dna/company/current-metrics.md, dna/company/assumptions.md, decision-log 2026-08-22-001

---


### 2026-08-25-001

Status: Accepted

Title: Ending Meaning Belongs to Sound Direction, Not Renderer Guesswork

Decision

Represent the intended final cadence explicitly in the audio script as an anchored ending direction: which existing layer owns the close and whether it should button, resolve or ring out. Resolve that direction into an explicit ending interval with separate start, voice-end and picture-end boundaries. The renderer executes one continuous envelope across those boundaries, and QA measures the focused layer inside the ending window before the terminal fade.

Legacy audio scripts retain their existing genre-tail behavior during migration, but new scripts may not rely on a renderer-invented per-genre outro to communicate closure.

Why

Founder playback of Crossroads reel #2 exposed two different failures that whole-reel audio metrics did not see. The original cut went silent over its final held image because FFmpeg's sidechain-compressed music branch terminated when its shorter narration input ended. A manual post-mux music overlay removed the silence numerically but arrived as a new musical thought after the story, so the reel still felt awkwardly stopped.

The failure was not evidence for a universally longer fade. The story already had the right bed; it needed that same musical thought to begin resolving under the final phrase, survive the narration boundary, and close with the picture. That creative choice belongs upstream in sound direction. Renderer timing and QA can then execute and verify it without inventing taste.

Alternatives Considered

**Extend every genre's outro tail.** Rejected. Duration alone cannot decide whether a story needs a musical resolve, ambient ring-out or intentional silence, and it preserves renderer guesswork.

**Patch the final file with a late music overlay.** Rejected by founder playback. It passes presence thresholds while sounding like a postscript.

**Only lower the silence threshold or add whole-reel loudness checks.** Rejected. The defective cut already passed whole-reel technical review; the missing evidence was continuity inside the ending window.

Expected Impact

Sound direction now owns the meaning of the close, rendering preserves the selected layer across the actual voice boundary, and QA can reject a truncated ending before founder playback. The Crossroads repair used the existing generated music and added no provider cost; measured reel cost stayed $5.11.

Review Trigger

Review after this contract has produced endings across materially different story registers and languages. If anchored focus and three neutral shapes cannot express those endings without genre-specific rules, return with production evidence before expanding the schema.

Related Documents

packages/core/src/types/audio-script.ts, packages/core/src/types/timings.ts, packages/core/src/prompts/sound-designer.v1.ts, packages/core/src/timings/compute-timings.ts, packages/render/src/music/music-sync.ts, packages/render/src/ffmpeg/mix-audio.ts, apps/worker/src/pipeline/steps/render-qa-step.ts, ROADMAP.md, dna/company/current-metrics.md, dna/company/assumptions.md, decision-log 2026-08-06-003

---


### 2026-08-25-002

Status: Accepted

Title: Factual Shorts End on One Complete Human Payoff

Decision

For Crossroads factual Shorts, close the story by completing the causal promise and landing once on its human consequence. Stop immediately after that payoff, with only a short established-sound button. A document, object or image that echoes the premise may remain as visual subtext, but narration may not explain the callback again when doing so creates a second ending.

Do not force a grammatical loop, cliffhanger, CTA or moral onto a complete story. Those are format choices, not substitutes for satisfaction.

Why

Crossroads reel #2 passed technical sound review twice and still felt cut short in founder playback. The first failure was mechanical, but fixing it exposed the narrative failure: roughly 46 seconds built the risk, the successful ascent and reunion were compressed into about ten seconds, and the reel then supplied three endings. “Three men came home” completed the emotional arc; “The statement for disaster was never delivered” reopened it as an administrative footnote.

Current platform guidance treats satisfaction alongside engagement, and strong factual Shorts repeatedly use the same underlying shape: unresolved danger → irreversible action → visible result → human consequence → stop. The revised Apollo ending follows that shape without copying a creator's surface style. It gives ignition, lift, orbit and docking distinct beats, holds its longest breath before “Three men came home,” and leaves the disaster memo on screen as the unspoken contrast. Independent editorial, creator and sound review all returned PUBLISH.

Alternatives Considered

**Keep the memo sentence and improve its performance.** Rejected. A more solemn read would strengthen an afterthought, not turn it into the story's human consequence.

**End on the payoff but preserve a long resolving tail.** Rejected by the benchmark and prior playback. Strong short-form endings stop soon after the promise is fulfilled; the accepted cut uses a 650ms button.

**Force the final words to connect grammatically to the hook for an automatic replay loop.** Rejected. It withholds closure and optimizes a retention mechanic at the expense of viewer satisfaction.

Expected Impact

The Apollo reel's final sequence is now 61.8 seconds overall, passed automated QA and three independent perceptual gates, and awaits only founder playback. The bounded ending take cost $0.04, moving measured reel cost from $5.11 to $5.15 while reusing every existing visual and sound asset.

Review Trigger

Review after Crossroads has retention curves for several retained factual Shorts. If viewers consistently leave before the completed payoff or rewatch a different ending shape, use those moment-level curves to revise the pattern. One founder-approved artifact is a bar; it is not yet a universal law.

Related Documents

ROADMAP.md, dna/company/current-metrics.md, dna/company/assumptions.md, decision-log 2026-08-25-001, YouTube Help “Understand your content performance for YouTube's recommendation system,” YouTube Blog “YouTube Shorts deep dive,” Meta Real Talk Creative Playbook

---


### 2026-08-25-003

Status: Accepted

Title: The Story Chooses Its Ending Function; Short-Form Does Not Mean Hard-Stop

Decision

Choose the ending's function from the story: completion, relief, irony, redemption, warning, wonder or a
lesson only when the material earns one. Do not impose a moral, replay loop, CTA or immediate hard-stop as
a universal Shorts formula. When a counterfactual thread carries the story's meaning, resolve it before the
final human consequence so the last line remains the emotional destination rather than an administrative
postscript.

Treat delivery and release as part of that choice. A meaning-bearing coda may slow and warm the voice while
the action beats stay crisp. A `ring_out` must decay continuously after the final word; holding a flat bed
and applying a late fade is padding, even when the final duration and loudness pass QA. Reflective picture
may hold while the sound keeps evolving, then picture, captions and disclosure fade together to black.

Why

Founder playback rejected the 61.8-second Apollo cut that decision 2026-08-25-002 had called ready. That cut
correctly repaired the rushed launch → orbit → docking chain, but overlearned “stop after the payoff.” The
Safire memo was not merely visual texture: it was the story's counterfactual device. Leaving it unspoken made
the reel factual and efficient but emotionally incomplete.

Editorial, creator, sound and visual review converged on **relief sharpened by irony**, not a generic lesson
or literal redemption. The accepted structure is: the one engine fires; Eagle lifts, reaches orbit and docks;
“The disaster speech stayed on the page”; “Three men came home.” The memo resolves before the human final,
the last line changes to a warm plain delivery, and verified Earth/Eagle imagery replaces the document for
the closing hold. Platform guidance supports viewer satisfaction, cohesive storytelling and transformation;
ad-specific CTA frameworks do not become rules for an organic Crossroads story.

Alternatives Considered

**Keep the 61.8-second hard payoff because several reviewers passed it.** Rejected by the founder's direct
playback. A perceptual gate is evidence, not authority over the person operating the channel.

**Add a universal moral after “Three men came home.”** Rejected. “Courage conquers fear” or “always prepare
for failure” is not earned by this evidence and would create another ending after the human one.

**Put the memo explanation after the human final.** Rejected by the earlier cut. It turns relief into an
archival footnote. Meaning goes before “home,” not after it.

**Extend the tail without changing its motion.** Rejected by sound review. A flat two-second hold followed by
a one-second fade still feels padded; the ring-out must move continuously from the voice boundary.

Expected Impact

The Apollo candidate is now 65.7 seconds, remains in `spot_check`, and costs $5.21. The ending-performance
revisions cost $0.06; all verified visuals and existing sound assets were reused. The product now supports a
story-selected black fade for `resolve`/`ring_out` endings and a full-tail audio decay for `ring_out`, while
button endings retain a clean cut. This is one story-specific correction, not a quota for future codas.

Review Trigger

Review after several retained Crossroads reels use materially different ending functions. If creator
playback repeatedly asks for the same missing function, graduate a semantic ending contract upstream; until
then, do not turn this Apollo coda into a mandatory template.

Related Documents

ROADMAP.md, dna/company/current-metrics.md, dna/company/assumptions.md, decision-log 2026-08-25-001,
decision-log 2026-08-25-002, packages/render/src/music/music-sync.ts,
packages/render/src/remotion/compositions/ReelComposition.tsx, YouTube Help “Understand your content
performance for YouTube's recommendation system,” TikTok for Business Creative Guide

---


### 2026-08-31-001

Status: Accepted

Title: Retire the Cited EBN Editor Mechanism

Decision

Do not add a cited-Editor stage to the Evidence-Based Narrative path. Keep ordinary prose correction with the
Writer and gather the next ending/selection evidence from actual Crossroads production laps. Do not loosen
sentence lineage to rescue the mechanism; an Editor allowed to select new evidence or cross claim boundaries
would be a second Writer under another name.

Why

The preregistered nine-draft probe compared one bounded cited-Editor pass with a same-model fresh Writer
regeneration and the frozen Writer input. Only **1/9** Editor outputs passed the deterministic provenance and
176–216-word contract. Eight remained over budget; one also cited a fact outside its claim boundary. Fresh
Writer regeneration was **0/9** mechanically valid. Consequently, 17 of 18 comparisons resolved automatically
on hard constraints rather than taste. The one valid Editor draft won its blind comparison against the frozen
input, but one taste win cannot justify a mechanism that failed its defining responsibility on eight inputs.

The result validates the hypothesis's strongest objection: preserving every supported obligation leaves too
much material to compress, while relaxing evidence ownership turns repair into re-authoring. Exact Anthropic
spend was **$0.76**, including one failed schema/repair attempt whose attached cost was preserved. Production
and database rows were unchanged.

Alternatives Considered

**Loosen the lineage contract and rerun.** Rejected. That removes the boundary distinguishing an Editor from a
second Writer and would make a positive result architecturally uninterpretable.

**Judge all outputs despite duration/provenance failures.** Rejected. Blind preference cannot launder a failed
hard constraint; the preregistered bar deliberately makes provenance and duration vetoes.

**Add the stage provisionally because the architecture already names an Editor.** Rejected. Architecture names
a responsibility to test, not an implementation entitlement. Evidence-first development permits dormant
slots to remain dormant or be retired.

Expected Impact

No production code or pipeline stage is added. The active roadmap stays focused on the next materially
different Crossroads reel and the ending ledger. Engineering work on semantic handoffs remains gated on
recurring founder-playback evidence from those production laps.

Review Trigger

Reopen only after multiple new Crossroads stories show the same repair-shaped failure while the Writer's
evidence selection is demonstrably sound. Any future proposal must explain why it is not the same bounded
lineage mechanism tested here.

Related Documents

hypotheses/ebn-cited-editor.md, apps/worker/probe-ebn-cited-editor.json,
apps/worker/scripts/probe-ebn-cited-editor.ts, ROADMAP.md

---


### 2026-09-01-001

Status: Accepted

Title: Crossroads Becomes a Release Canary; Phase 0 Exit Becomes the Active Work

Decision

Freeze production of Crossroads reel #5 and run a ten-working-day Phase 0 exit sprint. The sprint succeeds only
when one fresh standard short-form reel completes through the deployed product from invite/sign-in through
channel, story, storyboard, production, review and export without terminal commands, direct SQL, one-off scripts
or engineering salvage. Creative judgment and review remain part of the workflow; invisible engineering rescue
does not.

The acceptance lap must also prove that a recoverable failure is visible to the creator, one-click retry resumes
from durable work without repeating paid calls or cost, tenant isolation and spend limits hold in automated tests,
and lint, typecheck, tests and build are green. Direct social publishing, billing, teams, long-form and public-launch
polish are outside this exit gate.

Leave the four retained Crossroads reels live and keep collecting their audience data. After Phase 0 exits,
Crossroads becomes a canary for meaningful releases or a bounded every-two-to-four-week product check, not the
default roadmap. The unfinished three-reel ending experiment remains paused at two observations rather than being
silently completed or discarded. Phase 1 begins only after the acceptance lap and an explicit founder decision.

Why

Four retained publishes establish that Kendrix can repeatedly produce founder-approved work. The fourth lap also
made the real bottleneck unmistakable: paid motion timeouts, a lost queue lock and durable-artifact recovery were
handled with operator scripts and infrastructure inspection. Another reel would add little proof of creative
repeatability while reinforcing a workflow that still depends on the builder. Phase 0's own exit criteria require
a stable end-to-end product and resolved critical production blockers; publishing more artifacts is not a
substitute for that reliability.

Alternatives Considered

**Produce reel #5 to complete the ending ledger.** Rejected for now. The experiment remains valid, but its marginal
learning value is lower than proving that the product can complete a reel without engineering intervention.

**Jump directly to Private Alpha.** Rejected. External creators should not be used to discover failures already
visible in Customer Zero's operator-dependent workflow.

**Treat “finish the SaaS” as a broad feature-building mandate.** Rejected. Billing, teams, long-form and launch
polish do not determine whether the founder-default short-form workflow can complete reliably.

Expected Impact

Workflow completion, recovery reliability, tenant safety, cost integrity and release confidence should improve.
New Crossroads production spend pauses during the sprint while the four live reels continue collecting passive
audience evidence.

Review Trigger

Review when one fresh standard short-form acceptance reel has completed through the deployed product with no
engineering intervention and all automated exit checks are green. The founder then decides whether Phase 0 exits
to Phase 1 or whether a specific failed criterion remains the bottleneck.

Related Documents

ROADMAP.md, dna/company/roadmap.md, dna/company/current-metrics.md, dna/company/assumptions.md,
ARCHITECTURE.md

---


### 2026-09-24-001

**Status:** Proposed — implementation ready for founder review; production opening remains gated.

**Title:** Complete the creator journey with free early access before further generation polish.

**Founder direction recorded:** Prioritize the whole journey for potential subscribers so signup can open;
the founder explicitly selected free early access first. No paid plan, price or phase advancement is inferred.

**Implementation:** Prepare verified signup, account recovery, account/usage and help, correct draft ownership
and export-at-limit failures, preserve suspension across paid background work, and align marketing entry points
with the studio's explicit signup mode. Keep approval mode as the default until deployment acceptance.

**Evidence:** Product/technical review found stuck pending accounts, no recovery, unsafe same-email OAuth
linking, foreign draft access and finished downloads blocked by spend limits. These failures directly prevent
a creator from entering, returning to, or completing the existing workflow.

**Alternatives:** Billing now was deferred by the founder's free-access choice. Continuing generation polish
first would leave these journey failures unresolved. Existing generation work remains preserved.

**Expected impact:** Improve activation and first-export completion; revenue stays unchanged. Added account
security and transactional-email operations have an explicit maintenance cost.

**Review trigger:** A fresh non-admin completes signup through export on the deployed acceptance build;
then review opening configuration and observed creator return/completion before monetization.

**Related:** `ROADMAP.md`, `specs/early-access-journey.md`, `specs/early-access-launch.md`.

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
