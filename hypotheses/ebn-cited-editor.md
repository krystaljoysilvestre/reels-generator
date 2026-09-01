# Hypothesis: A cited EBN Editor can repair prose without becoming a second Writer

Status: **Retired — controlled probe falsified the cited-Editor mechanism (2026-08-31).** The Editor remains
named in the EBN invariant but absent from the live chain. The bounded repair responsibility tested here did
not preserve evidence lineage and duration reliably enough to justify a new pipeline stage.

> Candidate claim: after a cited Writer draft fails factual, duration, or endpoint judgment, one bounded
> Editor pass can preserve its supported narrative intent while repairing the failed prose more reliably
> than a same-cost fresh Writer regeneration.

## Result — retired 2026-08-31

The mechanism failed before taste preference could meaningfully decide it:

- **Editor provenance/duration:** **1/9** candidates passed the deterministic contract. Eight were over the
  176–216 word window; one also cited `F21` outside its claim boundary. Editor drafts ranged from 216 to 284
  words, so the bounded pass did not perform the compression responsibility it was introduced to own.
- **Matched Writer regeneration:** **0/9** candidates passed. All nine were over budget; three also crossed a
  claim evidence boundary or dropped a source-cited Critical id.
- **Comparisons:** 17 of 18 pairs resolved automatically on hard constraints. The only blind taste judgment
  was Editor versus frozen Apollo run 1, which preferred the Editor; one judged win cannot rescue a mechanism
  that failed provenance and duration on 8/9 inputs.
- **Semantic check on the sole valid Editor:** two raw fidelity issues, a report-like close, and one observed
  ending kind. Those flags would require adjudication only if the mechanical gates had survived; they did not.
- **Cost:** **$0.76 exact Anthropic spend**, including the cost attached to one failed schema/repair attempt.
  The report is `apps/worker/probe-ebn-cited-editor.json`; production and database rows were unchanged.

The strongest objection proved correct: this Editor could not reduce the Writer's obligations without either
remaining too long or crossing evidence ownership. Do not add a cited-Editor stage and do not rerun this
mechanism with looser lineage—the loosened version would simply be a second Writer. The next evidence should
come from actual Crossroads production laps; recurring selection failures belong upstream in planning, while
ordinary prose correction remains the Writer's responsibility until production evidence says otherwise.

## Why this hypothesis exists

Crossroads exposed a repeatable trade-off rather than a missing prompt sentence:

- The frozen production controls were report-like in **9/9** drafts, with **2/9** double endings, **12**
  fidelity flags, and **6/9** drafts inside the 176–216 word window.
- Brief-only ending guidance worsened fidelity to **24** flags and did not improve preference.
- A richer Planner contract cut report-like closes but produced **29** fidelity flags and **0/9** drafts
  inside budget.
- Spoken Writer guidance preserved endpoint integrity (**0** doubles, **5/9** report-like) but produced
  **26** fidelity flags and only **3/9** drafts inside budget.
- Deterministic seven-to-five claim compaction won **7/9** blind comparisons, but still produced **29**
  fidelity flags, only **3/9** drafts inside budget, two double endings, and only two ending kinds.

The common failure is now narrower: natural, weighted prose improves the landing, but the Writer loses
factual stance and duration while trying to author and compress in one act. More Writer guidance has
already failed. Deterministic claim compaction reduced containers without reducing narrative obligations.

The architecture already declares:

```
Narrative Claims → Writer → Editor → Fact-Fidelity Checker → Narrative-Quality Checker
```

The live EBN path instead runs the Writer, optionally asks the Writer for a second complete compression,
then records `editor: ok` and `naturalizer: ok` although neither stage ran. This hypothesis asks whether the
declared Editor has a distinct, useful responsibility or is merely an expensive reroll.

## The proposed responsibility

The EBN Editor is a **Story-layer rejection repair**, not a gate and not a new author.

```
Writer candidate
  → diagnostic fidelity / narrative judgment
    → rejected candidate returns upstream to cited Editor
      → fresh authoritative FFC
        → fresh Narrative-Quality Checker
```

Diagnostic gates may name the axis, offending text, and failure reason. They never provide corrected prose.
The Editor authors a replacement candidate, invalidating every prior verdict. The accepted path still ends
`Editor → FFC → Narrative-Quality Checker`; no creative model runs after an accepted gate or production QA.

### Constitution answers

- **Proposal:** a complete replacement cited draft in the Editor's versioned output schema.
- **Anchor:** input sentence ids, existing claim ids, fact ids, and the immutable Evidence Bible version.
- **Determinism begins:** lineage, claim order, evidence subsets, preservation of source-cited Critical facts, peak anchoring, and
  the word window are validated in code before any semantic judge reads the candidate.
- **Verification:** fresh FFC judges factual meaning and stance; the Narrative-Quality Checker judges craft.
  Neither writes the repair.

## Narrow contract

The Editor receives the frozen Writer candidate, its sentence-level citation map, ordered claims, the exact
facts those claims permit, the immutable Bible identity, the language/channel brief, the production word
window, and structured diagnoses.

It may:

- delete repetition;
- merge or paraphrase supported sentences;
- reorder sentences only within their existing claim;
- add attribution or uncertainty qualifiers required by cited evidence;
- preserve, clarify, or remove explanation around the story's strongest supported terminal beat.

It must emit, for every output sentence:

- one existing `claimId`;
- one or more existing `sourceSentenceIds`;
- one or more `factIds` already available to both those source sentences and that claim.

It may not:

- acquire evidence or select a new factual angle;
- create, remove, or reorder claims;
- move the terminal claim away from last position;
- add a fact, dialogue, motive, chronology, or interpretation not licensed by the cited evidence;
- prescribe a moral, CTA, callback, human coda, hard stop, or any other ending form;
- consume gate-written replacement prose;
- reconstruct the story from scratch.

The ordinary fiction Editor is explicitly unsafe here: it is allowed to seed a new line and sharpen vague
details. EBN needs its own evidence-constrained contract.

## Probe — distinct responsibility, not rescue theatre

### Frozen substrate

Use all nine **writer-only** drafts from `probe-ebn-writer-landing.json`, not the rejected five-claim arm.
They isolate the exact residual failure: endpoint integrity improved, while fidelity and duration regressed.
Freeze each draft's claims, facts, Evidence Bible identity, editorial brief, language, model, and diagnoses.

### Creative arms

For each frozen draft, make two same-model, one-call candidates:

1. **Cited Editor** — receives the draft, its lineage, and diagnoses; must remain inside that lineage.
2. **Fresh Writer regeneration** — receives the same claims, facts, brief, and diagnoses but no prior prose.

Use the same Anthropic model, temperature, output budget, and one-call limit. Actual cost is reported per arm;
"matched" means equal creative-call opportunity, not pretending different token counts cost the same.

The regeneration arm is load-bearing. Without it, any improvement could be explained by extra sampling rather
than an Editor responsibility. If regeneration performs equally well, keep the simpler existing Writer loop.

### Deterministic validation

Before semantic judgment, reject a candidate that has any of these:

- unknown source sentence, claim, or fact id;
- a fact id outside both its source-sentence lineage and claim evidence;
- empty citations;
- new, missing, or reordered claims;
- a terminal claim that is no longer last;
- a Critical fact id cited by the source candidate but dropped by the Editor;
- a `peakSentence` that is not verbatim in the narration;
- narration outside 176–216 words.

A provenance failure is a treatment failure, not an invitation to retry or let a judge repair it.

Fresh FFC judgment still checks the semantic presence of every Critical fact in the Bible. This split is
deliberate: local preflight found that 3/9 frozen drafts omit one Critical *id* from their citation maps even
where overlapping cited evidence carries the same idea (Apollo F01 in two drafts; Fountain F25 in one).
Requiring the Editor to invent new sentence lineage for an id absent from its source would turn it into a
Writer; selecting six convenient drafts would bias the probe. The deterministic invariant is therefore
"the Editor drops no source-cited Critical id," while FFC owns semantic omission against the complete Bible.

### Fresh judgments

Run a new FFC and endpoint-integrity judgment on every valid candidate. Retain raw FFC output. Because the
current FFC has emitted self-contradictory and mislabeled flags, blind-adjudicate its flagged passages before
using semantic totals as architecture evidence. Deterministic provenance failures are never adjudicated away.

Run blinded pairs:

- Editor versus matched Writer regeneration — primary architecture comparison;
- Editor versus its frozen writer-only input — confirms that editing improved rather than merely changed it.

### Pre-registered survival bar

All conditions must pass:

1. **Distinct value:** Editor wins at least 6/9 blind pairs against matched Writer regeneration.
2. **Absolute improvement:** Editor wins at least 6/9 blind pairs against its frozen input.
3. **Provenance:** 9/9 Editor candidates pass every deterministic lineage check.
4. **Fidelity:** at most 12 adjudicated issues total, with zero confirmed unsupported additions, Critical
   omissions, attribution losses, certainty upgrades, or chronology distortions.
5. **Duration:** at least 6/9 Editor candidates are inside 176–216 words.
6. **Endpoint:** at most one double ending and at most five report-like closes.
7. **Diversity:** at least three ending kinds, with no kind in more than 6/9 drafts.

The bar is intentionally conjunctive. Blind preference cannot launder factual overreach; factual cleanliness
cannot excuse flat, report-shaped prose.

### Spend and operations

- Hard experiment ceiling: **$2.00**.
- Every paid call records exact `costCents` from reported Anthropic usage; error-attached usage also counts.
- Persist before and immediately after each paid call; resume skips completed attempt hashes and comparisons.
- Word count, lineage, evidence subsets, claim order, and preservation of source-cited Critical ids are code checks, never paid calls.
- No Writer retries, Editor retries, or unbounded correction loops.
- Probe spend stays in the local report. No reel or production database row changes.

## Outcomes

- **Survive:** every bar passes. Expand to a materially broader story batch; do not wire production yet.
- **Remain provisional:** Editor shows factual/duration benefit but cannot beat regeneration or the frozen draft.
  The responsibility is not distinct enough; gather real Crossroads repair evidence before another mechanism.
- **Retire this mechanism:** lineage, fidelity, endpoint, duration, or diversity fails. The root problem remains
  claim selection/planning, or the Writer must own it without another stage.

Even a pass is below Kendrix's roughly twenty-same-failure-story threshold for activating a creative stage.
Three source stories with repeated samples are still three stories. Production requires broader evidence plus
a separate RFC/review.

## Strongest known objection

The Editor may simply mask a defective plan. The five-claim failure showed that dense, concatenated claim
purposes preserve all the Writer's obligations while making attribution collapse more likely. A talented
Editor could hide that pressure by deleting material the Planner selected, quietly stealing fact-selection
ownership and becoming a second Writer. The lineage contract limits invention but cannot by itself prove the
Planner chose the right material. That is why the probe uses the cleaner writer-only arm, preserves every
claim and every Critical fact citation present in its source, compares against fresh regeneration, and treats a pass only as permission to test
more stories—not permission to ship.

## Council review — 2026-08-30

- **Editorial:** the failure is repair-shaped, but only a judgment-driven repair is a real Editor. Requested
  a matched regeneration control and warned that three stories cannot activate a new stage.
- **Technical:** the responsibility already exists in the spec; a rejection loop is constitutional if gates
  diagnose and fresh gates re-judge. Required deterministic sentence lineage and warned that the live FFC does
  not currently use the persisted citation map.
- **Finance:** the marginal production cost would likely be sustainable, but preferred a cheaper rescue-only
  probe under $1. The Orchestrator rejected that scope because it could not distinguish editing from another
  sample; the stronger controlled probe is capped at $2.
