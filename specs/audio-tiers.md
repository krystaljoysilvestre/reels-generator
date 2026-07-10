# Audio quality as a SaaS tier — spec (2026-07-10)

Status: **spec only, not wired.** No users/orgs/subscriptions tables exist yet (single-operator auth). This
documents the tier→knob matrix and the exact attach points so audio tiering can be turned on with minimal
new code when billing lands. Every lever below already exists in the pipeline (some dormant).

## Why audio is a good tier axis
Audio spend per reel is small and scales smoothly, so it maps cleanly to price tiers without gating the
core product. The dominant cost is video (i2v), which is already the pre-marked headline lever.

## Per-reel audio cost drivers (from code, 2026-07-10)
| Driver | Rate | Where |
|---|---|---|
| TTS (voice) | 30¢ / 1k chars | `elevenlabs/client.ts` `TTS_COST_CENTS_PER_1K_CHARS` |
| Sound-designer LLM | ~1–3¢ | `annotate-audio-script.ts` (LLM pricing in `llm/client.ts`) |
| SFX generation | 0.5¢/s, min 1¢ (~5–15¢/reel) | `elevenlabs/client.ts` `SFX_COST_CENTS_PER_SEC` |
| Foley (new) | vision ~1–3¢ + SFX 1–4¢ per **video** scene | `foley-spot.ts` |
| AI music bed | 10¢ flat | `elevenlabs/client.ts` `MUSIC_COST_CENTS_FLAT` |
| Mix + stems | free (local ffmpeg) | `mix-audio-step.ts` |
| i2v video (context) | 7¢/s → 35–70¢/clip | `fal/config.ts` `FAL_VIDEO_COST_CENTS_PER_SEC` (the real cost driver) |

## Tier → knob matrix (draft)
| Lever | Basic | Pro | Studio |
|---|---|---|---|
| Music (`AudioPacks.musicMode`) | `preset` pool | `ai` per-reel bed | `ai` + regen steers |
| Smart SFX (`AudioPacks.sfxEnabled`) | off (ambient only) | on (designer + sustained loops) | on |
| Foley sync (new) | — | — | on (requires ≥1 video scene) |
| Motion budget (`MOTION_BUDGET`) | 0 video scenes | 1 | 3 |
| Stems / advanced mixer (new) | — | download stems (`/api/pipeline/stems`) | in-app layer sliders |
| Per-reel budget cap (`ctx.budgetCap`) | low | default 800¢ | high |
| Voice | standard voices | full catalog | full + delivery presets |

## Attach points (where a plan check goes when SaaS lands)
1. **Motion budget** — `packages/core/src/assembly/scene-qa.ts` `MOTION_BUDGET` (const) feeds
   `breakdown-scenes.ts` `maxVideoTiers`. Replace the constant with a plan-resolved value. Comment already
   marks this as "the subscription lever." Controls whether `animate_scenes` (and thus foley) runs at all.
2. **Render trigger** — `apps/web/src/app/api/pipeline/trigger-render/route.ts` (single choke point before
   the chain enqueues). Natural home for "reels remaining this month / plan allows AI music / plan allows
   video" checks.
3. **Budget cap** — `apps/worker/src/pipeline/harness.ts` `ctx.budgetCap ?? DEFAULT_BUDGET_CAPS_CENTS.short`.
   Pass a plan-derived cap.
4. **Channel creation** — `apps/web/src/app/api/channel/create/route.ts` (max channels / allowed audio modes).
5. **Audio knobs enforcement:**
   - `sfxEnabled` — **stored but currently NOT enforced** in `generate-sfx.ts`/`mix-audio-step.ts`; a free
     tier that forces it off needs it wired in (one `if` in generate_sfx).
   - `musicMode` — read in `annotate-audio-script.ts`, `generate-music.ts` (`!== 'ai' → return`),
     `mix-audio-step.ts`. Restrict `ai` to paid tiers; force `preset`/`none` on free.
   - Foley — gate `spotFoleyForReel` on plan (Studio-only) inside `animate-scenes.ts`.

## Schema work needed for real tiering (later)
- `users` + `organizations` tables; `channels.ownerId` FK (everything hangs off `channels`, so this
  cascades to all reels/assets).
- `subscriptions`/`plans` (or Stripe mirror) with an entitlements blob resolved into the levers above.
- Spend queries already possible today: `SUM(reels.cost_cents) GROUP BY channel_id` filtered on
  `createdAt`; per-audio-kind via `assets.cost_cents WHERE kind IN (voiceover,sfx,music,stem,ambient)`.

## Cost economics per tier (rough, per 30s reel)
- **Basic**: TTS ~15¢ + preset music 0 + no SFX = **~15¢**.
- **Pro**: TTS ~15¢ + designer ~2¢ + SFX ~10¢ + AI music 10¢ + 1 video clip ~35¢ = **~72¢**.
- **Studio**: Pro + 3 video clips (~105¢ total video) + foley ~3×4¢ = **~135–160¢**.
Audio is a minor slice; video dominates — so tier pricing should track motion budget, with audio quality
as the perceived-premium differentiator.
