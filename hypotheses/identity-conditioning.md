# Hypothesis: Identity Conditioning — a real person wants the opposite mechanism to a real place

Status: **SPIKE-GATED. Nothing is wired.** Split out of `real-places.md` when that graduated to
[specs/depictive-fidelity.md](../specs/depictive-fidelity.md) on 2026-08-12 — the shipped human path
deliberately routes *around* this fork rather than solving it. · Owner: PM · Eng: senior

## The fork

The 2026-07-20 spikes (`spike-pulid.ts`, `spike-pose.ts`, both throwaway and since deleted) found that the
pasted-on look on a conditioned face was not a colour bug — it was the **operation**:

- `/edit` **composites** the source pixels. Correct for a PLACE: we want the real building copied.
- A face wants an **identity model** (PuLID) that extracts *who this is* and **re-synthesises** the person
  fresh, lit by the scene. Confirmed integrated, no cutout, with `id_weight` tuning likeness↔naturalness.

**But PuLID conditions on the face only and invents the background**, so it does not preserve a specific real
place. "A real person standing in the real place" in one frame needs a subject-identity reference and a
scene/structure reference simultaneously — that is the unsolved problem.

A second trade sits underneath it. Single-reference identity is essentially a *frontal* identity:

| Model | Likeness | Re-posing |
|---|---|---|
| PuLID | tightest | frontal-locked; ignores pose prompts |
| `fal-ai/instant-character` (FLUX) | slightly looser | follows pose prompts — true profile, bowed, from behind |

True keypoint pose control would need a custom ControlNet workflow on fal. `ip-adapter-face-id` has no pose;
`instant-character` does pose via prompt only.

## Why the shipped build doesn't need this

Depictive fidelity ships historical humans on `/edit`, accepting the trade knowingly:

- The paste artefact is a **hard-case** artefact (colour scene + off-angle + mismatched source tone), not a
  property of faces — a frontal, tonally-uniform portrait integrates cleanly (`spike-regen-reference.ts`).
- The archival-plate seam that *did* show up (grayscale head on a colour body) has a cheaper fix, now
  shipped: colourise the plate before conditioning.
- Frontal-lock costs shot variety on reconstruction beats. Real, and accepted for v1.

So this is a **quality** ceiling, not a correctness or safety one. Nothing is blocked.

## What would earn the build

The graduation bar is the standard one — *the engine is blocked without it*. Concretely, any of:

1. **Reconstruction beats read as stiff** on a real historical channel, and the frontal-lock is the diagnosed
   cause (not prompt or planning). Measure before building.
2. A channel genuinely needs **a real person in a real place in one frame**, which no current mechanism does.
3. Ordinary fictional characters show the same paste artefact often enough that the identity model becomes
   the better default for *every* person — the spike noted this as plausible ("for an ordinary reel character
   with no real-world counterpart there's no conflict — the identity model is simply the right default").

Note that (3) is a *bigger* prize than (1) and (2): it would improve every character in every genre, not just
the factual path. It is also the one nobody has measured.

## The spike that gates it

Re-run the mechanism comparison — the original scripts were throwaway and are gone:

1. Same character plate, same three scene prompts, rendered via `/edit` vs PuLID vs `instant-character`.
2. Blind-rate: integration (cutout vs lit-by-the-scene), likeness, and pose compliance.
3. Include a colour scene with an off-angle request — the hard case, where `/edit` is known to fail.

**Falsifier:** if `/edit` holds up on the hard case with the colourisation fix in place, this retires — the
fork was a property of monochrome archival plates, not of faces.

## Constraints if it is ever built

- New provider wiring + per-call cost accounting (the api-cost-accounting rule applies).
- **Per-entity mechanism routing**: a scene mixing a real place and a real person would need two engines for
  one frame, which is the unsolved part. Do not ship a router that silently drops the place reference.
- It changes nothing about the depictive-ethics floor. An identity model makes likeness *better*, which makes
  the living-person prohibition MORE important, not less — none of this reopens who may be depicted.
