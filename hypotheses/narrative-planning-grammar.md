# Spec: Narrative Planning Grammar — the layer that shapes what the Planner selects

Status: **hypothesis, written down** — NOT committed architecture. No engine field exists or should exist yet. · Owner: PM · Eng: senior

> This document is a hypothesis, not a commitment. A Markdown spec is a design idea written down so it can be argued with and falsified; a first-class `narrativeGrammar` object would be a permanence commitment. We are deliberately at the first stage. Do not add a `narrativeGrammar` field anywhere in the engine on the strength of this document.

## The discovery

The valuable finding is not "different formats feel different." It is this:

> **Selection and telling are separable.** What makes a Reddit story land is *choosing the right dilemma*; what makes horror land is *the telling* (prose, pacing, restraint) on top of a correct premise. The two are different responsibilities, and a single abstraction governs only the first one.

A **Narrative Planning Grammar** (informally "narrative grammar") is the set of assumptions that shape **what the Planner selects and the high-level trajectory it commits to** — the *planning attractor*. It is named "planning" grammar on purpose: the evidence validates that it governs selection, and *only* selection. Prose quality, pacing, scene craft, dialogue, and emotional execution are governed by other systems and are explicitly out of scope (see [Non-goals](#non-goals)).

Every successful content format runs on its own planning grammar. It sits **above** genre, Story Elements, and [Story Modes](specs/story-modes.md), and **below** Channel DNA (see [Where it sits](#where-it-sits)).

## The falsifiability criterion

The only test that matters:

> **A planning grammar is real and useful iff changing it predictably changes the Planner's selection behavior, while the underlying planner architecture (prompt structure, pipeline stages, model) stays unchanged.**

This is a much stronger bar than "the stories feel different." It demands *prediction before output*: given a grammar, you can state what the Planner will select and what it will refuse, and then verify it.

## The five dimensions

A planning grammar is specified by five orthogonal dimensions. None is a genre label or a beat sheet — that is the point.

| Dimension | What it answers |
|---|---|
| **Audience question** | Why does the viewer keep watching? |
| **Narrative role** | Whose perspective drives the experience? (candidate dimension — see below) |
| **Engine of progression** | What causes the story to advance? |
| **Expected payoff** | What reward does the ending deliver? |
| **Resolution style** | What shape must the ending take? |

Filled in for the three formats validated so far:

| Dimension | reddit_story | informational | horror |
|---|---|---|---|
| Audience question | who's wrong? / what would I do? | why/how is that true? | what's happening, and how bad will it get? |
| Narrative role | participant | curious observer | victim |
| Engine of progression | dilemma + choices & consequences | collision → explanation | escalating dread + irreversible intrusion |
| Expected payoff | a verdict to argue / vindication | a re-tellable "oh, THAT's why" | fear that follows you home |
| Resolution style | judged / open (thrown to the jury) | resolved / explained | unsettling / unresolved |

The **Narrative role** dimension is the newest and least proven: it emerged from the informational validation ("agency isn't binary") and held cleanly on horror (victim). It stays a **candidate** dimension until a format with a genuinely new role (investigator, teacher) confirms it earns its own axis rather than folding into Engine of progression.

## Evidence so far — three tiers, not equal

The hypothesis has three validations, and honesty about their differing strength is part of the spec.

1. **reddit_story — causality [strongest].** Changing the grammar (from an implicit twist/novelty attractor to an explicit dilemma-first one) *visibly changed* the Planner's output: mystery/creepypasta premises with no interpersonal conflict → postable social dilemmas with agency and consequences. Cause and effect observed directly.
2. **informational — generalization.** The same mechanism, filled with a different grammar (collision, no agency, ending resolves), produced a completely different planning attractor on the first pass, with no planner-architecture change and no mystery-drift.
3. **horror — consistency, but overdetermined [weakest].** The Planner converged on the predicted behavior (normality → intrusion → irreversible contamination → escalating dread → unsettling ending) and refused the other grammars' shapes (no moral argument, no explanation, no neat resolution; investigative beats stayed dread-not-solution). But horror was already the best-supported genre (mature mechanics + registers), so its convergence is over-determined — it *confirms* the abstraction without *isolating* the grammar as the cause the way Reddit did.

Horror also produced the sharpest refinement: it reminded us that **selection is necessary but not sufficient**. A brilliant horror premise can still read emotionally flat, because fear lives in the telling. That is why this is a *planning* grammar, and why the telling layer is out of scope.

## Non-goals

To protect the abstraction from scope creep, the spec states what a planning grammar does **not** control:

> A planning grammar determines story **selection** and **high-level narrative trajectory**. It does **not** determine prose quality, pacing, scene craft, dialogue, emotional intensity, or stylistic execution. Those remain the responsibility of downstream planning and the writing/craft systems.

Concretely: "which dilemma is worth posting?" is grammar. "How scary should this sentence be?" is **not** — do not push it into the grammar, ever.

## Where it sits

```
Channel DNA            (who this channel is; its world, voice, canon)
      ↓
Narrative Planning Grammar   (the planning attractor: the 5 dimensions)
      ↓
Story Elements / Story Modes (the composition knobs + per-mode contract)
      ↓
Planner                (selects ONE idea within the grammar's attractor)
      ↓
Writer                 (executes the telling)
      ↓
Prose Craft            (editor / naturalizer / gate — sentence-level)
```

Planning Grammar does **not** replace Channel DNA, Story Elements, or Story Modes — it constrains *how the Planner interprets them*. The relationships that make it a distinct layer rather than a relabeling:

- Two channels can share a **grammar** but differ entirely in **Channel DNA** (a US office-drama Reddit channel and a Filipino family-drama Reddit channel run the same planning grammar).
- Two channels can share a **genre** but run different **grammars** (a horror channel telling existential-dread stories vs. a "creepy AITA" channel where the supernatural is the *object of a judgment dilemma* — same genre surface, different planning grammar, because "Discovery" splits into dilemma / investigation / existential / wonder engines).

## Current implementation vehicle (deliberately minimal)

The grammar's **selection half** is currently expressed through the per-genre `selectionLens` field on `WriterIdentity` ([writer-identities.v1.ts](packages/core/src/prompts/writer-identities.v1.ts)), rendered **planner-only** ([story-planner.v1.ts](packages/core/src/prompts/story-planner.v1.ts)) as a "HOW YOU CHOOSE" block that outranks the generic "pick the freshest premise" instinct. The other dimensions are implicit in existing identity fields (`purpose` ≈ payoff, `coreBelief`/`openingCraft` ≈ audience question, `registers`, and role/resolution stated inside the lens).

This is intentionally an under-formalization: no schema, no object, no cross-genre registry. It is enough to test the hypothesis and cheap to delete.

## What would earn formalization

A first-class `narrativeGrammar` object graduates from hypothesis to architecture only when **all** of the following hold:

1. The five dimensions survive at least one format with a genuinely **new narrative role** (detective/investigator, teacher/documentary, romance, tragedy, comedy) — an active attempt to *break* the axes, not to showcase them.
2. A concrete engineering benefit appears that the scattered `selectionLens` cannot deliver — e.g. a new format becomes materially easier to stand up *because* the grammar exists, or two channels need to share a grammar independent of genre.
3. A genre **needs** it to work — the same bar Story Elements and Channel DNA had to clear before they became first-class.

Until then: document, validate opportunistically, and treat every new format as another attempt at falsification.

## Protocol for the next format

1. Define its grammar (fill the five dimensions) **before** building anything.
2. State the prediction: what the Planner will select and what it will refuse.
3. Encode the selection half (a `selectionLens`); change nothing else in the planner architecture.
4. Run the probe; read the **plans**, not just the prose ([probe-genre-lab.ts](apps/worker/scripts/probe-genre-lab.ts) prints plan internals for this reason).
5. Record whether the prediction held, and — honestly — which evidence tier it belongs to (causality / generalization / consistency).

Related: [Evidence Bible](hypotheses/evidence-bible.md), [Kendrix Constitution](ARCHITECTURE.md), [Story Modes](specs/story-modes.md), [Story IR architecture](specs/story-ir-architecture.md).
