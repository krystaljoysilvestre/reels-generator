# Kendrix Constitution

**Version 1.0.** The stable principles for how Kendrix builds creative subsystems, plus the one boundary
that matters right now. Extracted from the audio pipeline — not designed up front.

Treat this like an API contract: change it only through a deliberate design review, never casual per-sprint
edits. If a future decision contradicts a principle here, change the principle on purpose — don't drift
past it.

---

## Core philosophy

Every creative subsystem follows one pattern:

> **LLM proposes taste → the proposal is anchored to a real artifact → deterministic code executes it
> within bounded rules → QA verifies craftsmanship.**

- **AI** decides **intent** (taste, interpretation, creative judgment).
- **Code** decides **execution** (synchronization, repeatability, the numbers).
- **QA** decides **reliability** (technical craftsmanship and guardrails — never creative judgment).

Every future subsystem must be able to answer four questions: *Where is the proposal? What is the anchor?
Where does determinism begin? Who verifies it?* If any answer is missing, the design isn't ready.

---

## Architectural ownership

Each layer owns exactly **one** kind of decision, and never performs another layer's:

- **Story** — narrative intent (the authored script).
- **Spine** — story structure (the beats: where tension begins, peaks, pays off, settles).
- **Direction** — creative interpretation for one medium.
- **Renderer** — implementation.
- **QA** — technical correctness.

A layer must never perform the responsibility of another. This is the answer to every future "just put it
in the renderer" — the question is not *is it convenient here*, it is *whose decision is this*.

---

## 1. Principles

1. **The Story Spine is the highest-integrity artifact in the system.** It is the anchored, mostly-derived
   *structure* of the story — its beats, roles, and emotion over time — that every department reads from.
   Because a wrong Spine breaks every department at once, it is never free LLM prose; it behaves like
   `compute_timings`, not like the sound designer.
2. **Directions project the Spine into ONE medium.** There is exactly one today: Audio Direction.
3. **Renderers execute deterministically and may not perform creative inference.** A renderer knows
   focus, intensity, emotion, and time — not horror, comedy, or documentary. Genre lives in the
   Direction, never here.
   - *Allowed:* smoothing, interpolation, ducking, limiting, gain/motion curves, resolving anchors to ms.
   - *Forbidden:* deciding a climax, inventing a silence, moving focus, changing emotion — any new
     creative judgment. Those are the Spine's and Direction's job.
4. **QA protects craftsmanship, never creativity.** It enforces technical invariants (intelligibility,
   anti-pumping, focus consistency, continuity) with thresholds tuned by ear, like loudnorm. **QA may
   reject or clamp execution, but may never reinterpret intent** — if Direction says `silence`, QA can
   cap the silence at 900 ms; it cannot decide music would sound better.
5. **Uncertainty only decreases downstream — the load-bearing invariant.** Story (most ambiguous) → Spine
   → Direction → automation → gain curves → ffmpeg (fully deterministic). **No stage may be more ambiguous
   than its parent.** This rejects, on sight and without discussing implementation, any design that places
   an LLM *after* the renderer or QA — the arrow only ever points one way.
6. **Extract abstractions from proven implementations, not anticipated consumers.** Abstractions
   designed for five hypothetical readers are almost always wrong; ones pulled out of one working
   consumer are stable. It is *why* the audio passes work — they were earned solving real listening
   problems, not predicted. (Stated as a standalone rule in §7 because it is the easiest to violate.)

---

## 2. Current consumer: Audio only

The Spine has exactly **one reader**: Audio. Caption, Motion, and Visual Directions are intentionally
deferred until one of them actually needs to read the Spine — at which point nothing needs renaming.

---

## 3. Artifacts & contracts

**StoryBeat (the Spine).** Anchored and resolvable like a cue — nothing floats. Declarative: it states
*what the story is*, not how sure the extractor was (confidence and other production metadata stay inside
the extraction pipeline, out of the IR — a renderer can't act on doubt anyway).
```ts
StoryBeat {
  anchor: string        // verbatim, UNIQUE narration substring (resolved to ms downstream)
  scene: number
  role: 'opening' | 'escalation' | 'held_breath' | 'payoff' | 'aftermath'
  emotion: string       // curiosity | tension | release | shock | ...
  affects: string[]     // e.g. ['audio'] — the invalidation graph (see §5)
}
```
Derived from what we already compute reliably (scene `isHero` flags, the climax we already find, scene
moods); the LLM *annotates/nuances*, it never invents the structure.

**AudioDirectionSegment (audio's projection).**
```ts
AudioDirectionSegment {
  startMs: number; endMs: number         // resolved from beat anchors
  emotion: string
  focus: { layer: 'voice'|'music'|'foley'|'ambience'|'silence'; cue?: string }  // cue-level, not just layer
  intensity: number                       // 0..1
}
```
**Hard rule:** no numbers. If a `db`, `eq`, `reverb`, `fade`, `compressor`, or `stereoWidth` field ever
appears here, the abstraction has failed and this document was violated. Direction is intent; the
renderer owns every number.

**Automation (renderer output).** Per-stem, time-varying, bounded, smoothed gain curves — built from
Direction over the persisted stems (voice/music/sfx/ambient already exist as `kind:'stem'`).

---

## 4. The audio slice (the first brick)

```
Minimal Spine (derived + anchored)
   → Audio Direction (focus + intensity per segment)
      → Automation Renderer (bounded, smoothed per-stem gain on existing stems)
         → Automation QA
            → Mix
```
Build the **full vertical stack for audio only**, prove it better *by ear* on one reel, then generalize.
Do not spec five departments.

---

## 5. Absorbing the existing passes

The current deterministic passes are **not hacks** — they are specialized renderers that were written
*before the abstraction above them existed*. Each is secretly answering a *story* question. As the Spine
and renderer mature, each becomes a consumer of Direction and shrinks. Migrate **one at a time; each must
reproduce the current reel by ear before the old pass is deleted.**

| Today (works now) | Becomes |
|---|---|
| opening dread injection (`opening-dread.ts`) | `opening` phase → intro texture from Direction |
| climax choreography (`climax-choreography.ts`) | `payoff` beat → focus + the hit |
| silence-before-payoff (`compute-timings` §4.7 setup) | `held_breath` phase → `focus: silence` |
| ring-out (`compute-timings` §4.7) | `aftermath` phase → beat duration |
| harsh-texture guard (`sfx-rules.ts`), bus hierarchy (`mix-audio.ts`) | renderer/QA invariants |

**Invalidation graph:** `StoryBeat.affects` (and per-edit `target`) means an audio-only change (Studio
tier: "hold the silence longer") re-runs audio only — never the multi-minute video render. Visual and
audio are already split (audio-only = a fast re-mux); the Spine must preserve that split or the premium
director's-notes feature is unusable.

---

## 6. Non-goals (as important as the goals — this section fights scope creep)

- No shared / multi-department renderer.
- No Caption, Motion, or Visual Direction.
- No "Performance Direction" layer — the **Story Spine is** the shared performance intent.
- No numbers in Direction (no DAW-in-JSON).
- No free-prose Spine — every beat is anchored and resolvable.
- No big-bang rewrite of the working passes.

---

## 7. Extraction Rule

> **A new abstraction may only be introduced after at least one working implementation has demonstrated
> the need for it. Do not design abstractions for hypothetical future departments.**

> **A working implementation always has priority over a perfect abstraction. When the two disagree, ship
> the implementation first and extract the abstraction afterward.**

Principle 6 states the first; both stand alone here because they are the easiest rules to violate and the
most expensive when violated.

---

## 8. Relationship to prior docs

Refines `specs/story-ir-architecture.md` (the earlier "Kendrix IR" north star) with the hard-won
correction: **build the IR by extracting it from one working department, not by designing it for all of
them.** `specs/audio-tiers.md` holds the SaaS tier matrix; the Studio "directable audio" tier is the
natural consumer of Audio Direction via director's-notes editing of the Spine.
