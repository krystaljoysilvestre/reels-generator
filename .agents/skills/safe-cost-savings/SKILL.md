---
name: safe-cost-savings
description: Find API/model cost savings that DON'T sacrifice product quality — separate mechanical WASTE (safe to cut) from TASTE investment (never cut on a cost argument alone; A/B on a probe batch first). Use when asked to reduce API spend, evaluate a cheaper model/plan/token budget, drop or downgrade a pipeline stage, or judge whether a proposed cost cut is safe.
---

# Cut waste, never taste

Someone asks "can we spend less on X?" The wrong reflex is to reach for the biggest line item and make it cheaper — that's usually a quality stage, and you find out you cut taste only after the product gets worse. This skill is the discipline for saying **yes, safely** or **no, that's a quality cut in disguise**.

The counterpart skill `api-cost-accounting` makes sure every cost is *visible* (`costCents`). This one governs which of those visible costs you're allowed to *remove*.

## The one distinction: Waste vs Taste

Before touching any cost, classify it. (Same shape as `unbiased-design`'s constraint-vs-choice.)

- **WASTE** — spend that buys nothing the viewer receives. *Safe to cut; no A/B needed, just verify the behavior is unchanged.*
  - Paid work that gets **discarded** (a refinement pass thrown out for bounds violations — you paid the model, kept nothing).
  - A call that **re-charges on what should be a cache hit** (unstable `inputHash` → idempotent re-run bills twice).
  - **Redundant** calls (the same thing computed twice; two stages that overlap).
  - An **LLM doing a deterministic job** a validator/regex/schema could do for free.
  - **Retries triggered by a mechanical failure** a cheap pre-check would have caught before the expensive stage ran.
- **TASTE** — spend on a judgment the viewer feels: the Writer's prose, the Gate's ship/no-ship call, the Naturalizer's ear for the register. *Never cut on a cost argument alone. A cheaper model/tier/skip here is a product change — it must be A/B'd on a probe batch and only ships if quality holds.*

> **The invariant:** a cost is safe to cut only if you can show the viewer receives the same thing. For WASTE that's a behavior check. For TASTE that's a quality A/B — no A/B, no cut.

## Two traps that make people cut the wrong thing

1. **The cheapest-looking stage is often the highest-judgment one.** A stage's cost is dominated by its *output* tokens. The Gate does the subtlest editorial judgment in the pipeline but emits ~a sentence (`maxTokens: 512`), so it's already cheap — downgrading its model saves almost nothing and risks the decision that gates what ships. **Rank candidates by (dollars saved × safety), and compute the dollars first** — the subtle stages usually save the least. (This is the exact mistake to avoid: don't call the gate a "safe cut.")
2. **A frequently-discarded stage is a tuning bug, not a model-tier problem.** If a refinement pass is often thrown out (`discarded_wordcount` / `discarded_peak` / `discarded_formatting` in `generate-story.ts`), you're paying full price for output you delete. **Fixing the discard rate is free savings with zero quality cost** — tune the prompt so it stays in bounds. Downgrading its model instead usually *raises* the discard rate (weaker model → more bounds violations → more paid-and-deleted passes).

## Where the money and the levers live

- `packages/providers/src/llm/client.ts` — `MODEL_PRICING` (cents/Mtok) and `DEFAULT_MODEL`. This is where a tier change happens; it's also how you price a proposed cut *before* proposing it.
- `apps/worker/src/pipeline/steps/generate-story.ts` — the story chain. `costCents +=` at each stage shows the per-stage spend; the `refine(...)` discard branches are the canonical WASTE example; the single gate-steered retry (`runChain(verdict.reason)`) roughly doubles a story's Codex cost when the gate fails.
- `apps/worker/src/pipeline/harness.ts` — `runStep` returns `costCents: 0` on a cache hit. A cost that *should* be cached but isn't is WASTE; suspect `inputHash` instability first.
- `apps/worker/scripts/probe-genre-lab.ts` (and `probe-registers.ts`) — the A/B instrument. Every proposed TASTE cut is validated here: baseline vs. cheaper variant, same prompts/gate, read the batch. The `/verify` skill is the end-to-end backstop.
- Per-provider config (`fal/config.ts`, `openai/config.ts`, `elevenlabs/client.ts`) — non-LLM spend; same rules (a reused/cached asset that re-charges is WASTE; a quality knob like image quality is TASTE).

## The method

1. **Is the spend even the bottleneck?** Check volume × unit cost against what it's costing the business. `costCents` per reel is already tracked. Pre-revenue and mostly validating? Cutting quality to save single-digit cents is premature — say so and stop.
2. **Enumerate the cost, classify each line WASTE or TASTE.** Don't skip to the biggest number.
3. **Take all the WASTE first.** Discards, double-bills, redundant calls, LLM-doing-a-validator's-job, retries on mechanical failures. These need only a behavior check (`/verify`, or a probe run confirming output is unchanged), not a quality A/B.
4. **Price any remaining TASTE cut before proposing it.** Compute the actual dollar delta from `MODEL_PRICING`. If it's small (subtle stages usually are), it's not worth the risk — drop it.
5. **A worthwhile TASTE cut ships only after an A/B proves quality holds.** Run `probe-genre-lab.ts` baseline vs. variant on the affected genres, read the narrations and gate verdicts, watch discard rates. No quality regression → ship. Any regression → the saving isn't real.
6. **Never trade against a stated product goal.** A cut that shifts work back onto human review contradicts a "minimal review" goal even if the tokens go down — that's a cost increase somewhere the token meter doesn't see.

## Checklist before proposing any saving

- [ ] Classified as **WASTE or TASTE** — not skipped straight to the biggest line item.
- [ ] All **WASTE** cuts taken first (discards, double-bills, redundant/LLM-for-deterministic, mechanical retries).
- [ ] For a discard-heavy stage, considered **fixing the discard rate** (free) before touching its model.
- [ ] Dollar delta **computed from `MODEL_PRICING`**, not assumed — and it's big enough to be worth any risk.
- [ ] Ranked by **(saving × safety)**; confirmed the candidate isn't a small-output/high-judgment stage.
- [ ] Any **TASTE** cut has an **A/B on a probe batch** showing no quality regression — else not shipped.
- [ ] The cut doesn't **shift cost off the token meter** onto human review or a downstream stage, and doesn't contradict a stated product goal.
- [ ] Cost accounting stays intact (`costCents` still reaches the reel once) — see `api-cost-accounting`.
