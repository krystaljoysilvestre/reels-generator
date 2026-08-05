# Hero trailer — "Every Story Begins Here"

The 35.8s brand film in the landing hero. **It is not pipeline output** — it is hand-cut from the
same engines the product runs (nano-banana + flux stills, Kling v2.5 motion, ElevenLabs voice/score)
plus screen captures of the real app. The landing page never claims otherwise: the hero figcaption
says "Kendrix Studio", and the real pipeline reel lives in the screening-room section below it.

## ⚠️ The finale contains app UI — it goes stale when the screens change

Beat 10 (the last ~8s) is: a pan across the real storyboard editor → the cursor pressing the real
gradient **Render reel** CTA → the product's real *"Rolling your reel"* progress state → the finished
reel → the loop back to beat 1 → the end card.

**After any app redesign, re-shoot it before the page deploys** — otherwise the hero shows a product
that no longer exists. Re-shooting costs **$0** (no API calls): it only re-captures screenshots and
re-assembles. Beats 1–9 are permanent and never need regenerating.

```bash
# prereqs: web app running (probe the port — it moves), postgres+redis up,
# a session cookie at $SCRATCH/session.jwt, and a reel id to shoot
node shoot-ui-states.mjs      # storyboard / rendering / spot-check states (flips reel status, reverts)
node build-finale.mjs         # the 8 finale shots
node assemble-trailer.mjs     # full cut + audio mix + mux
```

Then re-encode the web variants and copy into `apps/landing/public/hero/`.

## Source assets

Large binaries live in `assets/trailer-src/` (gitignored) — clips, stills, audio, UI captures, masters.
The paid, hard-to-reproduce pieces are the 8 Kling clips (~$2.80) and the stills (~62¢); the reels are
also in R2 and can be re-downloaded by `assets.storageKey`.

## Regeneration costs (2026-08-05)

| piece | cost | notes |
|---|---|---|
| 8 beat stills | $0.50 | flux ×3 (dread/neon/eye), nano ×5 |
| 3 style alternates | $0.12 | founder chose all three: oil painting, anime, watercolor |
| 8 Kling clips | $2.80 | 5s each @ 7¢/s; style-preservation pinned per prompt or Kling photorealizes paintings |
| voice + score + sfx | $0.68 | 10 lines, 36s bed, heartbeat |
| montage + finale + UI | $0 | cut from existing assets and screenshots |

## Craft constraints worth keeping

- **The arc widens every beat** — bedroom → planet → civilization → city → sky → ocean → cosmos →
  a galaxy in a suitcase → all worlds → the tool that holds them.
- **Light drives every transition** (white-flash `xfade=fadewhite`, and each still's dominant light
  source sits center/upper-center, warm core against cool surround).
- **One focal point per beat** — the thumbnail test.
- **The cut is driven by the narration**, not fixed 3s slots; that's why it runs 35.8s, not 30s.
- **Beat 10's dominant action is CREATION** — the render press and progress are the star; the card
  choreography must stay support.
