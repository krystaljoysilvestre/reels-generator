# Hypothesis: BYO-with-Dossier — the Fact-Fidelity Checker can grade human prose

Status: **Provisional — probe not run.** A design hypothesis, not a commitment. Leave implementation
untouched until it clears the bar in [README](README.md): *the engine is blocked without it.*

> The gap in the current system: EBN's entire evidence chain (Extractor → Evidence Bible → cited Writer →
> Fact-Fidelity Checker) lives inside `generate_story`
> ([generate-story.ts:896-914](../apps/worker/src/pipeline/steps/generate-story.ts)). The BYO route skips
> that step by design, so creator-written narration can never acquire provenance — which is why
> decision-log 2026-08-03-001 rejects BYO on EBN channels outright. This hypothesis holds the ONLY
> candidate mechanism that could reopen that door honestly.

## The failure this explains (2026-08-03, design review, $0)

- The script shelf made the BYO door one click deep on every channel, including EBN — where the pasted
  script would have reached paid production with zero evidence discipline, wearing the channel's
  evidence branding.
- The door was closed by rejection, not by fact-checking, because no evidence exists that the
  Fact-Fidelity Checker works on text it didn't help produce. Every FFC validation to date —
  [[ffc-causal-probe]] (2026-07-23, 3/3 injected causal errors caught, $0.39) and the PR#21 production
  catch (missing Critical fact, Pax Silica) — ran on *generated* narration carrying claim references.
- A creator who has genuinely well-sourced narration of their own is therefore blocked, and told to
  paste their material as a dossier instead. That is the correct default and a real cost: their words,
  their sources, their byline — refused because our checker can't be trusted on their prose *yet*.

## Why this is a hypothesis, not a prompt bug

- **The FFC can't own it as-is.** Citability is what makes the FFC a lookup: each generated sentence
  carries the claim it expands, and transitively the facts that claim cited
  ([specs/evidence-based-narrative.md](../specs/evidence-based-narrative.md), "Citability" — an uncited
  sentence is by definition unsupported). Human prose carries no citation map, so the FFC on BYO text
  degrades to fuzzy semantic comparison — the exact architecture EBN was designed to avoid.
- **The Extractor can't own it.** It freezes a dossier into an Evidence Bible; it has no role that maps
  narration *backwards* onto evidence.
- **Story Modes can't own it.** The mode contract says what discipline generation runs under; BYO text
  never runs generation at all.

## The insight — if it works, it's a claim-reconstruction pass, not a new checker

The candidate mechanism: given creator narration + creator dossier, (1) extract the dossier into an
Evidence Bible as usual; (2) a reconstruction pass maps each narration sentence onto the claims it
*appears* to make; (3) the FFC then grades those reconstructed claims against the Bible exactly as it
grades generated ones. The open question is whether reconstructed claims are faithful enough that the
FFC's verdicts mean anything — reconstruction guesses intent, and a wrong guess produces a confident
verdict about a claim the creator never made.

## Non-goals

- **Not a fiction change.** Standard channels' BYO stays as-is; this is EBN-only.
- **Not a relaxation of the invariant.** Narration-before-evidence stays rejected; this would add a
  path where evidence arrives *with* the narration and the narration is graded against it.
- **Not auto-correction.** Like the existing fact gate, output is an advisory punch-list; the creator
  fixes their own words.

## Plan — a probe gates everything

**Phase 0 (cheap, no shipped code, ≈$0.50–1.50):** hand-write documentary narration from a real dossier
(reuse the [[ffc-causal-probe]] materials); inject N known factual errors across the three validated
shapes — scalar, causal paraphrase, stance inversion; run dossier → Extractor → reconstruction →
FFC; measure catch rate and fabrication rate.

Pass bar (mirrors ffc-causal-probe): **every injected error caught, zero fabricated corrections, zero
confident verdicts on claims the narration doesn't actually make.** The third clause is new and
load-bearing — it tests reconstruction, which generated text never needed.

Phase 1 (only after Phase 0 passes AND the review trigger in 2026-08-03-001 fires — a real creator
asking): seam inventory for a dossier-plus-script door through `generate_story`'s EBN branch.

## Strongest known objections

1. *"Even 100% catch rate proves factual similarity, not provenance."* Correct — and this is the
   objection the hypothesis must answer in writing before graduating. The candidate answer: for
   creator-supplied text the guarantee genuinely is weaker and that may be acceptable — their words,
   their sources, their byline, our advisory check — but that is a *product stance* the founder must
   ratify, not an engineering conclusion the probe can produce.
2. *"Reconstruction guesses intent."* A sentence mapped to the wrong claim gets a confident verdict
   about something the creator never said — worse than no verdict, because it launders an unchecked
   sentence as checked. Phase 0's third pass-bar clause exists to measure exactly this.
3. *"The demand is hypothetical."* No creator has asked. The review trigger requires a real request —
   the probe alone cannot graduate this.

## Falsifiability / death path

Phase 0 fails on catch rate or fabrications → the FFC does not transfer to human prose; retire this
file to `hypotheses/retired/` with the run outputs as the killing evidence, and the rejection in
2026-08-03-001 stands as permanent architecture. Phase 0 passes but objection 1 is never ratified →
same outcome. **Adoption threshold:** probe passed + founder ratifies the weaker guarantee + a real
creator request on record.
