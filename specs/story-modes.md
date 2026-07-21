# Spec: Story Modes — the contract between planning and everything downstream

Status: draft — pending probe · Owner: PM · Eng: senior

> The **Factual branch** of this contract (`knowledgeRequirement: dossier`) is now realized by the [Evidence-Based Narrative RFC](specs/evidence-based-narrative.md) — the evidence-constrained pipeline whose first specialization is True Crime. The seven mode clauses here still hold; EBN makes the Evidence Bible seam concrete and adds per-fact truth-stance/weight + a Fact-Fidelity Checker.

## Why

Kendrix has been quietly converging on an abstraction it never named. The horror work didn't build "a horror genre" — it encoded *how horror works* (tension, concealment, reveal timing) and fed that knowledge into genre-agnostic machinery. The same shape repeated everywhere: writer identities per genre ([writer-identities.v1.ts](packages/core/src/prompts/writer-identities.v1.ts)), per-genre taste rubrics at the Gate ([story-critic.v2.ts:157](packages/core/src/prompts/story-critic.v2.ts#L157)), per-genre scene-craft blocks ([scenes.v1.ts:97](packages/core/src/prompts/scenes.v1.ts#L97)). The machinery stays generic; the *expertise that prepares and judges the work* is what swaps.

This spec names that abstraction — the **Story Mode** — and formalizes it as a contract, for two reasons:

1. **The clauses exist but are scattered.** A mode's craft lives in `WriterIdentity`, its bar lives in `DEFAULT_TASTE_RUBRICS`, its visual language lives in `GENRE_MODULES`, and nothing ties them together or says which stage consumes what. That's fine at one genre; it decays at five.
2. **The next mode breaks an unstated assumption.** Every current mode lets the Planner *invent* everything from channel canon. A documentary mode ("The Costly Mistake" — scam/financial-disaster stories) needs facts *supplied and frozen*, which today has no seam at all. Naming the contract makes "what information may the Planner use?" a first-class clause instead of an accident.

This is **formalization, not re-architecture**. Nothing in the studio pipeline (Planner → Genre Writer → Editor → Naturalizer → Gate, [generate-story.ts](apps/worker/src/pipeline/steps/generate-story.ts)) changes shape. The one genuinely new interface is the Evidence Bible (below), and it deliberately copies the proven Story Bible pattern ([story-bible.md](specs/story-bible.md)).

**Evidence status.** The contract below is validated by exactly one mode (horror, in production). Each clause is marked **[validated]** (horror built it and it works) or **[hypothesized]** (reasoned, not yet earned). A zero-code probe — one hand-written documentary script through the existing BYO path ([provide-story](apps/web/src/app/api/pipeline/provide-story/route.ts)) — runs before this spec graduates from *draft* to *proposed*; its findings edit this document.

## The contract

> A Story Mode is a contract between the Story Planner and the rest of the pipeline. It specifies why the story exists, what information the Planner may use, how that information is arranged, how success is defined and measured, what no stage may violate, and what downstream renderers optimize for.

A mode declares seven clauses. Genres do not own clauses; modes share them freely.

### 1. `objective` — [validated]

Why the story exists: the effect on the viewer. Fear (horror), understanding (documentary), emotional investment (romance/kilig), laughter (comedy). Today this lives implicitly in `WriterIdentity.purpose` ("why this writer exists — the effect on the viewer"). The contract lifts it out because *every* stage ultimately serves it, not just the Writer.

### 2. `knowledgeRequirement` — [hypothesized; the new clause]

What information the Planner may use:

| Value | Meaning |
|---|---|
| `none` | Planner invents from channel canon (worldBible, niche, few-shot, angle rotation). **All current modes.** |
| `dossier` | Operator supplies source material; an extraction stage builds a frozen **Evidence Bible** (below). The Planner arranges those facts and may not invent or mutate them. |
| `research` | Automated multi-source research + verification. **Deferred — placeholder only.** Not designed here, per the evidence rule (≥20 same-failure stories before any new stage). |

**Multiple modes share a knowledge requirement.** Documentary, historical, and biography would all use `dossier`; documentary does not "own" dossiers, and the Planner never knows or cares whether facts came from a scam case or WWII.

### 3. `planningCraft` — [validated]

How the information is arranged: the mode's storytelling expertise. **This is the existing mechanism, unchanged** — `WriterIdentity` (core belief, questions asked, habits, taboos, telling craft) + `STORY_STYLES` (narrative traditions within a mode) + `narrativeVoice` (cross-mode voice layer), consumed by Planner/Writer/Editor exactly as today. No new machinery; the contract just gives the mechanism its seat at the table.

### 4. `successDefinition` — [hypothesized]

What the finished reel must do to the viewer, as an experience arc:

- Horror: dread builds → the peak scare lands → fear lingers after the ending.
- Documentary: viewer understands → believes → remembers → applies the lesson.

**Distinct from gate criteria**: the Gate *measures* success at production time; the definition is the ground truth that future analytics/attribution ([story-ir-architecture.md](specs/story-ir-architecture.md)) will validate against. Honest status: **this clause is aspirational until the attribution loop exists** — the `metrics` table has never had an insert (performance learning is deferred). Today its only job is to be the source the gate rubric is derived from. The seed already exists as `WriterIdentity.successMetric` ("how this writer knows a story worked").

### 5. `gateCriteria` — [validated]

How success is measured at the Gate: a mode-specific Critic rubric derived from the success definition. **Already built**: `defaultTasteRubric(genreCategory, niche)` selects a per-mode rubric ([story-critic.v2.ts:157](packages/core/src/prompts/story-critic.v2.ts#L157)), overridable per channel via `channel.tasteRubric`. The Gate machinery (binary, one blunt reason, credibility test first) stays mode-agnostic; only the rubric swaps. Documentary adds clarity + credibility-of-facts to the bar; kilig adds emotional investment.

### 6. `constraints` — [hypothesized as a named clause; enforcement pattern validated]

Invariants no downstream stage may violate. Distinct from planning craft: **craft says how to build the experience; constraints say what must never break.**

- Horror: preserve uncertainty; don't explain early; delay the reveal.
- Documentary: don't invent facts; maintain chronology unless explicitly rearranged; uncertainty only decreases.

Constraints are only real if enforced. The checkpoints are the **Gate** (prose-level) and **scene-qa** (scene-level) — the same pattern storyboard grounding already uses to enforce journey/cast/location invariants against the frozen `continuity.journey`. A constraint without a checkpoint is a comment, not a clause. Seeds exist today as `WriterIdentity.taboos` (Writer-only) and `StoryBible.constraints.directorNotes` (per-story); the contract makes them pipeline-wide.

### 7. `renderingProfile` — [validated in shards; unification hypothesized]

What downstream renderers optimize for: visual language, soundtrack character, narration register, pacing. Shards already exist — `GENRE_MODULES` scene-craft blocks ([scenes.v1.ts:97](packages/core/src/prompts/scenes.v1.ts#L97)), scare/payoff framing (extreme close-up, scenes.v1.16), the audio-immersion direction (horror-tuned). What's missing is the *naming*: these are all fragments of one profile that music, SFX, narration, and editing should also receive.

Per [.claude/skills/unbiased-design](.claude/skills/unbiased-design/SKILL.md): a rendering profile is **craft knowledge handed to each renderer's judgment** ("documentary sound is diegetic and informative; suspense is earned, not ambient"), never hardcoded per-mode quotas or single-texture defaults. The renderer's model decides what fits each moment; the profile tells it what this mode is *for*.

The contract framing is deliberately open: future clauses (pacing profile, caption style, thumbnail language) slot in without redefining the concept.

## Modes are orthogonal to genres

Record permanently:

> **Genre answers "what kind of story?" Story Mode answers "how should it be told?"**

| Genre (subject) | Mode (discipline) |
|---|---|
| Business | Documentary |
| Ghost | Horror |
| Romance | Romantic drama |
| Cybersecurity | Documentary |

Honest note: today's `genreCategory` ([schema.ts](packages/db/src/schema.ts): `horror, informational, lifestyle, drama, commentary, reddit_story, comedy, general`) conflates both axes — "horror" is simultaneously a subject and a discipline. That's fine. The split is **vocabulary now, code later**: no genre×mode matrix gets built (it explodes combinatorially and nothing needs it), no renames happen until code is touched for other reasons. Migration is lazy.

## The Evidence Bible seam — the one new interface

Deliberately parallel to the Story Bible, which already proved the pattern: an LLM stage authors a frozen structure exactly once; code splices it byte-identically; nothing regenerates, so nothing drifts.

```
Source material (operator-supplied dossier)
  │
  ▼
Evidence Extractor  (NEW — LLM)          extract + anonymize, ONCE
  │
  ▼
Evidence Bible  (persisted on reel)      frozen facts: actors, timeline,
  │                                      mechanics, amounts, outcome, lesson
  ▼
Planner  (existing)                      ARRANGES facts; invents nothing
  │
  ▼
Writer → … → renderers                   dramatize the presentation, never the facts
```

The invariant, stated constitutionally:

> **Evidence is immutable after extraction. Every downstream stage may only select, arrange, summarize, or reference evidence. No stage may invent, alter, or extend extracted facts.**

This is the Story Bible's core rule ("mechanical expansion, never regeneration") and the constitution's *uncertainty-only-decreases* / *extract-don't-predict* principles, pointed at real-world facts instead of visual ones.

**Fictionalized identity is a property of extraction, not of writing.** The extractor anonymizes at extraction time — composite names, changed places, "based on real cases" framing — so **no real name ever enters the pipeline**. This is the owner's framing decision for documentary-mode channels (2026-07-16): true-pattern, fictionalized-identity. It dissolves the two hardest problems at once — libel exposure (real people in scam stories) and the visual pipeline's inability to depict real people (all imagery is AI-generated; prompts already actively fictionalize, [channel.v1.ts](packages/core/src/prompts/channel.v1.ts)).

Deliberately *not* designed here: the Evidence Bible schema, the extractor prompt, dossier input UX. Those wait for the probe's findings (especially whether the Story Bible can represent abstract entities — apps, chat threads, bank balances — which shapes what the Evidence Bible must carry).

## Mode Propagation

The most important section. **Writing isn't what makes horror horror** — images, sound, pacing, and reveal timing carry as much of the experience as prose. A documentary script rendered with spooky music and creepy lighting fails as a whole reel, regardless of how good the script was.

Propagation is a data model, not a slogan: **each stage consumes specific clauses of the contract.** Nobody guesses, and nobody receives an undifferentiated "mode" blob.

```
StoryMode contract
  │
  ├─ Planner        ← objective + planningCraft + knowledge (Evidence Bible, if any) + constraints
  ├─ Writer         ← objective + planningCraft + constraints
  ├─ Editor         ← planningCraft (genre-aware pass, as today)
  ├─ Scene planner  ← renderingProfile + constraints
  ├─ Images         ← renderingProfile
  ├─ Music / SFX    ← renderingProfile
  ├─ Narration      ← renderingProfile
  ├─ Editing        ← renderingProfile
  └─ Gate, scene-qa ← gateCriteria + constraints
```

Precedents already in production prove the pattern stage-by-stage: the scene planner consumes `GENRE_MODULES` craft; scare/payoff scenes get close-up framing (scenes.v1.16); scene-qa validates the frozen journey (storyboard grounding); the Gate consumes the per-mode rubric. Layer ownership (the constitution) is the mechanism — each layer owns its decisions and receives the knowledge it needs as input.

**Propagation reaches the UI, not just renderers.** The operator-facing loader copy ([pipeline-phases.ts:72-101](apps/web/src/lib/pipeline-phases.ts#L72-L101)) is a live example of leakage caught in probe 1: it keys off `channelMood`, which is derived *only* from tone intensity (`intensity >= 6 → 'dark'`, [pipeline-phases.ts:60](apps/web/src/lib/pipeline-phases.ts#L60)), and the `dark` set is hard horror ("Timing the scare…", "One last look over your shoulder…", "Scoring the dread…"). A documentary with intensity 6 gets horror microcopy. The lesson generalizes: **intensity is not mode.** A mode can be intense without being spooky. Mode-derived surfaces (loader copy, the `GenreLoader` glyph — already mode-aware, [GenreLoader.tsx](apps/web/src/components/GenreLoader.tsx)) should key off the Story Mode / `renderingProfile`, not off a tone proxy that silently equates "intense" with "horror."

## Deferred — explicitly out of scope

- **Automated research module** (`knowledgeRequirement: research`) — multi-source research, fact verification. Waits for the evidence rule.
- **Source attribution / citations** — irrelevant under fictionalized-identity framing; becomes real only with named-true-story support.
- **Named-true-story support** — requires a legal layer (defamation review, synthetic-media disclosure, rights) and a real-footage strategy. Out of scope until a channel needs it and the owner accepts the cost.
- **Real / archival footage** — the visual pipeline is fully generative today; a rights-cleared asset path is its own project.
- **Genre×mode code split** — vocabulary only, migrate lazily.

## Validation: the zero-code probe

Before this spec graduates to *proposed*: one hand-written documentary script (from a hand-built, fictionalized scam dossier) through the existing `provide-story` path on a test channel, evaluated per-artifact (script register, Story Bible on abstract entities, scene breakdown shot language, image look, music fit, narration register, final reel), plus a cross-cutting audit — **where did the pipeline inject fiction?** — distinguishing permitted dramatization (identities, visual texture) from forbidden invention (facts, amounts, chronology, outcomes). Each injection logged with the stage that introduced it: that log is the direct empirical input to the Evidence Bible invariant and the constraints checkpoints.

Single-sample caveat: one reel informs this spec; it doesn't harden architecture conclusions. Ambiguous results → a second script in a different subgenre, not more spec.

### Probe run 1 — 2026-07-16

Setup: test channel "The Costly Mistake" (`informational`, English, documentary style preset, per-story voice, AI music) · reel `5549529b` · script "The $400,000 Text Message" (~225 words, pig-butchering composite; dossier + script preserved in session scratchpad). Ran the full chain (`analyze_story → breakdown_scenes → generate_images`, then render chain after credits restored). All 8 images rendered and inspected.

| Probe question | Verdict | Evidence |
|---|---|---|
| Story Bible on abstract entities | **YES** | Analyzer (standalone re-run) extracted `novexis-platform` as an object ("digital crypto trading platform interface, appears real with charts and customer support") alongside characters + location + full journey. Digital/abstract entities are representable today. |
| Scene breakdown shot language | **Mostly documentary** | Over-the-shoulder phone screen, laptop with crypto candlestick charts, financial-documents b-roll, world-map money-tracing insert — genuine documentary grammar, produced with NO bible and no documentary-specific scene module. Hero beat used the extreme-close-up reveal framing (Dana's eyes over the laptop at "That's when she knew") — works, but it's the horror payoff pattern applied by default (and that video-tier scene FAILED image-QA yet reads fine). |
| Image look | **YES (all 8)** | Candid reportage, natural available light, film grain, unposed — the `documentary` preset reads as convincing real b-roll, not AI fantasy. The strongest artifact of the run. |
| Character continuity | **BROKEN — confirmed visually** | "Dana" is a different woman nearly every scene: brown bun (s1/s6), loose blonde at the window (s2), dark hair + glasses at the laptop (s4), wavy brown (s5). Direct consequence of the empty bible below — no frozen entity, no reference plates. NOT a documentary-mode gap; the mechanism that would fix it (Story Bible + plates) already exists and simply didn't run. |
| Music / narration / final reel | **In progress** | Render chain running after credit top-up; rows pending. |

Fiction-injection log (stage → injection → classification):

- **analyze_story → silent empty bible → pipeline defect, mode-agnostic.** The in-pipeline analyzer call failed transiently; fail-soft persisted a canon-only (empty) bible and marked the step `done`. Downstream ran bible-less: every scene entity reference (`dana-whitfield`, `smartphone`, …) unresolved, no reference plates, Dana re-invented per scene — now **confirmed in the rendered images** (see continuity row). The story-bible spec called silent degradation "the worst failure mode for a continuity system"; this probe is the live proof. Fail-soft needs an operator-visible surface (reel-level QA note), and for `dossier`-mode stories an empty Evidence Bible must **block, not degrade** — facts, unlike visual continuity, must not fail soft.
- **generate_images → world-map traced money across many countries; frozen fact says three.** Forbidden invention of a quantitative fact by a renderer. Exactly the class the `constraints` checkpoints must catch (scene-qa validating against the Evidence Bible).
- **analyze_story (standalone re-run) → invented Dana's appearance** ("short brown hair, office attire") and an un-narrated "denver-home-office" location. Permitted dramatization under fictionalized-identity framing, but it violates the bible's own don't-fabricate restraint rule — in documentary mode the extractor's anonymized-appearance authoring must be *deliberate* (extraction-time), not incidental.
- **generate_images → garbled AI text** on the bank statement, laptop charts, and map labels. Not fiction, but finance documentary needs legible numbers/UI or deliberately text-free framing — a `renderingProfile` concern.

- **UI loader copy → horror microcopy on a documentary (owner-spotted).** The Costly Mistake (tone intensity 6) drew the horror "dark" loader ticker ("Timing the scare…", "One last look over your shoulder…"). Root cause: `channelMood` derives from tone intensity alone, and `dark` = horror. Intensity ≠ mode. See Mode Propagation → "Propagation reaches the UI." A `renderingProfile`-keyed register fixes it.

Incidental robustness finding: image vision-QA (Claude) hard-fails `generate_images` when the QA provider is down/unfunded — QA gates on provider availability, unlike video QA which is fail-soft.

**Go/no-go: GO** for the minimal dossier slice. The engine's documentary output (shot grammar, imagery, entity extraction) is substantially better than expected with zero mode-specific work. Every failure found is seam-level — silent fail-soft, renderer fact-drift, illegible on-screen text — which is exactly what the contract's `constraints` + checkpoints + `renderingProfile` clauses address. No finding argues against the architecture; several validate it. Ranked renderer priorities for mode propagation: (1) fact-drift guard at scene-qa (constraints), (2) legible-UI/text handling for finance b-roll (renderingProfile), (3) documentary-appropriate reveal framing so the horror ECU pattern isn't the default. Continuity is a *known* fix (bible + plates), gated only on making fail-soft non-silent. Final music/narration verdict appends when the render completes.
