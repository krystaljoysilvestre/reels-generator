---
name: api-cost-accounting
description: Every external paid API call MUST be cost-accounted — exact when the API reports usage, else the closest estimate from a documented per-unit rate — and rolled into the reel's spend, so per-reel unit economics stay monitorable for future pricing. Use when adding or reviewing ANY call to an external/paid service (LLM, image, video, TTS, SFX, music, or a new provider/model), including subscription-billed ones.
---

# Account for the cost of every API call

We price and monitor this product on **per-reel unit economics**. That only works if *every* paid call contributes a cost — an exact figure when the API reports usage, otherwise the **closest documented estimate**. A call that silently costs $0 is a hole in the model. This includes subscription/flat-fee services: attribute their marginal per-call cost (see below), never zero.

## The invariant

> Every external paid call returns a `costCents`, computed from a **documented rate**, and that cost reaches `reels.costCents` exactly once (never on a cache hit).

## Where costs are defined (keep rates here, with their source)

Rates are per-provider constants, each annotated with the plan + list price they're derived from. When you add a provider/model, add its rate here the same way — never a magic number inline.

- `packages/providers/src/llm/client.ts` — `MODEL_PRICING` (cents per Mtok, input/output) + `calcCostCents(model, inTok, outTok)`. Exact, from token usage.
- `packages/providers/src/fal/config.ts` — `FAL_VIDEO_COST_CENTS_PER_SEC`, `FAL_IMAGE_COST_CENTS`.
- `packages/providers/src/openai/config.ts` — `OPENAI_IMAGE_COST_CENTS` (per quality).
- `packages/providers/src/elevenlabs/client.ts` — `TTS_COST_CENTS_PER_1K_CHARS`, `SFX_COST_CENTS_FLAT`, `MUSIC_COST_CENTS_FLAT`.

Each constant's comment states the basis, e.g. `// ElevenLabs Starter ~$0.30/1k chars`. **Always include that** — the plan, the list price, and ideally the date — so the estimate can be re-derived when pricing changes.

## Exact vs estimate

1. **Exact** when the response reports usage (tokens, billed units) → compute from it (`calcCostCents`).
2. **Estimate** otherwise → `Math.ceil(units × ratePerUnit)` from the documented constant. Round UP (never undercount spend). Units = chars, seconds, images, or a flat per-generation figure when the service doesn't meter finer.
3. **Subscription / flat-fee services still get a per-call estimate**, not $0. Derive the marginal cost from the plan's unit price or included-quota value (e.g. a monthly char quota → cents/1k chars; a per-generation credit → cents/generation). We're modeling what a reel *would* cost at scale, so a subscription's "free" call still consumes attributable units.

## How the cost must reach the reel

- **Pipeline steps** — return `{ output, costCents }` from the `runStep(...)` callback. The harness (`apps/worker/src/pipeline/harness.ts`) atomically adds it to `reels.costCents` and returns `costCents: 0` on a **cache hit**, so idempotent re-runs never double-bill. Put the paid call *inside* `runStep` so a skip truly skips the charge.
- **On-demand API routes** (previews, reshoots, motion, voice) — the provider returns `costCents`; the route increments atomically:
  ```ts
  if (costCents > 0) {
    await db.update(reels)
      .set({ costCents: sql`${reels.costCents} + ${costCents}`, updatedAt: new Date() })
      .where(eq(reels.id, reelId))
  }
  ```
  Never `reel.costCents + costCents` (races when calls fan out). Guard so a cached/reused asset doesn't re-charge.
- The `assertBudget(reelId, spent, cap)` guard (`DEFAULT_BUDGET_CAPS_CENTS`) relies on this being complete — an unaccounted call lets a reel blow the cap invisibly.

## When you add a new paid call — checklist

- [ ] The provider function **returns `costCents`** (never void for a paid call).
- [ ] Cost is **exact from usage** if the API reports it, else **estimated from a documented rate constant** (rounded up).
- [ ] The rate constant lives in the provider config with a **comment citing plan + list price (+ date)**.
- [ ] Subscription/flat-fee call → still a **non-zero attributed estimate**, not $0.
- [ ] Cost reaches `reels.costCents` **once**: via `runStep`'s return (pipeline) or an atomic `sql` increment (route).
- [ ] **Cache hits / reused assets don't re-charge** (runStep handles skips; routes must guard).
- [ ] If it's a new provider/model, its rate is added to the pricing table/config — not hardcoded inline.

When reviewing, scan for: paid SDK/`fetch` calls that don't return or record a `costCents`, magic-number costs inline, and any `$0`/absent cost on a real external call (especially "it's on our subscription" — estimate it anyway).
