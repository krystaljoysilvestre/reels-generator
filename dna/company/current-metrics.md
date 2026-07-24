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

2026-07-23

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

**Story believability.** The generation problem is two-layer: planners select passive stories, and writers won't dramatize agency and causality. Measured, not guessed — the 2026-07-19 fingerprint audit ran 12/12 failures on both the founder's human-feel test and our own gate.

Only one primary bottleneck should exist at any given time.

---

## North Star

Current North Star

Customer Zero consistently publishes high-quality stories using Kendrix.

---

## Current Priorities

Priority 1

Universal Writer fix — judge-and-force at the plan level (agency/causality), the lever behind the editorial pass rate.

Priority 2

Factual grounding — the Evidence-Based Narrative slice (Evidence Bible → Narrative Claims → citation-map Writer → Fact-Fidelity Checker), so factual genres stop shipping confident falsehoods. The load-bearing risk (catch a wrong causal paraphrase, not just a scalar?) was probe-cleared 2026-07-23. The 4-stage fidelity chain is BUILT (core modules + harness) and its success test reproduces on live credits: extractor faithful, clean narration passes, all injected fictions detected. Sequencing decided 2026-07-24 (decision-log 2026-07-24-001): EBN leads with **Historical Events / documentary**, not True Crime. **Slice 1 (the factual text path) is now BUILT + wired into production and verified E2E** (2026-07-24, uncommitted): an opt-in `storyMode='ebn'` channel ingests a curated dossier → frozen Evidence Bible on the reel → Narrative Claims → cited Writer → Fact-Fidelity Checker → lands at story_review with the FFC verdict surfaced; fiction path provably untouched; migration 0044; multi-tenancy 7/7. Remaining: Slice 2 = the illustrative rendering profile (Tier A, cheap) + disclosure; Tier B (data-driven maps/timelines) deferred; plus the owner-owned legal & sourcing decisions.

Priority 3

First supervised live production lap on a Customer Zero channel — turns "publishable" from a claim into a reading.

---

## Creator Success

| Metric                     | Current | Trend |     Target | Notes |
| -------------------------- | ------: | :---: | ---------: | ----- |
| Stories Published          |       0 |   →   |     Weekly | Publishing rails built; first supervised live lap pending |
| Publishing Consistency     | Not yet started |   →   |     Weekly | Begins when the first channel goes live |
| Customer Zero Satisfaction | Not yet measured |   →   |  Improving | Weekly founder review starts with publishing |
| Workflow Completion        | Not yet measured |   →   | Increasing | End-to-end runs work; unattended completion rate not yet tracked |

---

## Product Quality

| Metric               | Current | Trend |     Target | Notes |
| -------------------- | ------: | :---: | ---------: | ----- |
| Editorial Pass Rate  | Near zero (first attempt) |   ↑   | 60% first-attempt | First recorded gate pass 2026-07-20 (children's). Threshold owned by the minimal-review gate policy |
| Story Quality Review | 0/12 human-feel (2026-07-19 audit) |   →   |  Improving | 12/12 failed the founder's five-question human-feel test; root causes: agency, causality, cinematic vagueness |
| Visual Consistency   | Qualitative only |   →   |  Improving | Story Bible + reference conditioning shipped; no metric yet |
| Audio Quality Review | Qualitative only |   →   |  Improving | Full render-and-listen tuning pass still pending |

---

## Operational Health

| Metric                        | Current | Trend |     Target | Notes |
| ----------------------------- | ------: | :---: | ---------: | ----- |
| Generation Success Rate       | Not yet measured |   →   |       >95% | Per-step timeouts + stuck-reel reaper shipped; rate not yet tracked |
| Average Story Generation Time | Not yet measured |   →   |     Stable |       |
| Average AI Cost per Story     | Instrumented; baseline pending |   →   | Decreasing — never at taste's expense | Per-reel cost accounting is live; baseline reads from the next full lap |
| Production Reliability        | Improving |   ↑   |  Improving | Pipeline liveness work (timeouts, reaper) landed July 2026 |

---

## Business Health

Current phase does not optimize business metrics.

Monitor only.

| Metric             |          Current | Trend | Notes                   |
| ------------------ | ---------------: | :---: | ----------------------- |
| Revenue            |                — |   →   | Informational           |
| Active Creators    |    Customer Zero |   →   | Informational           |
| Willingness to Pay | Not yet measured |   →   | Roadmap phase dependent |

---

## Active Experiments

Each experiment tests a named assumption in company/assumptions.md. Both current experiments test **Minimal-Review Quality Is Achievable** (Phase 0).

| Experiment | Hypothesis | Expected Metric Impact | Status |
| ---------- | ---------- | ---------------------- | ------ |
| Judge-and-force at the plan level | Structural agency failures are fixed by forced re-planning, not line rewrites | Editorial pass rate ↑ | Plan-level mechanism shows a clean n=3 signal (2026-07-23: 3/3 paired runs control-FAIL→forced-PASS, doctor converged in 1 repair, non-cosmetic evidence). Built opt-in in production (STORY_PLAN_GATE, default off, fail-safe). Open: owner blind agency read; full n=6 deferred as marginal spend — mechanism already clear |
| Prescribe variation, not shortness | The sentence-rhythm monoculture is self-inflicted by "short lines" prompts | Story quality review ↑ | Shipped to main (PR #14, 2026-07-20) with a rhythm-variety gate criterion; children's-validated only — cross-genre regression sweep (drama/horror/reddit) is the open work |

---

## Current Risks

* Story believability inconsistency — the primary bottleneck; caps everything downstream.
* Factual fabrication — the gate is blind to wrong facts and hallucinates its own corrections; factual genres can ship confident falsehoods until externally grounded.
* Unattended reliability is unproven — no live production lap has run end-to-end without supervision yet.

---

## Key Learnings

From the current period (the 2026-07 genre sweep and craft program):

* Craft needs judgment, not asking — written guidance is satisficed at every generative stage; only gates reliably work.
* Raw writer output ≈ final output — the polish stages are cosmetic; the writer and planner are where quality is decided.
* The gate cannot self-check facts — it approves myths and hallucinates corrections; factual truth requires external grounding.
* Goal-first genre architecture works — the children's module produced the first recorded gate pass.
* Prescribed surface features become monoculture — we manufactured our own sentence-rhythm AI-tell.

---

## Decisions Made

Major decisions are recorded in company/decision-log.md; this section lists the period's entries.

* DNA set v1 established (2026-07-23): 13 stable documents plus this living layer; ARCHITECTURE.md amended to v1.1 (foundations principle 7).
* The gate gets teeth (2026-07-19): regenerate-until-pass at the 60% first-attempt flip trigger — see the minimal-review gate policy.
* Retention work parked (2026-07-20) behind the believability path and real audience data.

---

## Next Review

Date

2026-07-30

Questions

* Did the primary bottleneck change?
* Did our experiments work?
* Which assumptions were validated?
* Which assumptions failed?
* Does the roadmap phase still accurately describe the company?
