# Hypothesis: Real Places — depictive fidelity for the factual genre

Status: **IMPLEMENTED in the working tree (uncommitted), pending owner live review — 2026-07-20.** Owner directed "build them now" and chose the FULL build, which **crosses the "factual is a committed product" gate** this doc waited behind — recorded as an explicit owner decision. Graduates to `/specs` once reviewed + committed. (Original status: hypothesis, Phase-0-gated — retained below as the design record.) · Owner: PM · Eng: senior

> **BUILD SUMMARY (working tree, `pnpm typecheck` + `lint` green, 0 errors; not committed — review-live-first):**
> - **Reference-anchor control** — regen-image route accepts `anchor` (current-first / reference-first / reference-only) so an attached reference can nudge → dominate → replace (fixes the "attachment is the weakest anchor" finding).
> - **AI-grounded feedback** — new `POST /api/pipeline/regen-options` (vision → grounded options via `grounded-feedback.v1`, Haiku, cost-accounted) + a storyboard dialog shown **only when a reference is attached** (opt-in; never on a plain regenerate or the auto pipeline). Each option sets `anchor`+`directive`. Verified: grounded options on real images.
> - **Real places (full)** — `sourcePlaceImage` (Wikimedia, **disambiguated-article-resolution first**, licence-clean, free) + `place-source.v1` (name-keyed "sourceable?" decider that skips generic settings + a confidence-verify filter) wired into `generate-images` for `genreCategory==='informational'` location entities (real photo → plate → normal reference-conditioning); `referenceOrigin` provenance on the bible entity; `formatImageCredits` appended to the published description at all three consume sites (YouTube publish, auto-gate, export zip). Verified end-to-end: **Paoay Church** → real CC0 photo (confidence 0.95); **"a bedroom"** → skipped → generated plate.
> - **Same-name collision handling** — sourcing resolves through the DISAMBIGUATED Wikipedia article (distinct articles per instance), so a place maps to its specific instance ("San Agustin Church" → "(Manila)"). A name that resolves to a **disambiguation page** (St. Mary's Church, Trinity Church — genuine collisions) **fails soft → generated plate**, never a confident-wrong guess. Verified. Residual: a name with one *dominant* Wikipedia instance resolves to it (mitigated by the decider's region-qualified query); FoP still a human/legal check before public publish (noted in code).

---


> The Evidence Bible asks *is this statement true?* This asks a different question no layer owns today: *does what the viewer sees actually depict the real thing?* Call it **depictive fidelity**. Its first mechanism: feed real sourced photographs of real *places* into the reference-conditioning path we already run — automatically, no human in the loop. It is the visual sibling of the [Evidence Bible](evidence-bible.md), and it waits behind the same bar (factual must be a committed product). People are out of scope — see Non-goals.

## Why now — a missing responsibility, not a feature

The factual genre invents its locations exactly as horror does — the pipeline has no notion that a documentary's places are *real things that already have a true appearance*. This is the visual analogue of the failure class the [Evidence Bible](evidence-bible.md) exists for: the 2026-07-18 probe shipped a debunked myth, gate-approved (see [factual-genre-baseline]). Every layer we have is blind to whether the *depiction* is real for the same reason every layer was blind to whether the *facts* were — no layer was ever given the responsibility. The Story Bible owns visual *continuity* (the same invented place across shots); it does not own visual *truth*. That is the gap.

The claim that "depictive fidelity" is a first-class responsibility is **kept explicitly under test** — the same discipline applied to the Narrative Grammar's "layer" framing. What is asserted is narrower and concrete: *for real places, no layer today can tell whether the render is the real place, and that absence degrades the factual product.*

## The insight — a new *source*, not a new *system*

The reference-conditioning pipeline already exists and (per the code) already runs. Every Story Bible entity carries a `referenceImageKey` slot ([story-bible.ts:26](../packages/core/src/types/story-bible.ts#L26)) that today is filled by a *generated* plate. For a `kind: 'location'` entity, this fills the same slot with a **real sourced photograph** instead. Everything downstream is unchanged:

- The lazy-mint loop **already skips any entity that already has a `referenceImageKey`** ([generate-images.ts:148](../apps/worker/src/pipeline/steps/generate-images.ts#L148)) — a pre-filled real photo means "do not invent this place," for free.
- The fal edit endpoint **preserves the subject's identity** while the scene prompt drives angle/light/time ([fal/config.ts:28-31](../packages/providers/src/fal/config.ts#L28-L31)) — the mechanism we want for one real place across several shots.
- The analyzer emits an English `locationLabel` per journey leg, tied to a `locationEntityId` ([story-bible.ts:42-46](../packages/core/src/types/story-bible.ts#L42-L46)) — the join back to the entity whose slot we fill. (Its *specificity* is a real problem — see Geographic specificity below.)

So the build is: (1) turn a place into a real image, (2) filter obvious wrong ones, (3) drop the key in the slot, (4) carry its provenance. Nothing in the render path changes.

## The boundary — depiction vs. fact, place vs. person

- **Depiction vs. fact.** This owns only what is *shown*. Whether the underlying claim is true is the Evidence Bible's. Where they touch — *what did this place look like in 1972?* — the fact is the Evidence Bible's; the *image-matches-the-described-place* check is here.
- **Place vs. person.** People are a categorically different product (likeness, publicity, privacy, face verification). This responsibility is scoped to places precisely to stay clean. **Probed 2026-07-20 (`spike-historical-figure.ts`, $0.28):** conditioning carries a real *face* at least as well as a place — arguably better (faces are its strongest case), confirmed on José Rizal + Abraham Lincoln from public-domain portraits, holding across studio / writing-desk / plaza / seated contexts. This **reaffirms, not relaxes, the boundary** — the three-tier stance stands: **OFF** for living/private people (never automatic — likeness/consent/defamation/misinformation); **CARE** for long-dead public-domain figures (rights concerns fall away, but must be framed as reenactment, never presented as a real photograph); **DEFAULT** = representative stand-ins for ordinary people + real archival footage where it exists. The identity-preserved-but-fine-detail-invented caveat matters *more* for faces.

## Fail-soft is the load-bearing property

Purely additive. At every step — no search result, low confidence, no clean license — it **degrades to today's invented location**, never to a failure and never to something worse than baseline ("a missing plate degrades the scene to text-only — never a failure"). The worst case is *"no better than today,"* not *"confidently wrong."* This is what makes even a partial build safe to ship.

## Non-goals — what this must never own

- **People / likenesses.** Separate, policy-gated. Default stays representative stand-ins.
- **Not a human review gate.** No re-introduction of the removed cast/places review. The attach is automatic.
- **Not general web image search.** License-clean, curated sources only. Open-web scraping is out.
- **Not a proof of correctness.** The confidence step *filters* obvious mistakes; it does not certify the place is right (see Phase 2).
- **Not factual *text* truth.** Evidence Bible's.

## The one condition this all rests on

> **Nothing beyond the throwaway Phase 0 spike is built until the spike shows that a real place's identity survives across multiple generated shots.** If it doesn't, the entire proposal retires — the later phases are engineering atop an assumption that failed.

## The plan — a spike gates everything

### Phase 0 — Conditioning spike (throwaway, pre-review)

The one unproven bet: **does reference-conditioning hold for a *place*?** Proven for a character face — but a viewer *forgives* a face that varies and *cannot forgive* a landmark that morphs. Buildings tolerate far less variation than faces; the illusion dies the instant a known place becomes "a place like it." So the bar is deliberately hard:

1. **Blind identification** — a person who knows the landmark identifies it correctly *without being told what it is*. Not "recognizably a place" — recognizably *this* place.
2. **Multi-shot persistence** — identity holds across ≥2 shots that demand angles the source photo doesn't show (exterior → interior/detail). This is the graduation condition.
3. **One-vs-many references** — test a single photo against several (different angles/times) to learn whether multiple references *strengthen* identity or *blend* it. Do not assume many wins.

**Gate:** fail (1) or (2) → the feature dies here; document why in `retired/` and revert to invented locations. Cost ≈ $0.

**RESULT — PASS (2026-07-20, spend $0.36).** Ran on two deliberately under-memorized Filipino sites (Paoay Church, Fort Santiago) via `apps/worker/scripts/spike-real-place.ts` (throwaway). Both cleared the hard bar: (1) **blind-ID** — the conditioned render is unmistakably the real site, while the *control* (same generic, name-free prompt, no reference) invented a generic and wrong place (Paoay → a Latin-American mission; Fort Santiago → a Caribbean-Spanish gate); (2) **multi-shot persistence** — identity held across a new aerial, a low angle, golden hour, a facade close-up, and dusk. (3) **one-vs-many** not yet needed — a *single* reference sufficed. **Caveat that shapes Phase 2:** the model preserves *identity* but *embellishes fine detail* (invented carvings/heraldry) — confirming the confidence step must be a **filter**, never a truth claim. The conditioning bet is validated; the remaining gates (factual committed, sourcing/licensing/era) are untouched.

**Multi-entity CONTINUITY also PASSES (2026-07-20, `spike-continuity.ts`, $0.12).** The real production case: a character *and* a place held *together*, consistent across a scene sequence. Conditioned on TWO plates simultaneously (Rizal portrait + Fort Santiago gate — historically real: Rizal was jailed there) across a 3-beat sequence, both identities persisted shot-to-shot — the Story Bible continuity promise, working on real references. New caveat: a **black-and-white** plate produces a grayscale-head-on-colour-body seam (one beat) — specific to archival-photo plates; production character plates are colour-generated, and archival figures should be **colourised first**. Identity held; it's a tone artifact, not an identity failure.

**Deeper finding — REIMAGINE vs PASTE, and the person/place mechanism fork (2026-07-20, `spike-pulid.ts`, fal-ai/flux-pulid).** The pasted-on look was not a colour bug — it's the *operation*: the `/edit` endpoint **composites** the source pixels (right for a PLACE — we want the real building copied; wrong for a PERSON). The fix is a different mechanism — an **identity model** (PuLID) that extracts *who the face is* and **re-synthesises** the person fresh, lit by the scene. Confirmed: PuLID renders of Rizal are fully integrated (no cutout), `id_weight` tunes likeness↔naturalness, and the likeness becomes "reimagined" (recognisable, not forensic — the desired trade). **But this exposes an architectural fork:** PuLID conditions on the *face only* and **invents the background**, so it does NOT preserve a specific real place. → **Real place wants edit/copy; real person wants identity/reimagine — opposite mechanisms.** "Real person standing in the real place" in one frame needs *both* a subject-identity ref and a scene/structure ref simultaneously = **separate, unsolved problem** (candidate paths: identity-model + structural/scene conditioning, or two-stage inpainting). For an ordinary reel character with no real-world counterpart there's no conflict — the identity model is simply the right default over `/edit` for people.

**Pose finding (2026-07-20, `spike-pose.ts`).** Single-reference identity is essentially a *frontal* identity → the head stays camera-facing at the reference angle across shots (owner-spotted). fal has **no clean InstantID/pose-reference (ControlNet) endpoint** (`ip-adapter-face-id` = no pose; `instant-character` = pose via prompt only). Head-to-head on explicit pose prompts (profile / head-bowed-looking-down / turned-away): **PuLID is frontal-locked and ignores them; `fal-ai/instant-character` (also FLUX) FOLLOWS them** — true profile, bowed over the writing, seen from behind. So pose control is achievable via prompt, just not on PuLID. **Model↔shot trade:** PuLID = tightest frontal likeness, no re-pose; InstantCharacter = free re-pose, slightly looser likeness. True keypoint pose control (a pose *reference*) would need a custom ControlNet workflow on fal — deferred, not needed for prompt-level pose variety.

**Live regen-with-attached-reference behaviour (2026-07-20, `spike-regen-reference.ts`) — corrected a too-clean prediction.** Ran the SHIPPING regenerate mechanism (Gemini `/edit` on `[current image, operator attachment]`, per regen-image/route.ts:118-128). Finding: (a) the attachment **competes with the current image** and its influence **scales with how pointed the instruction is** — a neutral prompt + strong current image → the attachment barely shows (a real Paoay photo failed to displace a generic-church current image); a pointed "match this" prompt → it takes hold. (b) **Faces do NOT universally paste** — a frontal, tonally-uniform portrait integrated a real face cleanly (no cutout); the ugly paste is a *hard-case* artifact (colour scene + off-angle + mismatched source tone), not a property of faces. So the "place shines / face pastes" table was an oversimplification. Practical: attach-reference is a **nudge/"match this look" tool** (works today, great for wardrobe/tone/place-detail); to make a reference *dominate* (become that place/person) you drop the competing current image ("fresh" re-roll, reference as anchor).

**Refined with a controlled gradient (2026-07-20, `spike-regen-directed.ts`) — and a concrete product fix.** Reference influence is a gradient set by two knobs: (1) **neutral prompt + current-first** → reference *ignored* (result = the current scene, the "nothing changed" the owner spotted); (2) **directive prompt + current-first** → *partial blend* (real Paoay's red roof + buttresses creep in); (3) **directive + reference-first** → reference *dominates* (clearly Paoay); (4) **fresh, reference-only** → *full* takeover (the real church). **ACTIONABLE:** the shipping route adds an operator attachment **last** in the ref list (`[...baseRefs, referenceKey]`, regen-image/route.ts:121) and defaults to "vary" (current image first) → the attachment is the **weakest anchor**, which is *why it can look inert*. Fix when this is built for real: route a 📎 attachment as a **primary/fresh anchor** (or weight it up), not at the tail.

**Candidate feature — AI-grounded feedback (owner idea 2026-07-20, validated `spike-grounded-feedback.ts`).** Rather than making the operator author the right prompt/knobs, the editor shows a **Claude-Code-style confirmation**: a vision step reads the current image + the attachment and offers 2–4 **grounded** options (+ always an "Other" free-text). Each option is wired to the render knobs (`intent`/`anchor`/`directive`) so picking one sets anchor-order/mode/prompt *for* the operator. **Validated:** on our real example (generic church + Paoay reference) both Haiku (**1¢**) and Sonnet (**2¢**) produced specific, image-aware options — Sonnet even caught the *attached-vs-freestanding bell tower* difference and made it an option. It also **closes the blind-rewrite gap**: the feedback vision step *sees* the photo and writes its features into the `directive` (which the current prompt-rewriter can't). **Constraints:** opt-in, operator-initiated, only *when applicable* (attachment present / low-confidence result) — NOT a mandatory pipeline gate (respects the removed cast/places review + straight-through auto path). Generalisation ("AI-grounded options + Other" as a studio-wide primitive) is a *maybe* — earn it on this concrete case first (anti-abstraction). Mock: claude.ai/code/artifact/aeba3d2c.

### Phase 1 — Auto-source (Wikimedia Commons first)

Hierarchical location key (see below) → Commons search → best candidate(s) → download → set `entity.referenceImageKey`. Where several good angles exist, source multiple and pass them as multiple reference keys (the edit endpoint takes several; Flux up to 9) — **default when available**, subject to the one-vs-many finding from Phase 0. No clean result → invented location.

Provenance is captured into a **new structured `referenceOrigin`** field, future-proofed past a single provider:

```
referenceOrigin { type: 'generated' | 'sourced', provider, url, license, attribution }
```

so Library of Congress · Europeana · NASA · National Archives · USGS · museum collections slot in later with no migration.

**Geographic specificity.** `locationLabel: "Manila"` is uselessly coarse — Commons returns skyline, Intramuros, Binondo, Rizal Park, a random street, and the search has no way to choose. Reliable sourcing needs a *hierarchy*: `Fort Santiago → historic fort → Intramuros → Manila → Philippines`. This likely requires the analyzer to emit richer location entities than today's flat label — a real, tracked dependency, not a detail.

### Phase 2 — Confidence *filter* (not a verifier)

Reuse the vision-QA seam ([generate-images.ts:348](../apps/worker/src/pipeline/steps/generate-images.ts#L348), Claude Haiku vision): *does this image plausibly depict the described place?* Below threshold → discard, fall back to invented. Framed honestly as a **filter**: it removes obvious misses (a beach for a cathedral), it **does not prove correctness** — vision models are weak at wrong-but-similar (wrong cathedral, wrong bridge, wrong entrance, wrong historical version). It buys us "not obviously wrong," which combined with fail-soft is enough to be safe, not enough to claim truth.

### Phase 3 — Provenance display

Surface `referenceOrigin` attribution (reel credits / description via the existing `generate_post_meta` step). **Mandatory before public publishing** — CC-BY requires attribution, CC-BY-SA adds share-alike. Shipping sourced imagery publicly without it is a license violation at machine scale.

## Risks (accepted, with mitigations)

| Risk | Severity | Mitigation |
|---|---|---|
| ~~**Identity persistence**~~ **RETIRED as a risk — validated 2026-07-20** (Phase 0 PASS: held across shots on two sites) | — | Phase 0 spike passed |
| Sourcing the *wrong* place (name collision, generic place) | High for obscure local settings | Hierarchical key + Phase 2 filter + fail-soft |
| Licensing liability moves operator → product | High | Commons-only + `referenceOrigin` capture + Phase 3 attribution as hard scope |
| **PH freedom-of-panorama** — photos of modern Filipino buildings/monuments can be encumbered *even on Commons* | High, content-specific | Legal review before relying on Commons for Filipino modern structures; prefer PD/old imagery |
| Coverage thin for obscure/abandoned local places | Medium | Fail-soft; measure hit-rate in Phase 1 |

## Known limitations (won't be solved soon)

- **Era / temporal mismatch.** A place is correct but the photo is modern — a 2024 skyline, LED signage, a renovated façade — for a 1972 story. The *place* is right, the *period* is wrong. No cheap fix; fail-soft when the Evidence Bible flags a period the source can't satisfy.
- **Wrong-but-similar landmark.** Per Phase 2, the filter can't discriminate these. Accepted.
- **Anonymous places don't benefit.** A generic apartment, a village road, a neighborhood store gains nothing from a real reference (and may lose). This bounds where the feature is worth invoking at all — see the impact objection.

## Dependencies / open questions

- ~~**Which image engine is live.**~~ **RESOLVED 2026-07-20.** Gemini/fal is live for all genres and the reference-conditioning `/edit` path is already firing (code: `imageEngineForGenre` returns `GEMINI` unconditionally, [fal/config.ts:85](../packages/providers/src/fal/config.ts#L85); DB: every image asset is `provider=fal`, recent renders all `gemini-25-flash-image/edit` with 1–2 refs). The gpt-image-1 comments/memory were stale. **No engine-routing code is needed for Phase 0** — the substrate is in place; the spike runs on the existing pipeline.
- **Analyzer location richness.** Hierarchical location entities (above) may be a prerequisite for usable search — needs its own design.
- **Factual style preset must be photoreal** — a stylized preset fights the real reference.
- **Evidence Bible boundary** — period-correctness is the Evidence Bible's fact, read here.

## Strongest known objections

**1. Three unsolved problems on an uncommitted product.** *"You're stacking conditioning, licensing, and verification on a genre that isn't even a committed product — the same reason the Evidence Bible can't graduate."* — Honest answer: it doesn't graduate until (a) Phase 0 proves conditioning and (b) factual is committed. Writing it now is cheap because the mechanism is one new source into an existing slot and fail-soft; the cost is a spike and a doc, not a build.

**2. Does a documentary actually get *better*?** The sharper objection. If the generator already renders a convincing city street, a real reference changes *nothing a viewer notices*. The benefit is real and large for **known** places (Titanic, Chernobyl, Notre-Dame, Fort Santiago) and ~zero for **anonymous** ones (an apartment, a village road). So coverage is the wrong success metric — **impact** is: *what fraction of factual scenes depict a place a viewer would recognize, and would notice getting wrong?* If that fraction is small, the feature is a landmark-only nicety, not a genre capability, and should be scoped (or shelved) accordingly. This measurement is itself a Phase 1 deliverable.

## Falsifiability

- ~~**Phase 0 fails** (no blind-ID, or collapses across shots) → retire.~~ **Did not fail — PASS 2026-07-20** (see Phase 0 RESULT). Conditioning is validated.
- **Impact low** (few factual scenes feature recognizable places) → not a genre capability; scope to landmark stories or shelve.
- **Coverage thin** (Phase 1 hit-rate low on real story places) → landmark-only; reconsider.
- **Filter can't discriminate** wrong places at a usable threshold → safe auto-source isn't buildable yet; hold.
