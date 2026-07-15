---
name: unbiased-design
description: Keep LLM prompts and creative pipeline heuristics UNBIASED — genre-agnostic AND language-agnostic — let the model's judgment decide what fits each story, moment, and language, instead of hardcoding forced quotas, single-texture genre defaults, or one language's conventions as the default. Use when writing or reviewing any prompt, creative heuristic, or genre/language-conditional logic (sound design, music, scenes, effects, voice, motion, captions, prose, etc.).
---

# Design for judgment, not bias

This product's quality comes from the model making *taste* decisions per story. Every time we hardcode "for horror, always X" or "put N of these on every Y", we flatten that taste into a template — and it shows (forced jumpscares, a heartbeat on every reel, the same sting every time). The job of a prompt or heuristic is to give the model **context + hard constraints**, then get out of the way.

## The one distinction that matters: Constraint vs Choice

Before writing a rule, ask which kind it is:

- **Hard constraint** — correctness or safety. Objectively required, same for every story. *Encode it firmly.*
  Examples: anchors must be verbatim/unique substrings; JSON schema shape; no vocal sounds in the SFX layer; alignment length must stay 1:1; a voice must exist before render.
- **Creative choice** — taste. Depends on the story/moment. *Leave it to the model's judgment.*
  Examples: whether a scare gets a sting or lands in silence; the music's character; how many SFX; whether this reel wants a voice; what the cold-open feels like.

Firm up constraints. Never harden a choice into a rule.

## Anti-patterns (real ones from this codebase)

| Biased / forced ❌ | Judgment-based ✅ |
|---|---|
| "HERO SCENES = JUMPSCARES. Place a sting on EACH hero scene. Do not leave a hero scene without a hit." | "Hero scenes are your strongest *candidates* for a hit — but only when the moment earns it; a scare in silence often hits harder. Don't force one on every beat." |
| `if genre === 'horror'` → inject "a slow heartbeat under a low drone" into the music prompt | Pass genre as *context*; let the model choose the bed's character (drone, pulse, sparse tones, or none). Don't default to one texture. |
| "ALWAYS punctuate the peak with a riser→hit." | "A sting *can* detonate a moment; silence *can* be the loudest choice. Use what the moment earns." |
| "Generate 4–7 SFX." (a quota) | "Use only what the story needs — any layer may be empty. When in doubt, leave it out." |
| Register/voice guidance only for one language (e.g. a Taglish block, `''` for everything else) | Universal "sound like a real person saying this out loud in *this* language" for ANY language; language-specific nuance added per language as a documented block, never one baked as the default. |

## Rules of thumb

1. **No forced quotas.** Not "N per reel", not "one on every hero/twist/scene". Counts emerge from the story. Caps (`max`) are fine — they're a constraint (ceiling), not a mandate (floor).
2. **No single-texture genre defaults.** Don't bake one creative answer per genre (the heartbeat, the red glitch, the one sting). If genre should *inform* output, pass it as context and let the model decide — or make it an **operator/channel-configurable** lean, never a hardcoded creative straitjacket.
3. **Any layer may be empty.** Silence, no music, no voice, no effect — all valid outputs. Say so explicitly, or the model over-produces to fill the schema.
4. **Frame as judgment, not command.** Prefer "candidate / if it fits / you choose / when it earns it / any of these may be empty" over "ALWAYS / EACH / must / place N".
5. **Give context, not conclusions.** Tell the model *what the moment is* (hero beat, mood, location, the story's pivot) and let it decide the response — don't pre-decide the response for it.

## Language: agnostic by default, not one language baked in

The pipeline must not assume a language. Register/voice guidance should be **universal** — "write it the way a real person actually says this OUT LOUD in *this* language; never translate word-for-word from another language" applies to every language, and every language deserves that guidance (don't hand one language a rich block and everything else an empty string). The channel's language enters as **context**, never a hardcoded default. Same for audience: don't bake a nationality/culture ("young Filipino adult") into a shared prompt — derive it from the channel/language.

Mixed-code-switching languages (today only **Taglish**) legitimately get extra, language-specific nuance — but as a **documented per-language addendum layered on the universal guidance**, exactly like the per-genre tuning exception below: it's an owner-set default for a real, known audience, it can be overridden, and adding another mixed language means adding another block, not rewriting the default. And even there, never *force* the mix — "let it fall where it naturally falls" is judgment, not a quota.

## The legitimate exception — deterministic, owner-set tuning

Some genre-specific defaults are **not** creative bias — they're calibrated, owner-approved baselines the model shouldn't improvise (e.g. the per-genre voice-delivery envelope, horror-gated dramatic pauses). These are fine because they're: (a) deterministic numeric tuning, not a creative "what sound", (b) an operator-facing default that can be overridden, and (c) explicitly decided with the owner. If you're adding one, confirm it's tuning — not a creative choice you're quietly making for the model — and document it.

## Before shipping a prompt or heuristic — checklist

- [ ] Every rule is a **constraint** (correctness/safety), not a **choice** (taste). Choices are left to the model.
- [ ] No **quota** forcing a minimum count of anything.
- [ ] No **single-texture genre default** hardcoded as the only fit.
- [ ] The model is told **empty/none/silence is a valid answer.**
- [ ] Language is **judgment-framed** ("if it fits", "you choose"), not imperative ("always", "each", "must").
- [ ] Genre/mood is passed as **context to reason from**, not a pre-baked conclusion.
- [ ] Any genre-specific default is deliberate, owner-set **tuning** (see exception above), and documented.
- [ ] **Language is not assumed**: register guidance works for any language, no nationality/culture baked into a shared prompt, and any mixed-language nuance is a documented per-language addendum on top of universal guidance.

When reviewing existing code, scan prompts/heuristics for `ALWAYS`, `EACH`, `must`, `if genre ===`, `=== 'taglish'`, hardcoded audience/culture literals, fixed counts, and per-genre/per-language creative literals — each is a candidate to convert from rule to judgment.
