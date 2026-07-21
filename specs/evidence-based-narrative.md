# Spec: Evidence-Based Narrative (EBN) — the evidence-constrained storytelling foundation

Status: **RFC — review round 1 incorporated; direction approved, not yet built.** No pipeline code until final review. · Owner: PM · Eng: senior

> This is the architecture artifact required by the evidence-first workflow (document → RFC → review → only then code). It is deliberately a foundation, not a "True Crime engine." Review round 1 (owner, 2026-07-21) is folded in: Evidence Acquisition rename, fact IDs, DIRECT/DERIVED facts, the Narrative Claims layer, split chronology permissions, citability, Bible versioning, specialization-as-config, the tightened visual principle, and a narrowed scope boundary.

## Why now

The true-crime probe (2026-07-21) exposed a real gap: the pipeline has **no factual mode**. "True crime" has no genre module, so `classifyGenre` routed it to `horror` — and the planner, wearing the horror identity, selected supernatural creepypasta (an impossible disappearance; a voice-loop trapping a driver). The gate caught the drift; generation produced the wrong thing entirely. The lesson isn't "add a True Crime genre" — it's that some stories are governed by **faithfulness to real evidence**, and the engine has no seam for that.

This RFC names that seam as a reusable foundation and makes True Crime its first application. It **graduates two existing designs** rather than inventing from scratch:

- **[Evidence Bible](hypotheses/evidence-bible.md)** (hypothesis) — the owner of factual truth. Its graduation bar was "a product actually needs it." True Crime is that product; the Evidence Bible graduates here.
- **[Story Modes](specs/story-modes.md)** — the mode-as-contract abstraction, including the `knowledgeRequirement: dossier` clause and the Evidence Bible seam. EBN is the realization of Story Modes' **Factual branch**.

## The foundation, not a genre

> **Evidence-Based Narrative** is a storytelling discipline whose objective is: *explain real events through a compelling narrative without distorting the evidence.* It is defined by that **promise**, never by subject matter.

```
Evidence-Based Narrative  (the shared, reusable pipeline)
├── True Crime               ← first + most demanding specialization
├── Historical Events
├── Biography
├── Documentary
├── Investigative Journalism
├── Disaster Reconstruction
├── Military History
└── Corporate Case Studies
```

A specialization is **not new machinery**. It is a named bundle of: a *narrative-permissions profile*, a *gate/fidelity rubric*, a *safety profile*, and a *rendering profile*. The engine stays generic; only that bundle swaps — the same shape the whole system already uses (writer identities, per-mode rubrics, scene-craft blocks). Building the engine for True Crime alone would waste it; building EBN gives every factual format one spine.

### Scope boundary — what EBN is deliberately NOT for

EBN is **not** the home for all factual content, and keeping it narrow is what keeps the abstraction sharp:

> **Evidence-Based Narrative is for narrative reconstructions of *specific real events* where preserving evidentiary fidelity is a *primary product requirement*** — i.e. getting a fact wrong is a product/legal failure, not just a quality ding.

Lightweight factual content — news beats, sports recaps, earnings summaries, general science/how-it-works explainers — stays in the **`informational` genre**: it is factual but needs no immutable Evidence Bible, no per-fact provenance, no fidelity checker. The two tests for EBN: (1) it reconstructs *specific, real, identifiable events*, and (2) fidelity to the evidence is load-bearing for the product's promise. If either is false, it's `informational`, not EBN.

## The invariant (constitutional)

```
Evidence Acquisition  (human-curated for v1; automated acquisition DEFERRED)
  │
  ▼
Evidence Bible  (immutable + versioned)
  │
  ▼
Planner → Narrative Claims → Writer → Editor → Fact-Fidelity Checker → Narrative-Quality Checker → Publisher
```

> **Nothing downstream of the Evidence Bible acquires evidence, and nothing "remembers" facts from the model. Every fact comes from the Bible. Downstream stages may only select, arrange, summarize, or reference evidence — never invent, alter, or extend it.**

The single most important idea in this RFC, stated as a contract every downstream component inherits: **you are not discovering facts; you are transforming evidence.** That is what turns this from "LLM prompting" into an architecture — deterministic inputs, reproducible outputs, auditable generation. It is the Story Bible's proven rule ("mechanical expansion, never regeneration") and the constitution's *extract-don't-predict* / *uncertainty-only-decreases* principles, pointed at real-world facts.

(Stage renamed from "Research" per review: the pipeline **consumes** evidence — uploaded PDFs, court documents, transcripts, police reports, archives — it does not *discover* truth. "Acquisition" scales to those without implying a web search.)

## The Evidence Bible — a table of *atomic facts*

The unit is an atomic fact carrying its own id, stance, attribution, weight, and kind, so no downstream stage can drop them and every later stage can *reference the fact by id*:

```yaml
fact:
  id: F031
  kind: DIRECT              # DIRECT | DERIVED
  value: "Jane Doe"
  stance: FACT              # FACT | LIKELY | CLAIM | DISPUTED | UNKNOWN
  source: [Court Record, Police Report]
  weight: Critical          # Critical | High | Medium | Background

fact:
  id: F044
  kind: DIRECT
  value: "Police believed the suspect entered through the back door."
  stance: CLAIM
  attributed_to: Police
  source: [Police Report]
  weight: High

fact:
  id: F052
  kind: DERIVED             # mechanically inferable from other facts; not from a source directly
  value: "He was inside for roughly 13 minutes."
  derived_from: [F048, F050]   # e.g. "entered 8:01" + "exited 8:14"
  stance: LIKELY
  weight: Medium
```

- **`id`** — every fact is addressable (Review 2). Claims and script sentences reference facts by id, so "which evidence supports this paragraph?" is a lookup, never fuzzy matching.
- **Truth `stance`** (five levels): `FACT` (evidenced), `LIKELY` (multiple sources), `CLAIM` (someone alleged it — carries `attributed_to`), `DISPUTED` (sources disagree), `UNKNOWN` (no verified answer). The writer must **preserve** it: never upgrade "police considered" → "police knew"; never render a `CLAIM` as a `FACT`. That one distinction is the line between journalism and fiction.
- **`kind: DIRECT | DERIVED`** (Review 3). Not every fact comes straight from a source. A `DERIVED` fact ("~13 minutes inside") is allowed **only** if it is mechanically inferable from other facts, and it must name them in `derived_from`. This keeps inference auditable and out of the writer's hands — derivation happens at Bible-construction time, under the same immutability rule, never improvised later.
- **`weight`** (Critical/High/Medium/Background) gives the planner an optimization target: `Critical` facts **must** appear; `Background` is optional colour. Arrangement changes, facts don't.

### The Bible is immutable *and versioned*

Immutable does not mean frozen forever — real cases evolve (Review 9). New evidence never mutates the Bible in place; it produces a new version, and regeneration runs against it:

```
Evidence Bible v1 → Script v1
      (new evidence arrives)
Evidence Bible v2 → regenerate → Script v2
```

Never mutate; always version. Each script records which Bible version produced it, so any output is reproducible from a pinned Bible.

## Narrative Claims — the planner's output (not prose)

The Planner does not emit prose, and it does not emit the fiction `StoryPlan` (premise/conflict/twist). In EBN it emits an ordered list of **Narrative Claims** — the arrangement decision, bound to evidence (Review 4):

```yaml
claim:
  id: C18
  order: 7
  purpose: "Explain why investigators focused on Suspect B."
  evidence: [F018, F022, F091]
```

The Writer then **expands claims into prose**, never facts directly. This separation is what makes hallucination detectable: a claim declares exactly which facts it may draw on, so a sentence that reaches beyond its claim's evidence is mechanically visible. The Planner's job in EBN is precisely "the most compelling *ordering* of verified evidence into claims" — structure is free, facts are not.

## Citability — every sentence traces to evidence

The Writer's output retains an internal provenance map the audience never sees but developers and the checker do (Review 8):

```
Sentence 12  ← C18  ← F031, F044
```

Each sentence carries the claim it expands and, transitively, the facts that claim cited. Payoffs: the **Fact-Fidelity Checker becomes a lookup, not a fuzzy comparison**; debugging is "click any sentence, see its evidence"; and an *uncited* sentence is, by definition, unsupported — the cleanest possible signal that the writer added something.

## Narrative Permissions — the explicit per-mode contract

The writer never guesses what it may do. Each specialization declares booleans:

```yaml
may_invent_dialogue:              false
may_infer_emotions:               false
may_present_out_of_order:         true    # presentation order (flashback, cold open) — free
may_change_actual_chronology:     false   # the real sequence of events — never (Review 5)
may_summarize:                    true
may_merge_sources:                true
may_create_visual_reconstruction: false
may_describe_unknowns:            true    # describe the silence/uncertainty, not fabricate an answer
```

The chronology split (Review 5) matters: documentaries constantly open with "it all began…" or "twenty years earlier…" — **presentation** order changes freely; **actual** chronology never does. **Emotion is still allowed** — it comes from *reality*, not invention: describe the waiting, the silence, the moment investigators found the evidence, the family's reaction (as attributed). What's banned is inventing interiority the evidence doesn't support.

## Narrative Freedom by specialization

Freedom = the default permissions profile. A specialization is just a named point on this axis (plus its rubric + safety + rendering):

| Specialization | Reconstruction allowed |
|---|---|
| Documentary | Almost none |
| **True Crime** | **Very limited** |
| Investigative Journalism | Very limited |
| Biography | Some scene reconstruction, **with attribution** |
| History / Military History | Moderate |
| Disaster Reconstruction | Moderate (mechanism, not motive) |
| Corporate Case Studies | Moderate |
| Educational | High |

## Specialization as configuration, not architecture

A specialization is declared as data, so adding "Historical Documentary" is config, not a code branch (Review 7):

```yaml
specialization: TrueCrime
inherits: EvidenceBasedNarrative
permissions: { may_invent_dialogue: false, may_infer_emotions: false, may_create_visual_reconstruction: false,
               may_present_out_of_order: true, may_change_actual_chronology: false,
               may_summarize: true, may_merge_sources: true, may_describe_unknowns: true }
renderer: documentary
gate: [FactFidelityChecker, NarrativeQualityChecker]
safety: trueCrimeSafety
```

## True Crime — the first specialization (v1 scope)

- **Real, named, PUBLIC + ADJUDICATED cases only.** Convictions / matters of public record. **Not** private individuals; **not** un-convicted named people described as guilty; allegation is never rendered as fact.
- **Human-curated, sourced dossier** per case (a person acquires reliable sources → the extractor freezes them into the Evidence Bible). Automated acquisition is deferred.
- **Permissions** (as above): dialogue ✗, inferred emotion ✗, visual reconstruction ✗, present-out-of-order ✓, change-chronology ✗, summarize ✓, merge ✓, describe unknowns ✓.
- **Safety profile:** never glorify perpetrators; never sensationalize violence; no gratuitous description of injury/death; respect victims and survivors; distinguish allegation from conviction; preserve uncertainty; label any dramatized reconstruction.
- **Disclosure:** every output carries a synthetic-media disclosure (platform requirement + ethics).

## The Visual Guardrail

> **Never generate imagery that could reasonably be mistaken for authentic historical documentation. Synthetic visuals must never imply evidentiary authenticity.**

The second sentence (Review 6) is the durable principle — it covers future capabilities not yet listed. The concern is broader than likeness: it is synthetic imagery *appearing to be genuine evidence*. Banned: fake crime-scene photos, fake CCTV/surveillance stills, fake newspaper photos, fake evidence photos, fake bodycam. Preferred: maps, diagrams, timelines, location exteriors, symbolic reconstructions, court-style illustration, and clearly **labeled** reenactments where appropriate. This is a `renderingProfile` + `constraints` clause, enforced at scene-qa.

**Probe-validated (2026-07-21, `apps/worker/scripts/probe-ebn-visuals.ts`).** Confirmed both halves: the existing photoreal `documentary` style preset on crime content **violates** the guardrail (it produced a photoreal "suspect" face and fake-evidence documents); the **illustrative modes comply and render well** (money-flow infographic, timeline, court-style sketch, editorial-symbolic, architectural illustration). The court-sketch mode is the key result — it shows a courtroom with people *without* a photoreal deepfake. So EBN needs its **own rendering profile** — that small set of illustrative modes — plus a hard ban on the photoreal preset for reconstructions. The *technical* guardrail is thus achievable; the remaining question is the product one below.

## Two checkers, cleanly separated

The existing gate conflates craft and correctness. EBN splits them:

- **Fact-Fidelity Checker (NEW — factual only).** Runs against the citation map + Evidence Bible, and asks *only*: Was anything **added** (a sentence with no citation, or reaching beyond its claim's evidence)? Anything **removed** (a `Critical` fact absent)? Was **attribution preserved**? Was **certainty changed** (a stance upgraded)? Was **actual chronology distorted**? Did **dialogue** appear? Were **motives invented**? It ignores prose quality entirely, and citability makes most of these a lookup rather than a judgment call.
- **Narrative-Quality Checker (existing).** The story gate + finishing-QA judge already built — prose, turn-landing, naturalness, rhythm.

Then **Publisher** (with disclosure). Clean responsibilities: one stage owns *is it true to the evidence*, the other owns *is it good*.

## What EBN guarantees — and what it does not

> The Fact-Fidelity Checker verifies that the generated narrative **faithfully reflects the curated evidence package.** It cannot independently determine whether the underlying sources are **accurate or complete.**

Source accuracy and completeness are the **human curator's** responsibility — which is exactly why automated acquisition is deferred and a person sits in the sourcing seat for v1. The engine makes generation faithful and auditable; it does not adjudicate reality.

## What only the owner can own (not code)

- **Legal go/no-go** per case (are we comfortable publishing about it).
- **Sourcing & curation discipline** (who acquires and vets each dossier).
- **Disclosure & rights policy.**

These gate whether we *publish*, regardless of what the engine can produce. Naming them here so they're never silently assumed.

## Deferred — explicitly out of scope

- **Automated evidence acquisition** — the weakest thing to automate here (scraping/reconciling/adjudicating real cases = endless edge cases + legal risk). A curated Evidence Bible is the deterministic, auditable input we build on instead.
- **Real / archival footage** and any **rights-cleared asset path.**
- **Private-individual or live-allegation subjects** — beyond the public/adjudicated scope; would require a heavier legal layer.
- **Genre × specialization matrix** — vocabulary now, code later; migrate lazily.

## The minimal buildable slice (what earns the next step)

Prove the fidelity chain before touching visuals or publishing:

1. **Evidence Bible extractor**: one hand-curated dossier (a public, adjudicated case) → a frozen, versioned table of atomic facts with `id` + `kind` + `stance` + `source`/`attributed_to` + `weight`.
2. **Planner → Narrative Claims**: an ordered claim list, each citing fact ids (honoring weight), inventing nothing.
3. **Writer**: expands claims into prose, emitting the sentence→claim→fact citation map.
4. **Fact-Fidelity Checker**: lookup + the seven questions against the citation map.

Success test: does the FFC catch *injected* fiction — an uncited sentence, an upgraded certainty, invented dialogue/motive, a distorted actual chronology, a dropped `Critical` fact? If it reliably does (and the writer, given a well-formed Bible + claims, stays faithful), the chain is proven and visuals + disclosure + the specialization-config layer are the next slice. No imagery, no publishing in slice 1.

## Strongest known objection

*(Required — the doc's own best counter-argument.)*

The mechanism is airtight about **fidelity** and therefore migrates the entire risk to **curation**, which is human, unautomated, and error-prone — and for real, named people a curation mistake is published as a confident, sourced-looking claim about a real person. The architecture cannot detect a wrong dossier; it will faithfully amplify it. That caps the promise to "faithful to the chosen sources," and for the highest-stakes specializations (True Crime, Investigative Journalism) source *choice* is the whole game. Second, the visual guardrail constrains EBN to illustrative imagery (infographics/diagrams/court-sketch), which the 2026-07-21 probe confirmed is *technically achievable and renders well* — but the open question narrows to a purely product one: does an all-illustrative aesthetic hold watch-time and travel as well as genres that show photoreal scenes? Held answer: the guardrail is the *correct* cost of the promise. If the illustrative aesthetic proves non-viable for retention, that's a finding that reshapes the product (or its channel fit); it is never a license to fabricate evidence.

## Reconciliation with existing docs

- **Realizes the Factual branch of [story-modes.md](specs/story-modes.md).** The seven mode clauses still hold; EBN is `knowledgeRequirement: dossier` made concrete, with the atomic-fact schema, Narrative Claims layer, citability, and two-checker split added.
- **Graduates [evidence-bible.md](hypotheses/evidence-bible.md)** from hypothesis to committed (True Crime is the consumer). The atomic-fact schema (`id`/`kind`/`value`/`stance`/`source`/`weight`), Narrative Permissions, and versioning extend the Evidence Bible's original contract.
- Note the **fictionalized-identity** posture in story-modes.md was the *documentary* framing; True Crime here deliberately takes the harder **real-named/public-adjudicated** path, with the visual guardrail + disclosure + FFC as the compensating controls.

Related: [evidence-bible.md](hypotheses/evidence-bible.md) · [story-modes.md](specs/story-modes.md) · [narrative-planning-grammar.md](hypotheses/narrative-planning-grammar.md) · [Kendrix Constitution](ARCHITECTURE.md).
