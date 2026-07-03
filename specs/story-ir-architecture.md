# Spec: Story IR Architecture — the three-system north star

Status: proposed · Owner: PM · Eng: senior · Scope: architecture (no code in this pass)

## Why

Today's pipeline is a linear chain that generates prose first and recovers structure from it afterward: `generate_story` writes the finished script, then `analyze_story` extracts a symbol table from it and `breakdown_scenes` re-derives scene structure from it ([dispatcher chain](packages/queue/src/index.ts)). Every downstream stage reinterprets upstream text, so intent decays hop by hop, and the only levers on *story quality* are prompt wording and human spot-check.

The bottleneck is not asset generation — image/video/voice models keep improving on their own. The bottleneck is **story quality**, and nothing in the current system measures it: `stories.performanceScore` is weighted 0.5 in few-shot selection ([fewshot.ts:27](packages/core/src/assembly/fewshot.ts#L27)) but never written; the `metrics` table has never had an insert. The one live quality signal is human approval → `isReference` ([auto-gate.ts:46](apps/worker/src/pipeline/auto-gate.ts#L46)).

This spec defines the north-star architecture: treat content creation as **compilation of intent over a single intermediate representation**, wrapped in a learning loop that measures what audiences actually watched and compiles that knowledge into future content. The product identity this implies:

> An autonomous storytelling system that continuously learns what audiences watch and compiles that knowledge into future content.

Foundation models are interchangeable executors. The durable assets — the moat — are the **Story IR, the attribution loop, the knowledge store, and the eval corpus**. None of those can be bought with an API key.

## The model: three systems, one IR

```
┌─ DISCOVERY ENGINE ─────────────────────────────────────┐
│  trends · audience research · search demand            │
│  → N candidate briefs, critic-pruned                   │
│  → each brief carries an OBJECTIVE                     │
└───────────────┬────────────────────────────────────────┘
                │  briefs + objectives (thin interface)
┌─ STORY COMPILER ───────────────────────────────────────┐
│  lowering / critic / validation passes over one        │
│  Story IR: intent → structure → entities → beats       │
│  → realization → production plan → assets              │
└───────────────┬────────────────────────────────────────┘
                │  publish
┌─ LEARNING SYSTEM ──────────────────────────────────────┐
│  telemetry → attribution → optimization → knowledge    │
│  writes scoped facts; feeds Discovery briefs and       │
│  Compiler critics — the only coupling back upstream    │
└────────────────────────────────────────────────────────┘
```

**Interfaces stay narrow and typed.** Discovery→Compiler couples only through briefs+objectives. Learning→everything else couples only through facts and objective definitions. That is what lets each system — and every foundation model inside them — be replaced independently over years.

Two names, both load-bearing:

- **Story Compiler** — the *process*: lowering, critic, and validation passes.
- **Story IR** — the *artifact*: one persisted, versioned, content-addressed graph. It needs identity independent of the passes because it is what gets diffed, partially regenerated, and joined to telemetry.

## Core rules (these are the design; everything else is mechanism)

1. **One IR, many views.** Intent, structure, entities, and beats are *layers of one graph*, not sequential documents. Prose and production plan are derived projections — regenerable, never authoritative. Four separate documents would create an authority problem (when the beat graph reveals the arc fails, which doc do you edit?); one graph with lowering levels does not.
2. **Deterministic semantics, probabilistic rendering.** The semantic contract per beat (entities, emotion, purpose, location, camera, composition) is fixed by the IR. Rendering samples from it. Acceptance tests verify *semantic conformance*, never pixel identity.
3. **Critics interleave; search lives at the top.** Critic/validation passes run after every lowering, and a failed critic triggers backtracking. Search breadth decreases monotonically down-stack (~10 theses, ~3 beat sheets, 1 realization) because exploring alternatives gets ~an order of magnitude more expensive per layer.
4. **Every pass is idempotent; every artifact is immutable.** Artifacts are content-addressed and append-only; passes are re-runnable. Stages are not "immutable" — their outputs are.
5. **LLM passes are not trusted.** Unlike compiler passes, LLM passes are neither verifiable nor semantics-preserving by default. Every pass boundary gets schema validation + cross-layer invariant checks + one bounded repair round (the [`reviewSceneBreakdown`](packages/core/src/assembly/scene-qa.ts) pattern, generalized).
6. **Nothing improves without measurement.** Every production compiles toward an explicit objective; every critic predicts against it; telemetry records actuals against the same schema. A belief enters the knowledge store only after surviving its experiment.

## Objectives — the target triple

A compiler compiles toward a target and flags (`arm64`, `-O2`). Kendrix compiles toward:

```yaml
objective:
  platform: youtube_shorts
  primary_metric: avg_view_duration
  guardrails: [shares >= baseline, follows_delta >= 0]   # anti-Goodhart
  audience: gen_z_ph
  emotion: dread
  length_s: 45
  novelty: high
```

- **Same schema at compile time and measurement time.** Critics emit *predicted* metric values against the objective; telemetry records *actuals*. The prediction error is how critics themselves get calibrated over time. Without this shared unit of account, "the hook is good" and "43% watched" never meet.
- **Vector with guardrails, never a scalar.** Pure primary-metric maximization Goodharts — AVD-maxing converges on dread-loop clickbait that bleeds shares and follows.
- Objectives live on the brief and are versioned with the IR. They are the cheapest piece to build and everything downstream needs them.

## Story Compiler

### The IR's layers (populated by lowering passes)

| Layer | Contents | Exists today as |
|---|---|---|
| **Intent** | thesis, curiosity gap, promise/payoff ledger, emotional trajectory, retention strategy — the checkable "story contract" | — (the gap) |
| **Structure** | acts → beats: escalation, reveal timing, callbacks; each beat references the intent nodes it serves and carries an **audience knowledge delta** | — (the gap) |
| **Entities** | the symbol table: characters, locations, objects, motifs, visual/style rules; referenced by id, never restated | `storyBible` (`story-analyzer.v1.6`), per [specs/story-bible.md](specs/story-bible.md) |
| **Realization** | semantic units: purpose, emotional target, entity refs, timing budget, retention role | `scenes.v1.22` rows |

The **audience knowledge delta** — what the viewer learns or falsely believes at each beat — is the field most systems miss. Tracking audience knowledge state over time is how curiosity gaps and dramatic irony get *engineered* rather than hoped for from the prose.

Cross-layer invariants checked by validation passes: every promise has a payoff, every entity ref resolves (dangling ref = compile error), every beat serves an intent node, knowledge deltas are consistent, timing budgets sum to the objective's target duration.

### Deterministic semantics, probabilistic rendering — consequences

1. **Acceptance tests are projections of beat fields.** "Is the figure terrified, is it a hallway, is it a medium shot." The vision QA in [generate-images.ts](apps/worker/src/pipeline/steps/generate-images.ts) (`image-qa.v1`) is the crude existing version; formalize its checklist from the beat's semantic fields.
2. **Repair ladders declare which semantic fields they may sacrifice, in priority order — and record the delta.** Known flaw today: the mood-only fallback plate in `generate-images.ts` silently drops subject + entity refs. The render survives but nothing records that the beat no longer means what the IR says. Every fallback rung must write its semantic delta onto the artifact.
3. **Determinism lives in the provider projection layer.** Providers consume prompts, not IR; semantics→prompt assembly per provider (`assembleImagePrompt` and kin) is itself a lossy projection. Golden-test it: same IR node → byte-identical assembled prompt per provider version.

### Orchestration

- **Build graph, not events, not a hardcoded chain.** Evolve `PIPELINE_CHAIN`/`resolveNextStep` ([packages/queue/src/index.ts](packages/queue/src/index.ts)) from a linear chain to a declared dependency DAG over content-addressed artifacts. Event-driven microservices buy worse debuggability and nothing else at this scale.
- **Memoization** extends the existing `input_hash` short-circuit ([harness.ts](apps/worker/src/pipeline/harness.ts)): hash(inputs + template version + model id) → artifact.
- **Interface-stability invalidation.** A regenerated node whose *interface* (entity refs, knowledge delta, duration budget) is unchanged does not dirty downstream — ABI compatibility for stories. Regenerating beat 5's narration with the same refs and duration must not touch beat 6's video. The single-scene reshoot flow (`regen-image` with frozen `visualPromptBase`) already embodies this instinct for one asset type.
- **Human gates** (`story_review`, `storyboard`, `spot_check`) remain barrier nodes in the graph, auto-crossable per channel exactly as [auto-gate.ts](apps/worker/src/pipeline/auto-gate.ts) does today.

## Learning System

```
telemetry → attribution → optimization → knowledge store
```

- **Telemetry.** Platform metrics ingested per publication; retention curves per video. (The `metrics` table schema already anticipates this — it has just never been written.)
- **Attribution** (credit assignment). Retention curves joined to IR beats via `timings` timecodes — drop-off at 0:23 means beat 4 failed. This per-beat attribution is only possible *because* of the IR, and the entire Learning System depends on it existing first.
- **Optimization** (policy improvement). Consumes attributed outcomes and emits **candidate beliefs with test plans**, not conclusions: "hypothesis: reveals <2s lift AVD; assign to the next 5 off-policy productions." The **explore budget** is spent here — exploration is optimization-directed hypothesis testing, not random variation. Without a declared off-policy fraction, a channel optimizing on its own history converges to sameness: the learning loop becomes a stagnation loop. **Offline replay** is the cheap validation gate: before a belief changes live behavior, replay it against historical IR + telemetry — would it have predicted the outcomes already observed? Only survivors enter the store.
- **Knowledge store.** ONE typed-fact store — not separate "knowledge" and "memory" objects. Each fact carries:
  - `type`: audience | trend | story-pattern | production-heuristic
  - `scope`: `global | domain | channel | project`
  - `provenance`: which reels + metrics support it
  - `confidence`, and `decay` (TTL for trend facts, recency weighting for audience facts — taste drifts)

  **Shadowing:** narrower scope overrides wider, exactly lexical scoping — global "false endings lift horror retention" shadowed by channel-level "this audience dislikes them past 8 seconds." This gives conflict resolution for free, which two separate objects would not.

  **Promotion:** a channel fact replicated across enough channels widens scope and becomes domain knowledge. Promotion is the cold-start answer (a new channel inherits everything at domain/global scope) and, later, the SaaS moat — new customers benefit from accumulated cross-channel knowledge.

  Existing proto-memory gets subsumed as fact types rather than rebuilt: channel `worldBible`, voice DNA, the `isReference` few-shot corpus, rejection avoidance. What they all share today is *artifact-level* imitation/avoidance; the store upgrades this to *feature-level* beliefs — which is only sound once attribution exists. **Memory without attribution is superstition**: you will confidently credit the wrong features.
- **Consumers.** Discovery (briefs conditioned on beliefs) and Compiler critics (scoped facts make critics channel-specific rubrics) — not just idea selection.

## Migration path (grounded in current code)

The one true inversion vs. today: prose comes first and structure is recovered from it; the target derives prose from structure. Everything else is incremental. Order, cheapest-and-most-provable first:

0. **Objectives schema.** Brief-level objective object; critics scored against it. Cheap (a schema + critic-prompt changes); everything downstream needs it as the unit of account.
1. **Attribution loop.** Metrics ingestion job → `metrics` table → per-beat attribution via `timings` timecodes → populate `stories.performanceScore`. This activates the dormant 0.5 few-shot weight in [fewshot.ts](packages/core/src/assembly/fewshot.ts) with zero further code. Highest value-per-effort step in this spec; no dependencies.
2. **Explicit IR.** Merge `storyBible` + new beat/intent layers into a versioned `story_ir` artifact; `scenes` become its realization layer; `analyze_story` becomes a lowering pass instead of a recovery pass.
3. **Invert prose.** Split `generate_story` into thesis/beat generation (N candidates, critic-pruned — cheap and searchable) and narration realization *after* structure.
4. **Critics before spend.** Rubric judges on thesis and beat-sheet candidates (reuse the Claude-for-QA provider split); predictions recorded against objectives for later calibration.
5. **Knowledge store + optimization.** Scoped typed-fact store (shadowing, promotion, decay, provenance) aggregating step 1's attributions; optimization emits experiment-backed beliefs; explore budget on productions; offline replay gate.
6. **Artifact store.** Move `reels.storyBible/audioScript/timings` from overwrite-in-place jsonb to append-only versioned rows; add interface-stability invalidation to the memoization layer.

Steps 0–1 are the recommended first build: they are the only steps whose value is provable with real audience data *before* the larger compiler inversion is attempted.

## Honest ceiling

- **Attribution is noisy at small n.** Per-beat retention attribution needs enough published videos per channel for drop-off patterns to separate from noise. Early on, beliefs will be low-confidence; the store's confidence field and the offline-replay gate exist precisely so early noise doesn't calcify into "knowledge."
- **Platform telemetry granularity is not guaranteed.** YouTube gives retention curves; other platforms give less. Attribution quality degrades to whatever the platform exposes — design fact provenance to record *which* metrics supported a belief.
- **Rendering stays stochastic.** No amount of upstream explicitness makes image/video generation deterministic; the achievable contract is "every asset passes its semantic acceptance test or degrades along a declared ladder." (Same lesson as the [story-bible spec's](specs/story-bible.md) face-continuity ceiling.)
- **This spec is a north star, not a mandate to build all of it.** Do not build all layers before the evaluator exists — that was the flaw in the original 9-stage proposal. Each migration step gets its own implementation spec when scheduled.
