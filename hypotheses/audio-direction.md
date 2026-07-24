# Hypothesis: Audio Direction — the canonical creative intent for a reel's sound

Status: **provisional.** Emerged 2026-07-24 from the founder's reframe of the "thin sound" work: the immediate fix is audio *engineering* (levels, gain-staging, QA — Phase A, being built now); the larger opportunity is audio *direction* — the creative reasoning that happens *before* a single sound is generated. This document carries that knowledge; it does **not** drive implementation. · Owner: PM · Eng: senior · Craft: Sound Director

> A design hypothesis, not a commitment. Leave implementation untouched until it clears the bar in [README](README.md): *the engine is blocked without it.* Today it is not — Phase A makes the existing sound audibly present, which is enough to ship on. This layer earns its place only when presence-plus-correct-levels proves insufficient and the gap is demonstrably **creative intent**, not mix mechanics.

## Why now — a different path to first-class

The founder's complaint ("I can barely hear it… no continuous background music and sound effects") had two roots, found by three parallel research threads (Research Partner + Sound Director + Technical Advisor; synthesis in the session record):

1. **Presence-floor failure** — the bed and SFX were gain-staged ~22–27 dB under the voice, and two code paths dropped to literal silence. This is **mechanism**, fixed in Phase A (reference gain-staging, a guaranteed bed, a QA presence invariant) at near-zero cost.
2. **Register-character failure** — a calm documentary got horror-grade sound. This is **craft**: the per-reel sound designer decides bed/SFX/silence from a genre-tinted blank slate, one flat pass, with no articulated *intent* it is executing.

Phase A fixes #1 for good. But #2 is the tip of a structural gap: **the pipeline has no artifact that says what the audience should FEEL, moment to moment, before the generators run.** Today's flow is Story → `audioScript` (a cue list) → generate → mix. A supervising sound editor does not begin with "how loud is the music"; they begin with "what is this moment, whose ears are we in, what does the silence before it buy." That reasoning has no home in the architecture.

This is the same shape as two abstractions that already earned their place by the *absence* route:

| Layer | The absence it exposes |
|---|---|
| **Story Bible** | no owner of *fictional* continuity → entities drift across scenes |
| **Evidence Bible** | no owner of *factual* truth → a debunked myth ships gate-approved |
| **Audio Direction** (candidate) | no owner of *sonic intent* → sound is assembled from cues, never *directed* |

## The boundary it establishes: intent vs. execution

> **Audio Direction is the canonical creative intent for a reel's sound.** It states what each moment should feel like, whose perspective we hear it from, where silence and peaks fall, and which motifs recur. The generators (music, ambience, foley, SFX) and the mixer are **executors** of that intent — never its authors.

The load-bearing guard, in the founder's words: **this is NOT a prompt-tuning device.** A blueprint that exists to write better generation prompts is model-era tooling that rots when the provider changes. An Audio Direction is a durable artifact — music, ambience, foley, SFX, and any *future* provider all derive from the same intent, and the artifact **survives a provider swap untouched.** That is precisely what makes it a **Direction** in the [ARCHITECTURE.md](../ARCHITECTURE.md) sense (Story Spine → Directions → deterministic Renderers → QA), rather than a fancier prompt. Today's `audioScript` is a pre-abstraction *renderer input*; this hypothesis is the Direction it would grow into.

## What the Direction answers (Phase B core)

Per scene / moment, the founder's blueprint questions:

- **Emotional intent** — what should the audience feel here?
- **Listener perspective** — observer, or inside the protagonist's head (objective vs. subjective hearing)?
- **Environment character** — alive, empty, oppressive, nostalgic, surreal?
- **Silence** — where is it used *intentionally*, and what does the moment before it earn?
- **Peaks & releases** — where the arc builds, lands, and rests (a documentary peaks on a *revelation*, not a scare; some registers never "drop").
- **Motifs** — recurring sonic ideas that reinforce identity without becoming predictable.

### Sound continuity as a first-class concept

Professional sound reasons **across the whole reel**, not scene-by-scene: ambience that evolves as locations change, tension that *builds* instead of resetting each scene, a drone introduced in Scene 2 that subtly persists to Scene 7, a silence that feels earned by what preceded it. This is the **audio analogue of the visual `continuity.journey`** — the immutable cross-scene ground truth `analyze_story` already emits and the breakdown obeys (a proven pattern to copy, not invent). The existing sustained-cue primitive (`endAnchor` spans) is its single-span seed; the Direction adds the cross-scene *reasoning* on top.

## Mechanism (candidate — not adopted)

- **Direct → Design, not a new stage.** Deepen the existing `annotate_audio_script` into two moves inside one seam: first *direct* (produce the intent above), then *design* (the current cue-level plan, now executing that intent). This respects "uncertainty only decreases" — the LLM still proposes *before* determinism; no new pipeline hop.
- **A direction-fidelity check is mandatory, not optional.** We have measured that downstream stages **satisfice** a plan (the judge-and-force finding): a blueprint with no enforcement will be quietly ignored exactly as soft prompt guidance is. The check verifies the generated/mixed sound reflects the Direction, and forces a redesign when it doesn't. The founder flags this as a potential top differentiator — most AI systems produce a plan and then drift from it.
- **Numbers stay in the renderer.** The Direction carries *intent* (focus, perspective, intensity-as-feeling), never dB or ms — those remain in the mixer (Phase A), per layer ownership. When this graduates, the designer's current per-cue `volumeDb` must become intensity/focus, not a literal level.

## The Audio Bible — the bridge to Channel Audio Identity (Phase C)

The Audio *Direction* describes one reel. Its channel-level twin is the **Audio Bible**: signature motifs, ambience palette, instrumentation, recurring transitions, emotional pacing tendencies, loudness philosophy, when silence is used, forbidden sounds, iconic callbacks. Every reel's Audio Direction **inherits from it**. This completes the Bible family on one proven mechanism — *frozen identity, reference-don't-re-derive*:

| Bible | Owns |
|---|---|
| Story Bible | fictional truth (entity continuity) |
| Evidence Bible | factual truth |
| **Audio Bible** | sonic identity |

The north star (founder): **a viewer eventually recognizes a channel without seeing its logo.** This is the concrete artifact that the vaguer "Channel Audio DNA" becomes.

## The mature-blueprint horizon (evolutionary — explicitly NOT Phase B requirements)

Named now only because a flat cue list cannot be retrofitted to hold them; built strictly as evidence demands: foreground/midground/background sound layers · audio camera distance (close/medium/wide) · scene-transition design · callbacks · dynamic-range targets (compressed vs. cinematic) · intentional contrast (quiet → impact over constant intensity).

## Non-goals (what it must never own)

- **The mix.** Levels, ducking, loudness, gain curves stay in the renderer (Phase A). The Direction says "this moment is intimate"; the mixer decides the dB.
- **Story or truth.** It never chooses *what happens* (Story Spine / Planner) or *what is true* (Evidence Bible). It directs how the chosen story *sounds*.
- **A second generator.** The Sound Director (the advisory coworker) does not author it per-reel either; it owns and improves the *stage*, never becomes a parallel pipeline stage.
- **A wall of mandates.** Per the Anti-Prescription Guard: intent and failure modes, never prescribed textures or cue quotas — that is what produced the 18-revision horror-overfit.

## Falsifiability / adoption threshold

- **Graduates to /specs only when** presence-plus-register (Phase A + the register spine) proves insufficient *and* the residual gap is demonstrably creative intent, not mechanism — i.e. a blind cross-register test where reels are audible and correctly-leveled but still emotionally flat/wrong, traceable to the *absence of directed intent*.
- **Cheap first probe** (before any build): have the model emit an Audio Direction (JSON) for a handful of cross-register stories and judge whether the *intent* is right — before wiring it to any generator. If the Direction itself is thin or generic, the layer is not yet earned.
- **Retires if** a simpler mechanism (register-first design + presence QA, i.e. Phase A + B-register) closes the emotional gap without a separate intent artifact — in which case `audioScript` was enough and this over-reached. Move to `retired/` with the evidence, don't delete.
- **Graduation signal to watch (the combination-preset falsifier, founder 2026-07-24).** Emotion (color) and **energy (motion)** are separate creative dimensions — *hopeful+quiet ≠ hopeful+driving*, *horror+slow-burn ≠ horror+relentless*. Phase B's flat `musicMood` enum deliberately **fuses** them into pragmatic (color, motion-default) presets. That is fine until the day a genuinely-needed preset is a *combination* the enum can't name without exploding ("hopeful-but-restrained", "warm-but-mysterious", "playful-but-sentimental"). **When that day comes, the flat enum has failed** and the two-axis split — register/intent deriving the musical vocabulary, rather than `musicMood` being the primary abstraction — is earned. That is precisely the shape of this Direction layer, so the signal is a concrete step toward graduation. Record the first real instance here when it appears.

## Strongest known objection

*The pipeline already has an audioScript that carries mood, a peak fraction, and per-cue intent — isn't "Audio Direction" just that, renamed, plus scope creep?* Partly true today, and that is the honest risk: the safe first steps (register-first design, presence QA) live inside the existing stage and may be **all that's needed**. The distinction only becomes load-bearing if directed intent measurably beats a good cue list on a blind ear test — and if it doesn't, this stays a hypothesis or retires. The canonical-artifact guard is what keeps it from collapsing into "better prompts": if the artifact isn't provider-independent creative intent that the generators demonstrably *derive from* (and are *checked against*), it hasn't earned separation from `audioScript`. Until that evidence exists, this document carries the idea and nothing more.

---

Related: Phase A engineering (mixer reference gain-staging, bed-presence QA) is the committed floor beneath this. Craft ownership: the [Sound Director](../.claude/agents/sound-director.md). Prior art to copy: the Story Bible and the visual `continuity.journey` (storyboard grounding). Evidence base: the 2026-07-24 three-thread sound research.
