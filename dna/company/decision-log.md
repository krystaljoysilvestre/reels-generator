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
