# Spec: Story Bible + Story Analyzer stage

Status: proposed · Owner: PM · Eng: senior

## Why

Continuity across a reel's images is currently *hoped for*, not *guaranteed*, and the reason is a hard constraint:

- **`gpt-image-1` has no seed and no image-to-image.** Every scene image is an independent draw ([generate-images.ts:11-12](apps/worker/src/pipeline/steps/generate-images.ts#L11-L12)). **Prompt text is the only continuity lever we have.**
- The only "bible" today is **channel-level and thin** — `{region, era, canonLocations: string[], canonObjects: string[], vocabulary}` ([channel.ts:18](packages/core/src/types/channel.ts#L18)), where `canonLocations`/`canonObjects` are *names*, not visual specs.
- So the scene breakdown ([breakdown-scenes.ts](apps/worker/src/pipeline/steps/breakdown-scenes.ts)) is forced to **invent** every per-story visual fact (this Ashley, this cracked mirror, this bedroom) at first mention and is merely *told* to stay consistent ([scenes.v1.ts:85-88](packages/core/src/prompts/scenes.v1.ts#L85-L88)). It paraphrases on every return → drift.

The fix is one new stage that builds an authoritative, frozen **symbol table** of recurring entities, plus a mechanical **assembler** that splices canonical entity text into every prompt — the same separation already proven by `assembleImagePrompt(scene.visualPrompt, channel.stylePreset)` ([generate-images.ts:87](apps/worker/src/pipeline/steps/generate-images.ts#L87)), where the LLM writes content and code splices the invariant style.

## The model: a compiler

```
Story
  │
  ▼
Story Analyzer  (NEW — LLM)        build the symbol table, ONCE
  │
  ▼
Story Bible  (persisted on reel)   frozen canonical descriptions
  │
  ▼
Scene Breakdown  (existing — LLM)  emit symbol REFERENCES, not descriptions
  │
  ▼
assembleImagePrompt  (code only)   LINK: expand symbols → order → concat
  │
  ▼
Image Generation
```

One added LLM call. Responsibilities:

- **LLM understands and selects.** The analyzer is the *only* writer of canonical entity text, and it writes each string exactly once.
- **Code owns identity, expansion, ordering, assembly.** From the moment the bible is written, entity descriptions are **read-only and spliced byte-identically** into every prompt that references them. Nothing re-renders → nothing drifts.

### Why a *separate, persisted* stage (not a single bigger call)

A 75-second reel has maybe one narrator + two locations + two objects, so within-reel continuity alone is a *real but small* win — you could get most of it by having the breakdown emit a cast-sheet in the same call. Two things make the separate, persisted bible decisively better:

1. **In-editor per-scene regen.** When a user regenerates one scene's image ([StoryboardEditor.tsx:221](apps/web/src/app/(app)/storyboard/[reelId]/StoryboardEditor.tsx#L221)), a cast-sheet that lived inside the original breakdown call is *gone* — that regen would re-invent the mirror and break against the other 11 scenes. A **persisted** bible makes single-scene regen consistent with the rest of the reel. This is the load-bearing reason.
2. **Cross-reel canon reuse.** A persisted, normalized bible lets a channel-recurring location keep one look across *every* reel, not just within one.

Within-reel continuity is the third reason, not the first. (Honest caveat: cross-reel consistency is only as strong as the channel canon's own description — see the per-reel-extension note under Channel canon unification.)

## Core rules (these are the design; everything else is mechanism)

1. **Mechanical expansion, never regeneration.** The scene LLM emits entity *ids*; `assembleImagePrompt` pastes the frozen canonical string. The scene LLM must NOT re-describe a referenced entity.
2. **Facts, not prompts.** The analyzer extracts depictable, observable facts (`crack, bottom-left`), never mood or editorial (`creepy: true`). Dread/mood is owned by the genre module in `scenes.v1`, not the bible.
3. **Restraint — don't fabricate.** Pin only what the narration implies. If the story never gives the narrator an age or a hoodie, the bible doesn't either. A fabricated trait becomes a false continuity demand and can fight the genre's face-obscuring.
4. **Narration wins.** The bible informs; the line overrides (same precedence `scenes.v1` already applies to the world bible). If the story contradicts the bible, the scene follows the story.
5. **Immutability beats tidiness.** The assembler may expand, order, and concat. It may **not** rewrite, dedupe phrases, or otherwise mutate a canonical string — that would reintroduce the drift the whole design removes.

## Schema

New: `StoryBibleSchema` in `packages/core/src/types/` (sibling to `WorldBibleSchema`).

```ts
// A recurring thing with stable visual identity. The `description` is FROZEN at analyze
// time and spliced byte-identically wherever the id is referenced.
export const BibleEntitySchema = z.object({
  id: z.string(),                                  // kebab-case symbol: "bedroom", "ashley", "cracked-mirror"
  kind: z.enum(['character', 'location', 'object']),
  // Canonical depictable noun phrase, FACTS ONLY, in the channel's narration language.
  // The analyzer is the sole author; written once, never regenerated.
  // For a LOCATION, this MUST enumerate the physical light sources/openings present
  //   (a window, a bare bulb, a gasera, "no electricity") — they are facts of the place.
  //   Which source is ACTIVE, plus time of day, is decided per-scene (see Lighting split).
  description: z.string().min(1),
})
export type BibleEntity = z.infer<typeof BibleEntitySchema>

export const StoryBibleSchema = z.object({
  entities: z.array(BibleEntitySchema).default([]),

  continuity: z.object({
    // Authoritative reel-wide perspective. Today the scene LLM re-detects this per run
    // (scenes.v1 PERSPECTIVE rule); making it a bible fact keeps it consistent.
    narratorPerspective: z.enum(['first_person', 'third_person']),
    // Which entity id IS the narrator (if any). Drives perspective-aware expansion: in a
    // first_person reel the assembler must NOT splice this entity as a full figure (see
    // Assembler). null when the narration has no embodied narrator.
    narratorEntityId: z.string().nullable(),
    // Optional ordered time-of-day cues, if the story makes them explicit.
    timeline: z.array(z.string()).default([]),
  }),

  // Story-wide constraints the genre default wouldn't already imply (PRECEDENCE: genre module
  // owns genre DEFAULTS; this captures only THIS story's specifics). Free text on purpose —
  // a typed flag is added ONLY when a scene-stage consumer is wired to honor it; until then an
  // invented boolean key is unenforceable. e.g. "the reflection must stay ambiguous".
  constraints: z.object({
    directorNotes: z.array(z.string()).default([]),
  }).default({ directorNotes: [] }),
})
export type StoryBible = z.infer<typeof StoryBibleSchema>
```

**Deliberate non-decisions** (kept simple on purpose):

- **`description` is a string, not a field grid.** A `{walls, bed, window, wear}` grid fits a bedroom and nothing else — it doesn't generalize to a mirror, a banca, a grandmother, a lamp. Natural language is the only schema wide enough for arbitrary entities, and the LLM writes a tighter noun phrase than a deterministic prose renderer would. The string is the canonical artifact; the LLM is the renderer; it runs once. If a second consumer ever needs re-rendering (e.g. a form editor), add a `notes` facts-bag *alongside* the frozen string and render lazily — not before.
- **No per-entity priority field.** Shot priority is a *scene* decision (`primaryEntity` below), not a property of the entity.
- **Lighting is not its own field.** A location's available light lives inside its `description` as facts; the scene stage reads it and picks the active source.

## Scene breakdown changes (`scenes.v1` + `SceneOutputSchema`)

The scene LLM stops describing recurring entities and starts referencing them. Add to `SceneOutputSchema` ([story.ts](packages/core/src/types/story.ts)):

```ts
  // Symbol references into the reel's Story Bible. The assembler expands these.
  primaryEntity: z.string().nullable(),          // the ONE thing the shot leads with; null if the
                                                 //   subject is an un-canonical detail (a shadow, a hand)
  supportingEntities: z.array(z.string()).default([]),
  sceneIntent: z.string().min(1),                // "audience notices the reflection before the woman"
```

`imagePrompt` stays, but its job shrinks: **action, composition, active lighting, atmosphere** — NOT entity descriptions. It refers to entities by natural label ("Ashley", "the mirror"); the canonical specs are spliced in by the assembler. Result: shorter prompts that spend their ~30–50 words on what's *happening*, not on re-pinning the room.

`scenes.v1` prompt updates:

- Receives the Story Bible JSON as context. New instruction: **"Reference recurring people/places/objects by their bible `id` in `primaryEntity`/`supportingEntities`. Do NOT redescribe them in `imagePrompt` — the system splices their canonical look. Describe only the action, framing, active light, and atmosphere."**
- `sceneIntent` replaces the analyzer-side `sceneHints` idea — intent is decided *here*, where the cut and shot are already decided, so no second stage guesses at segmentation.
- `narratorPerspective` comes from the bible (authoritative) rather than per-run detection.
- The existing CONTINUITY block ([scenes.v1.ts:85-88](packages/core/src/prompts/scenes.v1.ts#L85-L88)) shrinks to "for anything NOT in the bible, fix traits on first appearance and reuse them" — the bible covers the recurring set.

`primaryEntity` nullable is load-bearing: "the shadow under the closed door" is the subject but not an entity, and the existing "lead with the single detail that carries meaning" rule must still hold.

## Assembler changes (`assembleImagePrompt`)

Today: `assembleImagePrompt(visualPrompt, stylePreset)`.

New: `assembleImagePrompt(scene, bible, stylePreset)` — resolve references against the reel's bible snapshot and concat **sentence-level, deterministically**. Note the existing convention **leads with style** ([imageprompt.ts:10](packages/core/src/assembly/imageprompt.ts#L10)) — "style DNA frames how the scene is read" — so style stays first; entity specs slot between style and the action prose:

```
[stylePreset].  [primaryEntity.description].  [supportingEntities[*].description joined].  [scene.imagePrompt]
```

- **Order by role:** style first (unchanged convention), then primary entity (satisfies the VISUAL PRIORITY "lead with the subject" rule mechanically, now that the LLM no longer redescribes it inline), then supporting, then the scene's action prose.
- **Perspective-aware narrator suppression (correctness, not polish).** In a `first_person` reel the narrator must never be rendered as a separate figure — it's a hard `scenes.v1` rule ([scenes.v1.ts:94](packages/core/src/prompts/scenes.v1.ts#L94)) and image-QA *fails* full-body POV shots ([generate-images.ts:137](apps/worker/src/pipeline/steps/generate-images.ts#L137)). So when `narratorPerspective === 'first_person'` and a referenced id equals `continuity.narratorEntityId`, the assembler **must not splice that entity's full description**; it either drops it or substitutes a fixed POV fragment ("the narrator's own hands/shoulder may edge the frame"). Splicing "young woman, long hair…" into a POV scene injects exactly the figure QA will reject, on every POV scene. Third-person: expand normally.
- **Sentence-level join only.** No grammar weaving (no a/an/pluralization logic) — that's the prose-renderer trap. Each canonical string is its own clause; the scene's prose ("Ashley stands before the mirror…") reads coherently after the specs establish identity.
- **Lenient reference resolution.** Match `slug(id)` on both sides (and any aliases), so `mirror`/`the-mirror`/`cracked-mirror` resolve to one entity. The continuity guarantee hinges on the scene LLM reproducing ids, and it won't always be byte-exact — normalize rather than miss.
- **Unresolved reference = enhancement missing, AND it must be observable.** If a reference still doesn't resolve, **drop the expansion and render anyway** (the `imagePrompt` is self-contained prose, so it never fails a reel — the linker-error rule). But a silent drop is the worst failure mode for a continuity system: the reel looks fine and continuity quietly didn't happen. So surface every unresolved reference as a **scene-QA note** via the existing `reviewSceneBreakdown` warning channel ([breakdown-scenes.ts:109](apps/worker/src/pipeline/steps/breakdown-scenes.ts#L109)), not just a `console.warn`.
- **No phrase dedup.** See Core rule 5. Within one prompt each id appears once anyway.

## Lighting split (made concrete)

- **Bible owns available light** — the physical fixtures/openings that exist in a location, recorded as facts in its `description` (a window, a bare ceiling bulb, a gasera, "no electricity").
- **Scene owns active light** — which source is on, time of day, direction, intensity. The existing `scenes.v1` LIGHTING rule ([scenes.v1.ts:90](packages/core/src/prompts/scenes.v1.ts#L90)) already says "name the source present or implied in THIS place"; now "this place" is pinned by the bible, so the scene can't invent a fixture the room doesn't have.

## Channel canon unification (normalizer, not a fork)

Channel canon and story extraction merge into the **resolved bible**: channel canon provides entities that recur *across reels* (the same haunted house every video); the analyzer adds *this story's* new entities and may extend a channel entity's description.

Migration is a **normalizer at the edge**, so the assembler only ever sees `BibleEntity[]`:

```ts
// v1 channel canon is name-only; treat it as v2 where description === name.
function normalizeCanon(wb: WorldBible): BibleEntity[] {
  return [
    ...wb.canonLocations.map((name) => ({ id: slug(name), kind: 'location', description: name })),
    ...wb.canonObjects.map((name)   => ({ id: slug(name), kind: 'object',   description: name })),
  ]
}
```

- Old channels (name-only) still resolve — their entities just carry a thin description (the name) until/unless re-derived. No code path forks on schema version.
- New channels: extend `channel.v1` generation + `WorldBibleSchema` to emit structured `BibleEntity[]` for channel canon. Optional/additive — old reels stay reproducible.
- The analyzer receives normalized channel canon as input and **references existing ids** rather than re-minting them, so a channel-recurring location keeps one canonical look across every reel.

## Persistence & idempotency

- **New step `analyze_story`**, run before `breakdown_scenes`, behind the existing `runStep`/`buildInputHash` machinery.
  - `inputHash = buildInputHash(STORY_ANALYZER_V1_VERSION, { narration: story.body, channelCanon })`
  - Output persisted as a **snapshot on the reel** — new column `reels.storyBible` (jsonb). Snapshotting (not recomputing) keeps re-runs stable and gives the storyboard editor something concrete to show/edit later.
  - **Fail-soft.** If the analyzer errors or returns an empty bible, the pipeline does **not** block — `breakdown_scenes` falls back to today's invent-inline behavior (an empty bible means every reference is unresolved, which the assembler already tolerates). The bible strictly *adds* continuity; its absence degrades to current quality, never to a failure.
- **`breakdown_scenes` hash must include the bible**, so editing the bible re-triggers the breakdown:
  - extend [breakdown-scenes.ts:86](apps/worker/src/pipeline/steps/breakdown-scenes.ts#L86) `buildInputHash` input with a hash of `reel.storyBible`.

## Analyzer prompt contract (`story-analyzer.v1`)

Input vars: `narration`, normalized `channelCanon: BibleEntity[]`, `nicheDescription`, `genreCategory`, `era`, `regionDescriptor`.

System (shape):

> You are a continuity analyst for a narrated vertical reel. Read the finished narration and extract the recurring people, places, and objects as a stable visual reference. You are an **information extractor, not a creative writer**.

User message rules (the spine):

- **Extract only what recurs or anchors the story.** A one-off detail mentioned once and never seen again is not an entity.
- **Facts only.** Each `description` is a short, depictable noun phrase of *observable* traits (build, hair, wardrobe, material, colour, wear, condition, count, state). No mood, no adjectives of feeling, no story interpretation.
- **Don't fabricate.** Use only what the narration states or directly implies. If a trait isn't given, leave it out — do not invent ages, brands, names, or backstory.
- **Reuse channel canon ids.** If an entity matches one in the provided channel canon, reference that `id` (optionally extend its description with story-specific facts); don't mint a duplicate.
- **Locations enumerate their light sources/openings** as facts (window / bare bulb / gasera / no electricity).
- **Perspective + narrator:** detect first- vs third-person for the whole reel. If first-person and the narrator is an embodied character, set `narratorEntityId` to that entity's id (so the assembler can suppress full-figure rendering); otherwise `null`.
- **Constraints:** capture only story-specific rules the genre default wouldn't already imply; put anything without a typed flag into `directorNotes`.
- Output `StoryBibleSchema` JSON only.

## Files touched

- `packages/core/src/types/` — new `StoryBibleSchema`, `BibleEntitySchema`; extend `SceneOutputSchema` (`primaryEntity`, `supportingEntities`, `sceneIntent`); extend `WorldBibleSchema` for structured channel canon (additive).
- `packages/core/src/prompts/story-analyzer.v1.ts` — new prompt + `STORY_ANALYZER_V1_VERSION`.
- `packages/core/src/prompts/scenes.v1.ts` — consume bible; reference-not-describe; `sceneIntent`; perspective from bible.
- `packages/core/src/assembly/` — `assembleImagePrompt` signature + expansion/order/concat; `normalizeCanon`/`slug`.
- `apps/worker/src/pipeline/steps/analyze-story.ts` — new step.
- `apps/worker/src/pipeline/steps/breakdown-scenes.ts` — load bible, pass to prompt, fold into hash.
- `apps/worker/src/pipeline/steps/generate-images.ts` — call new `assembleImagePrompt` with bible.
- `apps/worker/src/pipeline/index.ts` + `prompts-bridge.ts` — wire the step + exports.
- `packages/db/src/schema.ts` — `reels.storyBible` jsonb column (+ migration).
- `apps/web/.../channel/*` routes + `channel.v1.ts` — structured channel canon generation (additive; can land later).
- `packages/db/src/seed.ts` — seed structured canon.

## Honest ceiling

Even a perfect text bible **will not hold a face** across independent `gpt-image-1` draws. Prose locks wardrobe, room, props, palette — the stuff that reads at a glance in a fast reel. Same-actor face continuity is an **image-side** problem (a reference-image/character-anchor model or a provider with i2i), out of scope here. Don't bank on the bible solving faces.

## Build order

0. **Prompt-shape validation gate (do this FIRST, ~30 min, no code).** Hand-build 3–4 prompts in the new "spec sentences then action then style" shape and generate them against the current single-prompt shape. We're betting front-loaded canonical specs make images *more consistent without making them worse*; gpt-image-1 may prefer an integrated prompt. If the shape hurts coherence, fix the join (ordering, sentence vs. clause) **before** the DB migration — this is the cheapest possible moment to learn it. Gate steps 2–4 on this looking good.
1. `StoryBibleSchema` + `normalizeCanon` + `slug` + `assembleImagePrompt` expansion, incl. perspective-aware narrator suppression and lenient resolution (pure, unit-testable; no LLM).
2. `analyze-story` step + `story-analyzer.v1` + `reels.storyBible` column. Fail-soft.
3. `scenes.v1` reference-not-describe + scene-schema fields (`primaryEntity`/`supportingEntities`/`sceneIntent`) + breakdown hash + unresolved-ref QA note.
4. Wire `generate-images` to expand via the bible.
5. (Later) structured channel canon generation + editor surface for the bible.

Steps 1–4 deliver the continuity win on new reels; old channels degrade gracefully via the normalizer.
