# Spec: Evidence Bible — the owner of factual truth

Status: **hypothesis, written down** — NOT committed architecture. No stage, field, or schema exists or should be built yet. · Owner: PM · Eng: senior

> This is a design hypothesis, not a commitment. Leave implementation completely untouched until the spec survives review. The bar it has already cleared is the one written into [narrative-planning-grammar.md](hypotheses/narrative-planning-grammar.md): *a product actually needs it* — documentary cannot reliably keep its core promise without it.

## Why now — a different path to first-class

Two abstractions crossed the threshold in the same week by **opposite routes**, and the distinction matters:

- **Narrative Planning Grammar** earned its place by *repeatedly explaining and predicting planner behavior* across formats.
- **Evidence Bible** earns its place because its *absence causes a product failure that cannot be solved in any existing layer.*

The proof is the Tacoma Narrows documentary from the 2026-07-18 probe. It explained the 1940 collapse as **resonance** — the classic debunked textbook myth; the real cause is [aeroelastic flutter](https://en.wikipedia.org/wiki/Tacoma_Narrows_Bridge_(1940)), a self-exciting feedback loop, not an external force matching a natural frequency. What makes it decisive is *who accepted it*:

| Layer | Verdict |
|---|---|
| Planner | ✓ selected a real, on-topic subject |
| Writer | ✓ fluent, on-grammar telling |
| Gate | ✓ passed — *praised* the wrong explanation as "carryable" |
| Reader | "seems plausible" |
| **Reality** | **✗ — wrong** |

Every layer we have is blind to factual error, because none of them was ever given the *responsibility* for truth. This is a **missing architectural responsibility, not a prompt bug** — you cannot patch it in the planner or the gate without making one of them secretly own truth, which is the wrong home (see the boundary below). The same defect class appeared in the earlier "Costly Mistake" probe (a renderer inventing a quantitative fact: a map going "3 countries → dozens"). Two independent probes, one missing seam.

## The boundary it establishes: Narrative vs. Evidence

The first boundary this project found was **selection vs. telling** (→ [narrative-planning-grammar.md](hypotheses/narrative-planning-grammar.md)). Documentary exposed a second one:

> **Narrative vs. Evidence.** The Planner chooses *which* story to tell and *how* to shape it. It is never responsible for whether the facts are true. Truth is a separate responsibility with a separate owner: the Evidence Bible.

Keeping these in one object would recreate the failure — a planner that both invents stories *and* asserts facts has no seam at which truth can be enforced. Separated, the rule becomes simple and checkable: **the Planner and Writer may only assert facts that exist in the Evidence Bible.**

## Scope — not documentary-only

Documentary is merely the **first consumer**. The Evidence Bible exists **whenever factual correctness is part of the product promise**. Likely future consumers, all needing the identical contract:

history · biography · science · geography · finance · news · medical · true crime · product comparisons

Defining it around the *promise* rather than the genre is what keeps it reusable — the same reason Narrative Planning Grammar was defined by dimensions, not genres.

## The contract (narrow on purpose)

The Evidence Bible answers **only** these questions, and nothing else:

- **What facts are allowed** into this piece of content?
- **Where did each come from** (provenance / which chosen source)?
- **Which are essential** (must appear) vs. supporting?
- **Which are uncertain** (contested, approximate, disputed) — carried *with* their uncertainty?
- **Which names, dates, and numbers are frozen** (must appear verbatim, may never be paraphrased or "rounded")?
- **What may the Writer elaborate** (tone, framing, sensory texture around a fact)?
- **What may the Writer never invent** (any new name, date, number, causal claim, or quote not in the Bible)?

Deliberate wording, per review: facts are **sourced, frozen, and treated as authoritative for the duration of generation** — *not* "verified." The system cannot verify truth in the absolute; it can guarantee fidelity to the trusted sources chosen for this piece. Promising more than that would be an architecture writing a check it can't cash.

### Evidenced core vs. designed extensions (mark the seam)

Only part of this contract is backed by a probe; the rest is anticipatory design and must not wear the same "earned" language. Honestly:

- **Evidenced core (build this first — 3 items the Tacoma/probe failures actually demand):** (a) the dossier is the authority; (b) a **gate provenance check** — "every asserted fact traces to the dossier" — which alone would have caught Tacoma; (c) **frozen-verbatim protection** for scalars (names, dates, figures), mechanically identical to `canonicalNames`.
- **Designed, not yet evidenced (keep in the doc, but let a real failure demand each):** essential-vs-supporting, uncertainty-carrying, and the compiled prep-stage that builds a flagged fact table. No probe stands behind these.

### The sharpest open risk: paraphrase fidelity for causal claims

The motivating failure (Tacoma) was **not a wrong scalar — it was a wrong causal model** (resonance vs. aeroelastic flutter). Frozen-verbatim protection works for names/dates/figures; it *cannot* cover causal explanations, which must be paraphrased into prose — and checking that a paraphrase is *faithful* to a source is an **LLM judgment call, the same class the gate just failed**. So the evidenced core above catches wrong *scalars* cleanly but only partially addresses the wrong-*model* failure that motivated the whole spec. "Paraphrase fidelity for causal claims" is the open risk, and it is the specific thing the **first documentary probe must measure** (does a source-in-hand check actually catch a faithful-sounding but wrong causal paraphrase?).

### Open workflow question: fact-gaps discovered during writing

The Bible is built once, frozen, then consumed — but writing reveals gaps (the Writer reaches for a connective fact that isn't in the Bible). Omit? Fail the reel? Loop back to prep? **Undefined**, and it will happen on the first real documentary. Left open deliberately; the first build must decide it.

## The model: a compiler (mirrors the Story Bible)

Reuse the proven [Story Bible](specs/story-bible.md) shape exactly — an analyze/prepare stage builds a frozen table; downstream stages *reference*, never re-derive; a mechanical step protects the invariants.

```
Sourced facts (upstream — OUT OF SCOPE here: dossier supplied, or later, research)
  │
  ▼
Evidence Prep  (NEW — LLM+code)      build the frozen fact table, ONCE
  │
  ▼
Evidence Bible  (persisted on reel)  frozen fact records: value · provenance · essential? · uncertain? · frozen-verbatim?
  │
  ▼
Planner / Writer  (existing)         SELECT from and elaborate AROUND facts; never add or alter them
  │
  ▼
Gate + Naturalizer/Editor (existing) NEW responsibility: every factual claim must trace to the Bible;
                                     frozen values are protected verbatim (like canonicalNames today)
```

Two concrete anchors in the current code the implementation would extend, when it happens:
- Frozen values must survive the finishing stages the way canonical names already do — the Editor is told to keep `canonicalNames` verbatim ([story-editor.v1.ts](packages/core/src/prompts/story-editor.v1.ts)); frozen facts need the same protection in Editor **and** Naturalizer (which rewrites lines and must never touch a frozen number).
- The Gate gains a **factual-provenance** check distinct from craft ([story-critic.v2.ts](packages/core/src/prompts/story-critic.v2.ts)): "does every asserted fact trace to the Bible?" — the check that would have caught Tacoma.

## Relationship to the Story Bible — parallel, not a variant

They are two peers that own two different kinds of truth:

| | **Story Bible** | **Evidence Bible** |
|---|---|---|
| Owns | fictional truth | factual truth |
| Contents | characters, timeline, world rules, entity descriptions | dates, measurements, names, citations, known uncertainty, allowed claims |
| Source of truth | channel canon + the story itself | chosen external sources |
| Failure it prevents | visual/continuity drift across scenes | asserted falsehoods |
| Consistency guarantee | same entity looks/reads identical every mention | same fact stated identically, never invented |

Same *mechanism* (frozen table, reference-don't-re-derive, mechanical protection); different *domain*. A single reel could in principle use both (a dramatized-but-factual piece), which is exactly why they must not be merged.

## How the Planner consumes evidence (in scope) vs. how evidence is gathered (out of scope)

This spec covers only **consumption**:

- The Planner **selects the story from the evidence** — it may choose which facts to foreground, what angle to take, what to omit. It may **never** add, alter, or "improve" a fact.
- **Documentary planning grammar** (the consumption-relevant part): audience question = *how did this real thing come to be / fall apart?*; narrative role = **chronicler of real events**; engine = **causality over time**; payoff = the weight of the whole true story; resolution = resolved-with-aftermath. Its `selectionLens` selects *from* the Bible; it does not license invention.
- **Real-subject policy** (consumption-relevant): real *public* entities and events (companies, historical events, public disasters) may be named and treated factually; *private individuals* remain off-limits. Whether a given piece **names** real subjects or runs **anonymized** ("based on real cases", the [Story Modes](specs/story-modes.md) "Costly Mistake" posture) is a **mode/policy decision layered on top** — the Evidence Bible owns the facts either way; it does not own the naming decision.

Explicitly **out of scope**: *how facts are sourced* (a dossier is supplied for v1; automated research is deferred — see [story-modes.md](specs/story-modes.md) `knowledgeRequirement: none | dossier | research`). The Evidence Bible is the concrete form of the `dossier` knowledge requirement.

## Non-goals

To keep it orthogonal (the discipline that made Narrative Planning Grammar clean):

> The Evidence Bible determines **what is factually true and assertable** for a piece of content. It does **not** gather or research facts, judge story quality, decide pacing, narration, prose, or storytelling shape, choose whether identities are named or anonymized, or verify facts against reality in any absolute sense. Those belong to upstream sourcing, the planning grammar, the writing/craft systems, mode policy, and the world respectively.

## What would earn formalization

The same three-part bar as Narrative Planning Grammar, and documentary already meets the first:

1. **A product needs it** — ✓ documentary cannot keep its factual-correctness promise without it (the Tacoma failure is unfixable elsewhere).
2. A second consumer with a factual-correctness promise (history, science, finance…) needs the *same* contract — expected, not yet demonstrated.
3. Removing it demonstrably reintroduces gate-approved falsehoods — ✓ shown by the probe.

## The symmetry

Three responsibilities, none overlapping, each justified by an independent product need rather than architectural taste:

| Concept | Answers |
|---|---|
| **Narrative Planning Grammar** | How should this story be selected and shaped? |
| **Story Bible** | What is true within this *fictional* world? |
| **Evidence Bible** | What is true about the *real* world for this piece of content? |

## Strongest known objection

*(Required section — the doc states its own best counter-argument.)*

The **responsibility** survives every challenge (no existing layer can own truth without corrupting its boundary — demonstrated twice). The **object** is where it's vulnerable: five of the seven contract items are unevidenced design, and — sharper — the mechanism is weakest exactly where the motivating failure lives. Frozen-verbatim protection nails wrong *scalars*; Tacoma was a wrong *causal model*, which needs paraphrase-fidelity checking that is itself an LLM judgment call. And for the highest-stakes future consumers (**medical, news**), source *choice* is the entire risk — and sourcing is explicitly **out of scope**, so the out-of-scope part is the whole problem. That caps the promise: this architecture guarantees *fidelity to chosen sources*, never correctness, and for some products those are far apart. Build the evidenced core (a–c); let a real documentary demand the rest.

Related: [narrative-planning-grammar.md](hypotheses/narrative-planning-grammar.md), [story-modes.md](specs/story-modes.md), [story-bible.md](specs/story-bible.md), [Kendrix Constitution](ARCHITECTURE.md).
