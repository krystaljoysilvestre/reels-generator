# Audio reference library — the sound regression suite

**What this is.** A small, curated set of founder-approved music beds — one per register — that define *what "correct" sounds like*. Kendrix's ultimate sound bar is the founder's ear; this preserves that judgment so it doesn't have to be re-summoned from scratch every time a prompt, mood, model, or provider changes.

**How to use it.** After any change that could shift the *character* of generated audio (a `music-prompt.ts` / `music-mood.ts` / `sound-designer.v1` edit, an ElevenLabs model bump, a provider swap), regenerate a bed for each register and compare it to its reference by ear: *does documentary still read measured? does energetic still drive? does horror still land tense?* A reference that no longer matches is either a regression to fix or a new target to re-ratify with the founder — never silently overwritten.

**Origin.** Established 2026-07-24 from the Phase B "register range" ear A/B (the founder's *"love it!"* on hearing each register sound like itself, after the *"leans calm"* verdict on Phase A). These are the winning **NEW** beds from that test; the losing OLD monoculture beds were not kept. Prompt version at capture: **`sound-designer.v1.19`** (register-first default) + the Phase B `music-mood.ts` palette + the *immediate-presence-=-immediate-character* `music-prompt.ts`.

**Nature of the clips.** ~22s **bare beds** (no narration) generated with the production `buildMusicPrompt` from each register's mood preset — so they isolate the bed's *character*, which is what Phase B changed. They are bed-character references, not full-reel references; a future full-reel reference set (with narration + SFX + mix) is a Phase C concern.

**Storage.** Platform-owned QA fixtures (not tenant data), so they live under a global `references/audio/` R2 namespace, not a reel/channel one.

| Register | R2 key | Mood preset (type) | What it demonstrates |
|---|---|---|---|
| Documentary | `references/audio/documentary.m4a` | `measured` (low_drone) | Calm/measured but **present** — dignified, unhurried, never tense |
| Drama | `references/audio/drama.m4a` | `warm` (drone_swell) | Tender, intimate, human — a gentle breathing swell |
| Children's | `references/audio/childrens.m4a` | `wondrous` (drone_swell) | Warm wonder, gentle magic — safe, never dark |
| Energetic | `references/audio/energetic.m4a` | `driving` (drone_swell) | Genuine forward momentum/energy — the "leans calm" cure |
| Horror | `references/audio/horror.m4a` | `slow_dread` (low_drone) | Tense/dark **preserved** — the regression guard |

**Re-ratification.** The set is refreshed whenever the founder's target for a register changes (a new "this is what documentary should sound like"). Overwrite the R2 key, bump the prompt version + date here, and note what moved. Losers are never kept.

**Related.** Phase B plan + rationale: memory `sound-generation-model.md`. The longitudinal, per-channel successor (a channel's *own* sonic identity, not a per-register archetype) is the **Audio Bible** in `hypotheses/audio-direction.md` (Phase C).
