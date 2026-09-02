# Depictive Fidelity — does what the viewer sees actually depict the real thing?

Status: **CURRENT ARCHITECTURE — graduated from `hypotheses/real-places.md` 2026-08-12.** The responsibility is no longer place-shaped: it now covers every class of real subject a factual story depicts — places, objects, animals, and real people. The original Phase-0-gated hypothesis is retained below as the design record, because its spike findings are still the reason the mechanisms are what they are. · Owner: PM · Eng: senior

---

## The shape of it (2026-08-12)

One question, three answers, because **historical reconstruction and contemporary archival depiction carry different truth obligations**. This is why "real person support" is deliberately not one code path.

| Depiction mode | The model | The real image | Governed by |
|---|---|---|---|
| `generated` | creates the depiction | none | the ordinary pipeline |
| `reference_plate` | generates the frame | conditions it, never presented as authentic event imagery | the real-places CARE tier + reconstruction framing |
| `archival_only` | is not involved | presented directly, never enters generation | the floor's licensed-archival carve-out |
| `identity_withheld` | carries the beat by representative staging | none exists — and none is invented | the floor's no-fabricated-likeness rule |

The fourth mode is not a rounding of the third. A real person whose identity we **cannot verify** must get neither a sourced photograph (we don't know who they are) nor a generated one (inventing a face for a named real person is the fabrication this module exists to prevent). Routing that case to `generated` looked harmless and was not — it minted an invented committed likeness of Marcel Duchamp on the 2026-08-12 verification reel.

**Pipeline:** subject classification → verified identity → verified eligibility → depiction mode → scene depiction requirements → fulfilment → provenance → disclosure.

Routing is resolved **once** per entity (`entity.depiction`, `types/depiction.ts`) and every downstream gate reads that value. Nothing re-derives a mode from `kind`, and nothing re-checks whether a person is alive.

### Subject class, not entity kind

The Story Bible's `kind` only distinguishes `character | location | object`, which cannot tell a Philippine eagle from a person, or the Titanic from a cracked mirror. `entity-source.v1` classifies the SUBJECT (`place | object | animal | human | fictional | generic`), and only `human` reaches the liveness gate. That is what makes animals work with no new entity kind — an animal tagged as a `character` would otherwise be asked for a death date.

`generic` is the impact≠coverage guard, now applied to every kind: an anonymous object gains nothing from a real reference and may lose.

### Four invariants, enforced in code

1. **`archival_only` never enters reference assembly** — `conditionableReferenceKeys()`, plus an entity-level exclusion from minting so no *generated* stand-in likeness is created either.
2. **`archival_only` is never named in a generated prompt.** Invariant 1 stops conditioning leakage; this stops *textual* likeness generation — the half that actually failed on 2026-07-24, with no sourced reference involved. Three layers: an LLM restates the beat as representative staging (the positive replacement the floor requires), a deterministic scrub over the assembled prompt is the guarantee, and a rewrite that still names the subject is discarded entirely rather than partly trusted. Such scenes then reach image QA unconditionally.
3. **A presented archival photograph is never generatively modified.** Framing and pan are editorial; colourisation and `/edit` are not. A *plate* may be colourised precisely because it is a conditioning input — so provenance carries `usage`, `sourceAssetKey`, `conditioningAssetKey` and `conditioningTransform`, making the distinction auditable rather than merely asserted.
4. **Human depiction requires two separate structural verifications — identity, then eligibility.** They fail to *different* outcomes:

| Identity (single non-disambiguation article + Wikidata item) | `P570` | Mode | Sourcing |
|---|---|---|---|
| verified | ≥ `HUMAN_PLATE_MIN_YEARS_DEAD` | `reference_plate` | conditioning plate, reconstruction-framed |
| verified | living / recent / absent / malformed | `archival_only` | archival shot allowed — identity is anchored |
| **not** verified | *not reached* | `generated` | **never sourced** — representative staging only |

The third row is the subtle one. `archival_only` is the *stronger* claim — "this person may be presented from a real photograph" — so it must never be reachable by an identity we could not establish. Concretely, `sourceEntityImage()` takes `requireArticleIdentity: true` for humans, which disables the free-text Commons fallback: that fallback matches a name *string* with no identity anchor, and the vision verify is documented as weak at wrong-but-similar — which for a face is the entire failure mode.

`HUMAN_PLATE_MIN_YEARS_DEAD = 100` is a **product safety boundary, not a copyright calculation**. Copyright duration and likeness ethics are different axes, and the photograph's own term is unrelated to the subject's death; the Commons licence allowlist is the copyright mechanism. Comparison is by calendar year, because `P570` is frequently year-precision only and false precision on a safety gate is worse than none.

### Multi-subject conflict policy (v1)

| archival subjects in a scene | behaviour |
|---|---|
| 0 | generated normally |
| 1 | archival-shot candidate; any sourcing failure → sanitized generated fallback |
| 2+ | representative staging, logged |

Per-subject lead-image sourcing cannot yield a photograph containing two specific people, and compositing them is forbidden by invariant 3 — a composite of two real people is a fabricated record. Multi-person event sourcing is out of scope; the row exists so nobody reaches for compositing later.

### Planning-time fallback for restricted real people (2026-09-02)

The hosted Phase 0 acceptance reel exposed a deadlock before image spend: Apollo 12 scenes tagged John Aaron
and Alan Bean as `archival_only`, then the depiction doctor was required to preserve those primary tags while
the truth critic demanded source pixels that had not been sourced yet. Three paid breakdown attempts could
neither fabricate the people nor remove them, so the storyboard failed correctly but unrecoverably.

The contract is now explicit: `archival_only` and `identity_withheld` are not mandatory shot subjects. When a
verified source can truthfully carry the visible claim, `archival_only` may be fulfilled by genuine archival
media. When the beat is an unrecorded decision, realization, recommendation, dialogue, or action, the director
and doctor must remove the restricted person from the generated frame and carry the claim through a supported
object, mechanism, document, effect, or anonymous representative/conceptual staging. The truth critic may
require `source` only when an exact `sourceAssetKey` is actually supplied; depiction mode alone is never proof
that source pixels exist. This preserves the ethics floor while restoring its intended fail-soft behavior.

### Disclosure follows the media, not the config

`computeMediaDisclosure()` derives the burned label from what the reel actually contains, because a fixed `'Illustrated · …'` string would call a genuine archival photograph an illustration:

```
Illustrated · based on documented sources
Illustration + archival photographs · based on documented sources
Archival photographs · based on documented sources
```

Relatedly, the EBN illustrative-style guardrail is scoped to *generated* scenes. It exists so no **synthetic** image can be mistaken for authentic documentation; a real photograph is authentic documentation, and measuring it against a rule written for synthesis is a category error.

### What live verification changed (Crossroads reel, 2026-08-12)

Five defects that only a real reel could surface. Each is now a named rule with a regression test.

1. **The licence guarantee was resting on a regex miss.** Duchamp's article lead image is Man Ray's 1920-21 portrait served from `/wikipedia/en/` — a LOCAL en-wiki upload, which on English Wikipedia means non-free/fair-use. The old URL pattern happened not to match the bare `en` segment, so it was rejected by accident and reported as "no Wikipedia article". Now an explicit **Commons-only** rule (`isLocalNonFreeUpload`): `/wikipedia/commons/` is freely licensed by policy, `/wikipedia/<projectcode>/` is not. Anyone "fixing" the old pattern would have started pulling fair-use media into published video.

2. **The identity anchor didn't check it anchored a PERSON.** The decider's query is LLM-written and free-text search returns whatever ranks first: `"Marcel Duchamp French artist"` resolved to the article for *Fountain*, his readymade. Nothing stopped the pipeline reading `P570` off an artwork. It failed safe here (no death date → ineligible), but the mirror case does not: a living person mis-resolved onto a dead namesake would pass the historical gate and mint a plate of the wrong human. Identity now requires `P31` (instance of) to include `Q5` (human) — `wikidataPersonFacts`.

3. **Asking Commons for 1600px served the ORIGINAL.** MediaWiki never upscales, so `iiurlwidth` ≥ the file's own width returns the full-resolution scan. On the 1416px-wide Stieglitz photograph that meant a 2.19MB original, which the vision verifier rejected outright (`400 Could not process image`); at 1024px the same file verifies fine at 0.33MB. `SOURCE_IMAGE_WIDTH = 1024` keeps us on the thumbnail path.

4. **Presence is not subject-hood.** Two scenes *about the urinal* listed Duchamp as merely supporting, and the "exactly one archival subject → fulfil with their photograph" rule would have replaced both with a portrait of him. `archivalShotTarget` now also requires the archival subject to be the scene's PRIMARY one. Detection still scans the whole entity set; only fulfilment narrowed.

5. **Vision QA was grading withheld scenes against the original brief.** It failed a scene twice for *"Marcel Duchamp is not present in the frame"* — punishing the render for obeying the floor, and burning a paid re-roll each time. QA now grades the sanitized staging brief.

**And the naming lesson, which is upstream of all of it.** A real subject only sources if its Story Bible id *identifies* it. `porcelain-urinal` is a description; `fountain` is a proper title but also a common noun, and the decider correctly read it as plumbing. `duchamp-fountain` resolves to the 1917 readymade. `story-analyzer.v1.23` now requires an identifying id and says to qualify a title that doubles as an ordinary word — the same discipline an encyclopedia uses for article titles.

### Tagging is now load-bearing (2026-08-17)

A sourced plate only reaches a shot that **references** the entity. So a mis-tagged scene no longer costs a
continuity wobble — it costs depictive truth: we hold the real licensed photograph of the subject and render
an invention instead. On the Crossroads reel three object-only beats were tagged primary to Marcel Duchamp,
who appears in none of them, and each invented its own urinal.

Two fixes, and one instructive failure.

**Shipped — `scene-qa` Check C2 (error).** A scene whose PRIMARY entity is a character while its prose
describes no person at all is about something else; re-tag it. Narrow by construction: primary tag only (a
supporting character may sit off-frame), exempting the narrator (in a first-person reel she IS the camera and
has her own rules) and exempting prose that names the character directly. Measured on the reel that motivated
it: 1 fire, 0 false positives. It **misses** one true positive because that prompt used "silhouette" to
describe the urinal's silhouette and `PERSON_NOUN_RE` counts that word as a person — conservative, which is
the right failure direction for an error that triggers a paid repair round.

**Shipped — invariant 2 no longer keys off tagging.** The scrub built its withheld set from the scene's
resolved entities, which are only the TAGGED ones, so a prompt that *names* a withheld real person without
tagging them bypassed it entirely. Since mis-tagging is demonstrably routine, that was a live path to the
2026-07-24 failure, not a hypothetical. Withholding now triggers on tagged **or** named.

**Rejected — a lexical "depicts an entity it doesn't tag" detector.** The obvious guard was to match the
entity's description terms against the prompt. Measured against the real reel it scored 1 true positive to
2–3 false, and firing it as an error would have made the reel *worse*: scenes 1 and 2 show ordinary urinals in
a plumbing-shop window before the artwork exists, and tagging those would have stamped `R.MUTT 1917` onto shop
stock. The failure is conceptual, not a threshold to tune — this story is *built* on an ordinary urinal
becoming Fountain by declaration, so "urinal in a shop window" and "urinal on a plinth" are lexically
identical and semantically opposite. Reference conditioning also transfers an artwork's *artwork-ness*
(signature, plinth, exhibition tag) wholesale, which fights any counterfactual beat needing the object
stripped of exactly those marks. Unlike a place or a person, a titled artwork's markings **are** its identity.

### Verified visual identity is inherited, not attached scene-by-scene (2026-08-23)

**Founder decision.** When a factual story depicts a specific real subject whose identity is load-bearing,
Kendrix resolves one verified, rights-eligible visual anchor on the Story Bible entity and every scene that
depicts that exact subject and state inherits it automatically. This is a correctness constraint, independent
of genre or language; shot choice, composition, lighting, and channel style remain the director's judgment.

Crossroads exposed a consumption failure rather than a missing sourcing mechanism. The verified Stieglitz
image was installed on one scene, not on `duchamp-fountain`, while other scenes were mis-bound or unbound.
They therefore invented unrelated fixtures even though the reel already held the right source.

The rule is deliberately **identity-and-state aware**, not "source anything searchable":

- A named real place, object, animal, or eligible historical person gets a canonical source anchor only when
  the source is verified and the subject's identity matters to the story.
- A materially different story-time state selects one appearance of the same identity. For *Fountain*, the
  unmarked shop fixture and the signed, rotated artwork are distinct visual states; the signature, plinth,
  and exhibition orientation must not leak backward.
- Generic, anonymous, fictional, incidental, unverifiable, or wrong-era subjects remain generated or
  withheld under the existing depiction mode. The existence of a searchable image is not itself a reason to
  use it.
- Presented archival media remains untouched and separate from a conditioning reference. Provenance,
  disclosure, human eligibility, and subject-rights review remain load-bearing.

**Pipeline consequence.** Subject routing must be available to scene planning, before it chooses entity
bindings. After the director chooses the exact entity/state visible in each shot, deterministic code resolves
the corresponding reference key for every automatic generation and reshoot consumer. A scene claiming a
`reference_plate` identity without a verified sourced anchor is a bounded pre-image failure, not a silent
text-only or independently generated fallback. QA judges the rendered identity; it does not infer or rewrite
the director's entity intent after image spend.

**Smallest proof on Crossroads.** Hand-label the eight scenes as `generic precursor`, `canonical Fountain`,
`presented archival`, or `not depicted`; require the source-enriched plan to match those labels before any
image call; then regenerate only canonical-*Fountain* scenes from the same plate. The proof fails if the
object changes identity, if finished-artwork details leak into a precursor beat, or if the anchor flattens
the intended shot variety.

### Source identity is exact, and only depictable subjects become entities (2026-08-23)

The next Crossroads board exposed two different errors that looked like one generic “bad history image”
problem:

1. `society-of-independent-artists-exhibition` conflated an organization/event with a physical venue. The
   analyzer therefore froze an invented modern gallery as a recurring location and the renderer faithfully
   repeated that invention across document close-ups.
2. *The Blind Man* resolved to the article's April 1917 lead image even though the scene required the May
   issue containing *Fountain*. The parent publication matched; the edition did not.

These produce two universal constraints:

- **An organization, institution, committee, movement, or historical event is story context, not by itself a
  visual Story Bible identity.** Extract the actual named building/site, document, artifact, person, or other
  concrete subject only when the narration supports it. A voiceover itinerary may name the event in
  `locationLabel`, but `locationEntityId` stays null unless the physical venue itself is established.
- **A single factual shot can still carry a load-bearing real identity.** The ordinary Story Bible favours
  recurring subjects because continuity has no value for a disposable prop. Depictive fidelity has a narrower
  exception: when even one shot explicitly depicts a named real artwork, dated publication issue, document,
  landmark, vehicle, animal, or other concrete subject whose exact identity matters, it must enter the Bible
  so routing can source it. Merely mentioning a person, organization, or event does not trigger the exception.
- **A dated, editioned, versioned, marked, damaged, restored, or otherwise state-specific source matches only
  when that exact state matches.** The article lead is one candidate, never the verdict. If it fails the
  state/edition check, non-human sourcing may search Commons directly for a better candidate; every candidate
  still passes the same identity-and-state verifier. Human sourcing never gains that free-text fallback.

The director still chooses the most truthful shot for the beat. These rules do not force an archival image
into a scene it cannot support, and they do not prescribe a visual style. They prevent the system from
anchoring a scene to the wrong kind of subject or the wrong historical instance.

#### Present the source when the source is the claim

A verified source has two different legitimate uses, and the scene plan must choose between them:

- **Condition** — the source anchors identity while a new reconstruction is generated.
- **Present** — the untouched source pixels are the shot because the narration is discussing that photograph,
  issue page, document, artwork reproduction, map, or piece of evidence itself.

Never ask an image model to recreate a source that the audience is meant to inspect. A plausible facsimile is
more misleading than an unrelated illustration. Conversely, a source that is merely mentioned, belongs to a
later moment, or depicts a different state must not leak into the generated frame. `sourcePresentationEntity`
records the explicit per-scene choice; it is valid only for the sourced primary entity in its base state.

### Boundary with the depictive-ethics floor

The floor governs what a depiction may **claim**; this governs what may be **sourced** and how. Both are required and neither exempts the other — the 2026-07-24 DTI failure violated depiction with zero sourced references involved. Where they touch (long-dead figures), this defers to the floor's CARE tier.

### ⚠️ Rights in the SUBJECT, not just the file — found 2026-08-17, unresolved

The licence allowlist proves the *photograph* is freely licensed. It says nothing about rights in the *thing
photographed*.

Crossroads is the case. Stieglitz's 1917 photograph of *Fountain* is public domain, and the pipeline correctly
used it — then conditioned six frames on it, producing new derivative depictions of an artwork whose author
died in 1968 and whose estate licenses reproductions (life+70 runs to 2038 in most jurisdictions). The same
gap covers a public-domain photograph of an in-copyright building, sculpture, mural, or logo.

Note the asymmetry it creates: the floor correctly refused Man Ray's fair-use portrait of Duchamp and
correctly withheld his likeness, while nothing at all questioned generating derivatives of his artwork.
**A licence-clean source is necessary and not sufficient for public publishing.** This is the sibling of the
freedom-of-panorama caveat and needs a human/legal check before any reel depicting a named artwork ships.

### What this still does not own

Era mismatch (right subject, wrong period), wrong-but-similar instances, freedom of panorama, trademark on real products, and **archival context** — a correctly licensed, correctly identified photograph can still be placed against narration it does not support. The verify filter checks *who*, never *when or why*.

---

## Original hypothesis (2026-07-20) — retained as the design record

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

- ~~**People / likenesses.** Separate, policy-gated. Default stays representative stand-ins.~~ **SUPERSEDED 2026-08-12** — not by relaxing the stance but by the depictive-ethics floor drawing the line precisely enough to build against. The floor's own edge cases rule long-dead figures in reconstruction framing OUT (permitted, deferring here) and genuine licensed archival media OUT (permitted, sourcing path governs), while ruling living public figures IN (forbidden as staged depiction). So: long-dead → conditioning plate; living/recent → archival photograph presented as itself, never conditioned on; unidentified → never sourced. Default for everyone else remains representative stand-ins. See "The shape of it" above.
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
