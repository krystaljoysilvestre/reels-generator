# Spec: Channel Series — the channel's Editorial Program, and per-reel genre

Status: proposed · Owner: PM · Eng: senior

## Why

A channel's story ideas come from one place today: the Planner invents them, rotating through an
abstract structural angle (`selectAngles`) that knows nothing about the channel's own subject matter.
That's a reasonable default for a channel that genuinely wants a different topic every time. It is the
wrong default for a channel whose creator already told us what it covers — Lihim ng Nayon's idea lists
five named content pillars (Mythical Creatures, Legends & Folklore, Urban Legends, Historical
Mysteries, Hidden Places) and roughly forty named subjects inside them (Aswang, White Lady of Balete
Drive, the Yamashita Treasure...). None of that reaches the Planner. It survives only as free text in
`nicheDescription`, one clause among hundreds, with no weight and no mechanism.

This spec names the dimension — **Editorial Program**, the second of the five dimensions in
[[compile-creator-intent]] (`~/.claude/plans/staged-beaming-lovelace.md`) — and gives it its first and,
deliberately, only implementation: a **series**, a named recurring category with its own seed queue. The
same mechanism also enables per-reel genre: a folklore channel's series legitimately span genres
(Mythical Creatures wants horror's dread; Hidden Places wants a travel-lifestyle register), and
`genreCategory` is channel-scoped today.

**Evidence status.** This is formalization of an already-validated need (W1's probe showed a channel's
own content pillars are real, extractable, non-invented text — see the principles probe), not a new
untested mechanism. The one genuinely new runtime behavior — the scheduler consuming a seed queue
instead of inventing — is additive and fails soft to today's behavior when a channel has no series.

## What this is not

**Not an "Editorial Program" abstraction layer.** Per [[compile-creator-intent]]'s architectural notes,
naming the concept does not mean building a base class for it. Series is the only implementation; there
is no `Program` interface, no polymorphism, no second selection strategy. The signal that would earn
one is recorded below (Non-goals) rather than built pre-emptively — the same discipline
`hypotheses/`'s graduation bar enforces elsewhere in this repo: nothing speculative until the engine is
blocked without it.

**Not a replacement for planner-invented ideas.** A channel with no series behaves exactly as today —
the scheduler's `insert({channelId, status, language})` is unchanged when there is nothing to draw from.
Series is additive capacity, not a new requirement.

**Not a beat template.** This is orthogonal to, and does not resurrect, the Episode Blueprint dimension
(W5), which was pre-registration-falsified today (`probe-episode-blueprint.ts`, $0.88): a compiled
per-episode beat structure measurably failed to raise beat adherence at either the planner or the gate,
and both interventions scored *below* doing nothing. A series names WHAT a story is about; it says
nothing about HOW the story is told, and this spec does not reopen that question.

## The model

```
Channel
  │
  ├─ channel_series        named categories: "Mythical Creatures", genre override, style override
  │     │
  │     └─ series_topics    the seed queue: named subjects, one row per topic, status-tracked
  │
  └─ reels
        ├─ seriesId          which series this reel came from (nullable — planner-invented reels have none)
        └─ genreCategory     FROZEN at creation — the resolved genre this specific reel ran under
```

**The principle, before the mechanism:** a reel's `genreCategory` is written **once, at creation**, and
never rewritten. This is the resolution discipline [[compile-creator-intent]] establishes — operational
intent resolves once, downstream stages consume the frozen value — applied at two points in the same
chain, not one:

1. **At creation** (scheduler / create-reel route), the series' own genre wins if it has an opinion,
   else the channel's default. `resolveGenreForNewReel(series, channel)` is the only place this
   fallback happens, and it runs exactly once, writing the result to `reel.genreCategory`:
   ```ts
   function resolveGenreForNewReel(series: { genreCategory: string | null } | null, channel: { genreCategory: string }): string {
     return series?.genreCategory ?? channel.genreCategory
   }
   ```
2. **Downstream, forever after**, every consumer reads the already-frozen result through one seam —
   the same `resolvePlatformPreset()` pattern that collapses a channel's platform SET to one render spec
   ([channel.ts](../packages/core/src/types/channel.ts), decision-log 2026-08-05) — never
   `channel.genreCategory` indexed directly, and (deliberately) never re-consulting the series either:
   ```ts
   function effectiveGenre(reel: { genreCategory: string | null }, channel: { genreCategory: string }): string {
     return reel.genreCategory ?? channel.genreCategory
   }
   ```

Keeping these as two separate functions, not one, is the point: a channel edit or series re-derive
(both non-deterministic LLM calls) can never silently change a finished reel's genre, because nothing
downstream of creation ever looks at the series again — the same problem `genreCategory` hashing already
caused once, at the cache-key layer below.

## Schema

`channel_series`:
| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `channelId` | uuid → `channels.id` | tenant chain, indexed |
| `name` | text | "Mythical Creatures" |
| `genreCategory` | text, **nullable** | this series' genre override; `null` = no opinion, falls through to the channel's default at creation time via `resolveGenreForNewReel` (never duplicated onto the row — see above) |
| `narrativeStyle` | text, nullable | overrides the channel's style when valid for this series' genre |
| `tasteRubric` | text, nullable | overrides the channel's rubric (rare; principles/W1 usually suffice) |
| `orderIdx` | int | rotation order |
| `enabled` | boolean | a creator can pause a series without deleting its topics |

**Boundary — series is not a generic configuration bucket.** It owns exactly these three overrides,
each meaning "this category of stories behaves differently," and nothing else. It is not the place for
voice, language, publish schedule, or thumbnail style, even though "series already has overrides" will
be a tempting argument later. If a future need doesn't fit that one sentence, it doesn't belong on this
table — it's either a channel-level setting or evidence for a new table.

`series_topics` (the seed queue):
| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `channelId` | uuid | denormalized for a cheap tenant-scoped query; `seriesId` is the real FK |
| `seriesId` | uuid → `channel_series.id` | |
| `subject` | text | "The Yamashita Treasure" |
| `status` | enum | `queued` \| `used` \| `skipped` |
| `usedByReelId` | uuid, nullable | which reel consumed it |
| `createdAt` | timestamp | |

**`used` is a historical record, not a lock.** It answers "which reel came from this topic," via
`usedByReelId` — it does not mean the subject can never be told again. Retelling "The Yamashita
Treasure" two years later is not a status transition on the old row: the creator (or a future assisted
requeue action) adds a **fresh `queued` row** with the same `subject` text. Topics are intentionally not
deduplicated by subject — the same choice the Planner's own `avoidList`/`recentPremises` already make:
old entries stay as readable history, and freshness is enforced by comparison at use-time, not by a
schema constraint preventing reuse.

`reels` gains:
- `seriesId` (nullable uuid → `channel_series.id`, `onDelete: 'set null'` — a deleted series must not
  strand or cascade-delete the reels it produced)
- `genreCategory` (nullable text) — null means "planner-invented, use the channel default"; set means
  "frozen, read via `effectiveGenre`"

## Consumers of `effectiveGenre`

The grep across the pipeline clusters into four groups, all switching from `channel.genreCategory` to
`effectiveGenre(reel, channel)`:

1. **Writer identity** — `story-planner.v1`, `story.v2`, `story-editor.v1`. The voice, taboos,
   registers and selection lens a series' genre picks.
2. **Gate/ending** — `defaultTasteRubric`, `story-ending-critic`, `story-ending-surgeon`.
3. **Scene/visual** — `resolveMediaGenre` → `breakdown-scenes`, `render-step`, `generate-images`,
   `revise-scene`, `motion`, `rephrase`, the depiction critic/doctor. This is also where W4's real-place
   sourcing gate lives, so a Historical Mysteries series can unlock sourcing without the whole channel
   being `informational`.
4. **Audio/timing** — `outroTailMs`, `moodToVoiceSettings`, `planNarrationPauses`,
   `annotate-audio-script`.

## Two consequences that silently corrupt output if missed

**Cache keys.** [`compute-timings-step.ts:75`](../../apps/worker/src/pipeline/steps/compute-timings-step.ts#L75)
hashes `channel.genreCategory` directly today; it must hash `effectiveGenre(reel, channel)` instead, and
the hash version bumps (`compute_timings.v7` → `v8`) so the change itself busts every cached timing.
`generate-story`'s studio hash needs the same review — it must hash the resolved genre, not the channel
column, or a series-genre reel and a channel-genre reel could collide on the same cache key.

**Style validity.** `narrativeStyle` is genre-scoped in `STORY_STYLES` — a channel-level style can be
invalid for a series' genre (a `deep_dive` style tagged `informational` means nothing to a
`horror`-genre series). Resolution order: the series' own `narrativeStyle` if set and valid for the
series' genre; else the channel's `narrativeStyle` *only if* `resolveStyle(seriesGenre, channelStyle)`
resolves; else pure genre (empty style). Silently keeping an invalid style would misfire the planner's
style-influence block for no visible reason.

## Derivation + auto-produce

`channel.v1` gains `series: [{ name, genreCategory, exampleTopics: string[] }]`. Per the
abstain-by-default discipline the destination and principles probes both validated: a channel whose
idea states no distinct content categories returns `[]`, and the channel behaves exactly as it does
today. This is not a new invention risk — the entries are the creator's own pillar names and example
subjects, the same kind of text W1's principles probe verified as groundable.

[`scheduler.ts`](../../apps/worker/src/pipeline/steps/scheduler.ts) (currently
`db.insert(reels).values({channelId, status, language})` and nothing else) picks the next enabled
series round-robin — **round-robin is a starting default, not a considered scheduling policy; this RFC
standardizes that series exist, not how they're weighted.** Freshness, engagement, or popularity-weighted
rotation are legitimate future levers and out of scope here. It pops the oldest `queued` topic, and
inserts the reel with `seedIdea` (the topic
text — the Planner still writes the actual story, honoring the request exactly as
`operatorSeed` does today), `seriesId`, and the frozen `genreCategory`. A series with an empty queue is
skipped for that tick, not treated as disabled. No queued topics anywhere on the channel → today's
behavior exactly (planner invents) — this is the additive-capacity guarantee from "What this is not."

The create-reel route accepts an optional `seriesId` for a creator manually picking a series in the UI,
applying the same freeze.

## Non-goals — recorded so they aren't lost, not built here

- **Serialized arcs.** Series today is *unordered rotation* — round-robin, pop any queued topic. An
  **arc** (ordered, with dependency — episode 2 assumes episode 1) is a different selection strategy.
  If a real need for one arrives, THAT is the signal that the real abstraction boundary is "how the
  next subject is chosen," with round-robin as one strategy among several — and that is when an
  `EditorialProgram` interface earns its layer, not before.
- **A third policy scope.** `channel_series` already means Source Policy (W4) resolves at two scopes
  (channel, series). A third scope — most plausibly an org/workspace-level brand-safety policy once
  multi-tenancy grows past one owner per channel — is the signal that would move policy resolution off
  `channels` entirely. Not needed yet; `resolveChannelPolicy(reel, series, channel)` is the one seam
  that keeps that move cheap when it comes.
- **Manual topic reordering / drag-and-drop UI.** `orderIdx` exists for rotation determinism, not for a
  creator-facing reordering feature. If requested, it's a UI-only addition on top of this schema.

## Verification

- Three Lihim reels on three different series (Mythical Creatures / Historical Mysteries / Hidden
  Places) must each render through their own scene module: the creature reel mints its threat plate on
  Flux, the historical reel sources a real photo (once W4 lands), the places reel gets no horror
  lighting.
- Narrator drift — read all three narrations cold, side by side. They must sound like one narrator
  (`narrativeVoice` held constant is the mitigation for genre varying per reel).
- No regression — Crossroads, Emberlight and Edge of Everything have no series; each must produce a
  reel exactly as before, with the step cache still hitting where nothing changed.
- Auto-produce — seed a queue, enable auto-produce, confirm consecutive ticks rotate series, pop
  distinct topics, mark them `used`, and stop cleanly (not error) when the queue drains.
- Reproducibility — re-derive a channel's series (LLM, non-deterministic), then re-render an existing
  reel. It must reproduce, because render reads the reel's frozen `genreCategory`, never the channel's
  current series.

## Related

`~/.claude/plans/staged-beaming-lovelace.md` — "Channel DNA: compile creator intent, don't extract
attributes," the parent plan this RFC implements (W3). Its two prior workstreams: `channel.v1.6`'s
`editorialPrinciples` (W1, shipped) and the recurring-entity canon spike (W2, evidence-gated and
passed, build pending). Its two ruled-out dimensions, both pre-registration-falsified this session: a
channel-level emotional destination (+0 planner adherence) and a compiled episode blueprint (both
planner-guidance and gate-enforcement scored *below* control). `specs/story-bible.md` — channel canon,
W2's parallel spec and the `BibleEntity` shape `persistentEntities` converges onto.
