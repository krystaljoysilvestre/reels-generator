# Spec: Narrative Planning Grammar — the layer that shapes what the Planner selects

Status: **hypothesis, written down** — NOT committed architecture. No engine field exists or should exist yet. · Owner: PM · Eng: senior

> This document is a hypothesis, not a commitment. A Markdown spec is a design idea written down so it can be argued with and falsified; a first-class `narrativeGrammar` object would be a permanence commitment. We are deliberately at the first stage. Do not add a `narrativeGrammar` field anywhere in the engine on the strength of this document.

## The discovery

The valuable finding is not "different formats feel different." It is this:

> **Selection and telling are separable.** What makes a Reddit story land is *choosing the right dilemma*; what makes horror land is *the telling* (prose, pacing, restraint) on top of a correct premise. The two are different responsibilities, and a single abstraction governs only the first one.

A **Narrative Planning Grammar** (informally "narrative grammar") is the set of assumptions that shape **what the Planner selects and the high-level trajectory it commits to** — the *planning attractor*. It is named "planning" grammar on purpose: the evidence validates that it governs selection, and *only* selection. Prose quality, pacing, scene craft, dialogue, and emotional execution are governed by other systems and are explicitly out of scope (see [Non-goals](#non-goals)).

The formats examined so far each ran on a *distinguishable* planning grammar; whether this generalizes to **every** format is the open claim under test, not an established fact. Its place in the stack — above genre / Story Elements / [Story Modes](specs/story-modes.md), below Channel DNA — is a **proposed placement** (see [Where it sits](#where-it-sits)), not a shipped layer: today the only implementation is a per-genre selection lens. The genuinely earned artifact right now is a **lens-authoring discipline** (the [protocol](#protocol-for-the-next-format) below); the layer is the future claim.

## The falsifiability criterion

An earlier version of this criterion — *"changing it predictably changes the Planner's selection, architecture unchanged"* — was itself **falsified** by the valence experiment (below). Valence changed selection predictably, yet the correct conclusion was that valence is a channel/operator lever, **not** a grammar axis. So that criterion tested only **lever-ness** (does the planner obey an instruction?) — which *every* explicit knob passes — and cannot distinguish a grammar axis from an ordinary channel setting.

The corrected criterion is a **two-part test**. A dimension is a genuine grammar axis only if it:

> 1. **Varies across formats** — changing it is part of what makes one format not another (reddit_story ≠ horror); **and**
> 2. **Is invariant within a format** — every channel running that format shares the setting *regardless of Channel DNA*.

**Falsification protocol for any candidate dimension: vary it across channels of the *same* format.** If the format survives the variation, the dimension is **Channel DNA, not grammar** — exactly how valence was demoted (channels of one format legitimately differ on comfortable-vs-irreversible endings, failing part 2). "The planner obeyed the instruction" is necessary but nowhere near sufficient.

## The candidate decomposition (five dimensions — unvalidated as axes)

Our current best decomposition is **five candidate dimensions** — a post-hoc taxonomy fitted to the formats examined so far, **not** a validated axis set. No dimension has ever been varied *in isolation* (each experiment swapped one whole lens — a holistic prose paragraph — for another), so "orthogonality" is a hypothesis, not a finding. Treat these as a decomposition to test, not a definition. None is a genre label or a beat sheet.

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

The **Narrative role** dimension is called out as a candidate below — but the same skepticism applies to **all five**: none has independent evidence of being an *axis* rather than a *facet* of one, and role still needs a genuinely new-role format (investigator, teacher) to earn its place.

**One facet has since been varied in isolation — and it moved out.** A controlled experiment held everything constant and swapped only the *resolution valence* (comfortable ↔ irreversible cost). The planner complied immediately in both genres tested — i.e. valence is **steerable by channel DNA**, an *operator lever*, not a planner axis (it fails part 2 of the two-part test above: channels of the same format legitimately differ on it). So the "Resolution style" row is at best partly a grammar concern; its comfort/valence facet belongs to Channel DNA / [Story Modes](#boundary-narrative-planning-grammar-vs-story-modes). That is one facet tested and demoted, the rest untested — exactly why the table is a decomposition to falsify, not a definition.

## Evidence so far — three tiers, not equal

The hypothesis has three validations, and honesty about their differing strength is part of the spec.

1. **reddit_story — causality [strongest].** Changing the grammar (from an implicit twist/novelty attractor to an explicit dilemma-first one) *visibly changed* the Planner's output: mystery/creepypasta premises with no interpersonal conflict → postable social dilemmas with agency and consequences. Cause and effect observed directly.
2. **informational — generalization.** The same mechanism, filled with a different grammar (collision, no agency, ending resolves), produced a completely different planning attractor on the first pass, with no planner-architecture change and no mystery-drift.
3. **horror — consistency, but overdetermined [weakest].** The Planner converged on the predicted behavior (normality → intrusion → irreversible contamination → escalating dread → unsettling ending) and refused the other grammars' shapes (no moral argument, no explanation, no neat resolution; investigative beats stayed dread-not-solution). But horror was already the best-supported genre (mature mechanics + registers), so its convergence is over-determined — it *confirms* the abstraction without *isolating* the grammar as the cause the way Reddit did.

Horror also produced the sharpest refinement: it reminded us that **selection is necessary but not sufficient**. A brilliant horror premise can still read emotionally flat, because fear lives in the telling. That is why this is a *planning* grammar, and why the telling layer is out of scope.

## Refinement: agency is climax-causation, not choice-presence [2026-07-19 fingerprint audit]

A 12-story audit (3 shorts × reddit_story / horror / drama / comedy, full production chain, plans read not just prose) **partially falsified the *strength* of the reddit causality claim above.** With the selection lens in place, the planner *did* start naming dilemmas and choices — but the narrator's agency failed **12/12 anyway**, and the gate caught every one. The failure is precise and cross-genre: the story's **climax is not caused by the narrator's decision.** Even plans that contain a mid-escalation choice hand the *payoff* to another agent — the boss makes the last-minute save (reddit "meeting"), the crowd self-destructs (comedy "karaoke"), a metaphor "realizes" the theme (drama "LRT"). The lens moved *what the planner talks about*; it did not move *what causes the ending*.

So "encode a lens → get agency" is **necessary but insufficient** — the same lesson valence taught, one level deeper. The sharpened constraint the Engine-of-progression / Expected-payoff dimensions must carry is **grammar-dependent**, not a single universal rule:

> **Agency is a property of the committed spine, not a choice sprinkled in the escalation.** The **floor, everywhere:** the narrator must **do or own a choice** — not merely witness and feel. (A folder appearing, footsteps happening, a coma, a wallpaper changing = witness, not agency.) The **ceiling is grammar-specific:** for **agency-grammars** (revenge / malicious-compliance / TIFU) the payoff must route *through* the narrator's choice, not get handed to another agent; for **confession / creepy-encounter / helpless grammars**, earned passivity is legitimate — the narrator acts *within* a situation they don't control, and the ending may authentically not resolve. "A choice exists somewhere in the middle" is choice-presence, not agency; "the climax must be the narrator's doing" over-reaches into grammars where helplessness is the point.

This tightens an existing dimension (it is about the shape of the committed spine), so it stays a **selection** concern and the Planner's; it is **not** a new axis.

**Two-sided validation (2026-07-19).** The failure is direct and reproduced across all four genres at n=3 (12/12), not overdetermined — evidence tier **causality [strong]**. A **control** then pushed the five hand-authored reddit exemplars through the *same* gate: **4/5 passed** — so the gate discriminates (it is not a harsh grader that fails everything), which means the 12/12 AI failure is a real human↔AI gap, not an instrument artifact. Critically, the exemplar that passed included a **creepy-encounter whose climax the narrator does not cause** (photos simply appear; the narrator only runs the tape test and tells their mother) — the gate passed it for acting-and-owning within an unresolved situation. That is the empirical bound above: the earlier "climax caused by the narrator's decision" phrasing was too strong, and this is why the rule is stated per-grammar.

**Intervention test (2026-07-19, reddit selectionLens, n=2/iteration).** The lens already *stated* the agency mandate, yet the planner disobeyed it — because `registers` (which bless the passive DISCOVERY / CREEPY-ENCOUNTER shapes) render *before* the buried lens clause. So the lever under test was **salience**, not existence. Two iterations, reading the plans: (v15) promoting a concrete agency gate to first position moved the *surface* — off the supernatural registers, decision-verbs added — but the planner **satisficed** into a new passive attractor ("witness-to-a-secret": the narrator watches others' conflict and asks around). (v16) re-cutting the gate around **spectatorship** — *the narrator must be the subject of their own story, not a witness to someone else's* — **closed that loophole**: premises marched `folder-appears → witnessed-affair → found-money-I-must-decide / opened-a-package-I-must-decide`. Finding: **planner selection is a real, steerable lever (the monotonic premise arc is the evidence), but it is not the whole fix** — with selection improved, the residual gate failures *migrated downstream* to the **Writer** (it collapsed the plan's decision into panic + rhetorical questions — gate: "premise is salvageable… the script needs the narrator to actually DO something") and to **ending craft**. This is the two-layer split confirmed by intervention: the grammar owns selection and selection responded; the telling failures are the telling's to fix. **Not a graduation event** — a scattered `selectionLens` carried the whole intervention; nothing here needs a first-class object yet.

## Non-goals

To protect the abstraction from scope creep, the spec states what a planning grammar does **not** control:

> A planning grammar determines story **selection** and **high-level narrative trajectory**. It does **not** determine prose quality, pacing, scene craft, dialogue, emotional intensity, or stylistic execution. Those remain the responsibility of downstream planning and the writing/craft systems.

Concretely: "which dilemma is worth posting?" is grammar. "How scary should this sentence be?" is **not** — do not push it into the grammar, ever.

The 2026-07-19 audit named two telling-half failures this grammar must **not** absorb, even though they surfaced in the same probe: **mundane over-specificity** (the lived, oversharing detail — names, amounts, dates — that makes a story read *real*) and **rendered agency** (dramatizing a decision *as* a decision, not narrating it flat). Both are the **Writer / Teller's**, tuned via [narrator embodiment](packages/core/src/prompts/story.v2.ts), not this grammar. The planner must never pre-invent the specific detail — that would be an extract-don't-predict quota. The division of labor the audit clarifies: **selection commits the agentic spine; the telling makes it feel lived.** A brilliant agentic spine can still read fake without the texture, and no texture can rescue a spine whose climax belongs to someone else — the two failures are independent, and so are their owners.

## Where it sits

```
Channel DNA            (who this channel is; its world, voice, canon)
      ↓
Narrative Planning Grammar   [PROPOSED placement — today just a selection lens]
      ↓
Story Elements / Story Modes (the composition knobs + per-mode contract)
      ↓
Planner                (selects ONE idea within the grammar's attractor)
      ↓
Writer                 (executes the telling)
      ↓
Prose Craft            (editor / naturalizer / gate — sentence-level)
```

**This placement is PROPOSED, not established.** The only shipped implementation is the per-genre selection lens; drawing Grammar as its own layer is the claim under test, held here so it can be argued with — not asserted as fact.

If it *is* a distinct layer (not a relabeling), these must hold — and the first two are argued, the third is the open boundary:

- Two channels can share a **grammar** but differ entirely in **Channel DNA** (a US office-drama Reddit channel and a Filipino family-drama Reddit channel run the same planning grammar).
- Two channels can share a **genre** but run different **grammars** (a horror channel telling existential-dread stories vs. a "creepy AITA" channel where the supernatural is the *object of a judgment dilemma* — because "Discovery" splits into dilemma / investigation / existential / wonder engines).

**Conflict precedence:** when Channel DNA and the grammar's defaults disagree (a cozy-voiced channel running a dread grammar), **DNA wins** — it sits above the grammar and constrains it. This is consistent with the finding that resolution valence is DNA-steerable: the grammar supplies a default, the channel overrides it.

## Boundary: Narrative Planning Grammar vs. Story Modes

The doc argues grammar ≠ Channel DNA and grammar ≠ genre. The harder, previously-unargued boundary is grammar vs. **[Story Modes](specs/story-modes.md)** — both are "contract-ish" and both touch `selectionLens`/format language. The split (owner decision, and it aligns with the evidence):

- **Story Modes own *execution policy*** — narrator stance, interaction model, identity posture, **knowledge requirement**, structural constraints. *(Documentary forced a knowledge responsibility → a Mode concern.)*
- **Narrative Planning Grammar owns *selection behavior*** — which premises, conflicts, resolutions, and narrative equations the planner is biased toward **choosing**. *(Drama exposed a selection attractor → a Grammar concern.)*

Keep both concepts under this split; only collapse one into the other if, after defining them this way, they still overlap materially in practice. This boundary is the single most likely place the grammar hypothesis dies, so it is stated explicitly rather than assumed.

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

## Strongest known objection

*(Required section — every hypothesis states its own best counter-argument, so the doc can't advocate its way past falsification.)*

The evidenced thing and the named thing are different sizes. What's proven is that **explicit selection guidance in the planner prompt causally changes what the planner selects** — the lens as a *lever*, a holistic paragraph. What's *named* is a five-dimension layer. The dimensions are a post-hoc taxonomy at n≈3 with no dimension varied in isolation (and the one facet that *was* — resolution valence — turned out to be a channel/operator lever, not a grammar axis). So the honest reduction is: **the earned artifact is the lens-authoring discipline; "layer" and "five orthogonal dimensions" are claims under test.** If the Grammar-vs-Modes boundary above doesn't hold in practice, the concept should be absorbed into Story Modes rather than stand alone.

**Products most likely to break it:** *live / reactive commentary* (events dictate content, so there may be no meaningful selection step — attacking the premise that selection is the primary lever, not just the axes); and *interactive fiction* (the viewer holds both the payoff and the narrative role, breaking two dimensions at once).

Related: [Evidence Bible](hypotheses/evidence-bible.md), [Kendrix Constitution](ARCHITECTURE.md), [Story Modes](specs/story-modes.md), [Story IR architecture](specs/story-ir-architecture.md).
