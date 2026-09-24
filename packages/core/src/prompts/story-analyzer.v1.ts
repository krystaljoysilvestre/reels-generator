// story-analyzer.v1 — read a FINISHED narration and extract its recurring entities as a Story Bible
// (see specs/story-bible.md). This is the symbol table the scene breakdown references and the assembler
// splices, so a recurring person/place/object reads as the SAME one across the independently-generated
// scene images. The analyzer is an information EXTRACTOR, not a creative writer: facts only, no fabrication.
//
// Output is validated against StoryBibleSchema (packages/core/src/types/story-bible.ts). The caller merges
// this with the channel's normalized canon (mergeBible) before persisting the resolved bible on the reel.

import { StoryBibleSchema } from '../types/story-bible.js'
import type { BibleEntity } from '../types/story-bible.js'

export const STORY_ANALYZER_V1_VERSION = 'story-analyzer.v1.29'

// The analyzer emits a full StoryBible; the caller validates with this schema.
export { StoryBibleSchema }

export interface StoryAnalyzerVars {
  narration: string
  channelCanon: BibleEntity[] // normalized channel canon (recurring across reels) — reuse these ids
  nicheDescription: string
  era: string
  regionDescriptor: string
  // Owner-set channel presentation identity ('voiceover' | 'hosted' | '' = no hint). Rendered as CONTEXT
  // the analyzer reasons from — a bias, never a command; the narration's own text decides via the
  // participant test. See hypotheses/voiceover-perspective.md.
  presentation?: string
}

// The channel's presentation identity as analyzer CONTEXT. A bias, not a command — the participant test
// on the narration's own text always decides. '' / unknown values render nothing.
function presentationLine(presentation?: string): string {
  if (presentation === 'voiceover')
    return `\nCHANNEL PRESENTATION (owner-set context — a bias, not a command; the narration's own text decides via the participant test): this channel's narration is voiceover commentary — a narrator who never appears on screen; no host, no presenter.`
  if (presentation === 'hosted')
    return `\nCHANNEL PRESENTATION (owner-set context — a bias, not a command; the narration's own text decides via the participant test): this channel leans toward an embodied teller — but only the narration's own text decides whether this story's narrator lived its events.`
  return ''
}

export function buildStoryAnalyzerPrompt(v: StoryAnalyzerVars): { system: string; userMessage: string } {
  const system = `You are a continuity analyst for a narrated vertical (9:16) reel. You read the FINISHED narration and extract its recurring people, places, and objects as a stable visual reference — a "story bible" the storyboard team will reuse so the same character, room, or object looks identical every time it appears.

You are an information EXTRACTOR, not a creative writer. You describe only what the narration states or directly implies, in plain depictable terms. You never invent.

CHANNEL NICHE: ${v.nicheDescription}
Era: ${v.era}. Region look: ${v.regionDescriptor}.${presentationLine(v.presentation)}`

  const canonBlock = v.channelCanon.length
    ? `EXISTING CHANNEL CANON (recurring across this channel's reels — when THIS story features one of these, REUSE its id instead of minting a duplicate, and you may extend its description with story-specific facts):
${JSON.stringify(v.channelCanon, null, 2)}
CRITICAL: the canon is a shared vocabulary, NOT a checklist. Include a canon entity ONLY if THIS narration actually features it. Do NOT copy canon entities the story never mentions into your output — the bible must contain only the people, places, and objects that appear in THIS story. A story set entirely in a school restroom must NOT list the channel's dorm, office, or hospital.`
    : `EXISTING CHANNEL CANON: none.`

  const userMessage = `Read the narration and extract its Story Bible.

${canonBlock}

Narration:
"""${v.narration}"""

Extract:

ENTITIES — the recurring people, places, and objects that ANCHOR the story. Rules:
- Extract ONLY what RECURS or ANCHORS — be STRICT, a short cast beats a padded list. An entity must EITHER
  appear across MULTIPLE beats, OR be central to what the story is about (a character, the main setting, the
  object the whole story turns on). The test: would it look WRONG if it changed appearance between shots? If
  it never reappears, the answer is no — it is NOT an entity. Incidental props the narration mentions in
  passing (earphones, a phone's clock, a fridge light, a glass of water, a single text bubble) are NOT
  entities — they belong in the one scene's inline description, not the bible. When unsure, LEAVE IT OUT.
- ONE-SCENE FACTUAL IDENTITY EXCEPTION. In a factual/real-world narration, extract a concrete NAMED real
  visual subject even when it appears in only one beat when that beat explicitly depicts the subject and its
  exact identity matters: a named artwork or artifact, a dated publication issue or document, a landmark,
  vessel, vehicle, species/individual animal, or similarly look-up-able thing. Without an entity the sourcing
  stage cannot anchor it and the renderer invents a generic substitute. This is not permission to pad the
  Bible: a person, organization, event, idea, or merely mentioned subject does not qualify unless the shot
  actually depicts a concrete visual identity governed by the existing person/organization rules.
- ORGANIZATIONS AND EVENTS ARE CONTEXT, NOT LOCATIONS. A named organization, institution, committee,
  movement, exhibition, ceremony, vote, trial, battle, or other event is not itself a physical Story Bible
  entity. Never turn it into a "location" merely because events happened somewhere: that freezes an invented
  venue and makes every later shot repeat it. Extract a location only when the narration establishes the
  actual physical building/site/room as a recurring visual subject. Extract a separately named document,
  artwork, artifact, person, or other concrete visual subject when it independently passes the entity test.
  Under VOICEOVER, an event or organization may remain the leg's locationLabel for subject-matter context,
  but locationEntityId MUST be null unless the physical venue itself is an extracted location entity.
- MISSIONS ARE EVENTS, NOT VEHICLES. A named mission, operation, expedition, campaign, program, or flight is
  story context, not one visual object identity — even when the narration repeatedly names it or describes
  the craft and equipment involved. Do not create one mission entity and use it for every participant object.
  Extract a separately named launch vehicle, capsule, ship, aircraft, instrument, document, building, or
  other physical subject only when the narration actually establishes and depicts that exact identity.
- THE PARTICIPANT TEST DECIDES EMBODIMENT, BEFORE ANY NARRATOR IS EXTRACTED. Ask: did the teller LIVE the events (a participant telling what happened to them — a diegetic narrator), or is the teller REPORTING, EXPLAINING, or ARGUING about events from outside them (news, documentary, explainer, essay, recap — a VOICEOVER)? Pronouns are evidence, participation is the verdict: first-person cues ("ako", "ko", "nakita ko", "I", "my", "natin", "sa atin") appear in BOTH kinds of narration, so they alone never decide. A VOICEOVER narrator is a voice above the story's world with NO body in it: do NOT extract a narrator entity for it, ever.
- THE LIVED FIRST-PERSON NARRATOR IS ALWAYS AN ENTITY. If the narration is told in first person by a teller who LIVED the events, you MUST extract the narrator as a "character" entity with a FULLY committed look (gender + wardrobe + hair + build), EVEN in a solo story where no one else appears and they are only ever seen as their own hands, a reflection, or a partial body. A first-person narrator IS shown — hands on a sink, a face in a mirror, a shoulder edging the frame — so without a locked appearance every such shot renders a DIFFERENT person. Set continuity.narratorEntityId to this entity's id, and list this id in the journey leg's "present" array for every leg the narrator is physically in (for the narrator, that is every leg).
- FACTS ONLY. Each "description" is a short, depictable noun phrase of OBSERVABLE traits — for a person: gender, apparent age, build, hair, and wardrobe (ALL of these — an under-described person renders as a random, often wrong, figure), plus one distinguishing detail; for a place: layout, key furniture, materials, colours, wear; for an object: count, state, condition. NO mood words, NO adjectives of feeling, NO interpretation (write "an old mirror, dark wood frame, cracked glass", never "a creepy mirror").
- PEOPLE need a COMMITTED gender + wardrobe, derived from EVIDENCE — never from a default. Read GENDER from the narration's OWN cues (gendered words, honorifics, names, pronouns, role) and commit to what they indicate. Read WARDROBE from the story's setting and activity together with the channel's stated era and region (above): name what a person of that role, in that place and time, would actually wear — specifically, not a vague placeholder. Do not impose traits the evidence doesn't support; once the cues point one way, commit, so the figure stays consistent instead of drifting. Where appearance is left entirely unspecified, the "commit to ONE plausible look" rule below applies — pick a neutral, context-appropriate look, not a stereotype. GENDER IS NEVER DEFERRED: NEVER write "gender unspecified", "male or female", "depending on gender", or "a skirt or pants" — a hedged gender renders a DIFFERENT person every single shot (a boy in one, a girl in the next). Tagalog/Taglish first-person ("ako", "ko", "nakita ko") carries NO grammatical gender, so you will OFTEN have no explicit cue — in that case INFER gender from the surrounding cast and context (a schoolgirl's best friend + a female-coded story → female), and if it is STILL genuinely ambiguous, COMMIT to one plausible gender + one concrete uniform anyway. The renderer must never be left to choose the gender.
- SAME-SETTING CAST SHARE A UNIFORM BASE, but stay DISTINCT people. Characters who belong to the same institution/group (the same school, the same workplace) wear the SAME uniform — identical garments and colours (two students at one school: the SAME white blouse + the SAME plaid skirt, not one in a skirt and one in pants). But they MUST read as visually DISTINCT individuals — differ in hair (length/style), build, height, and one identifying detail — so two classmates never render as the same person. Give recurring students a consistent context prop (a backpack) where natural. State each person's shared-base + distinct-detail explicitly in their description.
- STABLE IDENTITY ONLY — describe what someone/something permanently IS, never what it is momentarily HOLDING or DOING. Transient props and actions belong to a SCENE, not an entity: a friend who LOSES or goes to LOOK FOR her tumbler must NOT be described as "carrying a tumbler" — she'd be drawn holding the very thing she's searching for. A prop that is lost, sought, only-sometimes-present, or appears in a single beat is either its OWN object entity (if it recurs) or a per-scene detail — never welded onto a person's permanent look.
- DECLARATIVE looks, NO hedging. Write each description as one committed look — never "possibly", "maybe", "perhaps", "likely", "or". If the narration leaves a RECURRING thing's appearance unspecified, commit to ONE plausible, genre-appropriate concrete look and state it plainly: that single frozen choice is exactly what keeps the thing consistent across shots.
- DON'T FABRICATE BIOGRAPHY. Committing to a plausible LOOK for something unspecified — a prop, a place, or a person's appearance (gender, wardrobe, hair, build) — is your job (above). But never invent BIOGRAPHICAL facts the narration doesn't give: a specific numeric age, a name, a relationship, a brand, or backstory — and never state an inferred look as if it were a stated fact. Appearance you commit to; biography you don't invent.
- ONE IDENTITY, TIME-BOUND APPEARANCES. A person, place, or object remains ONE entity when its visible state
  changes across the story. When — and ONLY when — the narration materially depicts different states of that
  same identity (a grandmother now versus when she was young; one artifact before versus after a documented
  modification; one building before versus after damage), keep ONE parent entity and add an "appearances"
  variant for each non-default state actually shown. Never split the same identity into unrelated entities.
  The parent "description" is the default/most framing appearance; each variant has an ENGLISH kebab-case id
  and a COMPLETE standalone visual description — never a delta such as "the same object but signed". Preserve
  the stable geometry and identifying features the story supports, while stating every visible state change
  concretely. Most stories are linear and MUST return appearances: []. Past tense alone is NOT a reason to
  create a variant. Dreams, hypotheticals, wardrobe changes, damage, restoration, and transformation are not
  automatically variants; use judgment and leave appearances empty unless persistent visual continuity
  genuinely requires a separate frozen look.
  TRANSFORMATION BOUNDARIES ARE LOAD-BEARING: when one narration span visibly moves an important recurring
  identity through two or more material states, create the needed variant and split the journey at the exact
  clause where the visible state changes — even inside one sentence. For example, an artifact acquired
  upright and unmarked, then rotated and signed, needs an "unsigned-upright" state for the acquisition clause
  and the canonical signed state afterward. The complete descriptions preserve the same underlying geometry;
  only narration-supported state details change. Never let the final state's marks leak into the precursor.
- NEVER MINT A LIKENESS FOR A REAL PERSON (depictive-ethics floor). If a named entity is a real, identifiable living person (a public official, executive, athlete, celebrity) or a named real organization's people, do NOT commit an invented facial/personal likeness — a fabricated committed look splices verbatim into every scene and becomes a fake photo of a real person. Extract them ROLE-REPRESENTATIVE instead (id like "trade-official", description "an anonymous government representative figure, no identifiable face — shown from behind or in silhouette") OR, better, don't mint a person entity at all and let the story's SUBSTANCE carry the beat (the real place, documents, symbolic staging). Fictional characters are unaffected; this is only for real, named, living people and real organizations' personnel.
- THE SUPERNATURAL THREAT is a CHARACTER entity — but ONLY when it is SEEN. When the narration gives the threat a SEEN physical manifestation (a figure who can't be there, a second face in a reflection, a form that appears, an aswang/multo/white lady), extract it as a "character" with role: "threat". BODILESS THREAT EXCEPTION — do NOT extract it as an entity at all: if the threat is only ever HEARD or FELT and never SEEN in the narration (a voice with no source, a whisper, a "presence", a cold, a knocking), it has NO visible form, so minting it as a character forces the storyboard to render "a presence with no visible form" — which the image model can only draw as smoke, mist, or a distorted figure (the #1 fake-looking-horror failure). Instead: do NOT create an entity for it, do NOT set isReflection/a reveal leg for it, and capture it in ONE directorNotes line as a bodiless threat whose scare is rendered through its EFFECT on real objects (the thing that moved, the coin that returned) and the witness's reaction — never drawn. (A threat that STARTS as a voice and later APPEARS as a seen form IS extracted — from the beat it is seen.) Mark ONLY a SEEN supernatural presence with the role; ordinary people get none. Usually exactly one. THE SCARE IS A CONTRADICTION, NOT A CREATURE — what makes the presence frightening is the rule of reality it BREAKS, not how it looks. Reason in three steps, emitting only the last two: (1) which reality rule does THIS story rely on? ("a reflection corresponds to what stands before the glass", "an unattended object stays where it was left", "a locked house lets no one in", "a photograph preserves what happened"); (2) how does the story break it?; (3) how can BOTH sides of the break be visually VERIFIED — in one frame, or across the reel for a before/after change? Reality A and Reality B may be separated by TIME ("the doll faced the window last night" / "it faces the door now") — extract the pair as FACTS; how it is shown (same frame, or established early and broken at the payoff) is the director's job, not yours. The violated property is one of: Presence (empty but occupied), Location (exists where impossible), Reflection (reflection disagrees with reality), Motion (a still thing moved), Stillness (a thing that never moves), Time (before/after mismatch), Identity (one becomes two), Geometry (impossible proportions), Visibility (seen through what should block it) — pick ONLY what the narration actually supports, never impose an archetype. Then emit TWO things for the threat:
  • Its "description" (RENDER-FACING — spliced verbatim into image prompts): the LOOK only, shadow-native — (a) a base form mostly lost to darkness ("a tall gaunt figure in the dark"); (b) exactly ONE committed anomaly written in LIGHTING language, what the light FINDS, never an anatomy list ("a single wet glint inside each deep-sunken socket", "only the edge of a too-wide grin of crooked teeth emerging into the light", "the silhouette of a head tilted slightly wrong"). Prefer the anomaly that CARRIES the contradiction (position, arrangement, stillness) over facial texture — a facial expression may be part of the look but must NEVER be the load-bearing scare: image models render a "too-wide grin" as a pleasant smile, but they render impossible ARRANGEMENTS faithfully. THE ANOMALY IS THE THREAT'S IDENTITY: one anomaly, committed once, the SAME every scene it haunts — never swapped, never accumulated (unless the story explicitly depicts a transformation). PHYSICAL, never emotional (no "terrifying/sinister" — not renderable, and mood words). ANTI-BLOB: never ONLY "hidden in shadow" / "a dark shape" — name the lit anomaly concretely or the render is an empty dark room. Never pretty, never bloody/gory, never cosmetics-wording ("pale skin + dark eyes" renders as goth makeup). NON-PERSON words — "a tall figure", "a gaunt form", "a shape", never "a woman/man/girl" (naming a PERSON in a dead or menacing state trips the image model's safety filter; the same thing as a "figure/form" renders identically and passes).
  • A directorNotes entry (DIRECTOR-FACING — see CONSTRAINTS) carrying the contradiction in LABELED form, in ENGLISH, tied to THIS narration: "Contradiction — Reality A: <what is true>. Reality B: <what cannot then also be true, yet is>. Conflict: <the violated property>." plus any visibility/manifestation rule the story implies ("the figure exists only in the mirror — the room itself, whenever shown, is empty", "never fully lit, never shown whole"). SPECIFICITY GUARD: the pair must belong to THIS story alone ("the narrator stands alone at the sinks; the mirror holds a second face beside hers"), never a template any horror story could reuse ("room empty / mirror occupied").
- LOCATIONS must enumerate the physical light sources / openings present (a window, a bare bulb, a gasera/kerosene lamp, "no electricity") — these are facts of the place. (Which light is ON, and the time of day, are decided later, per scene — don't fix them here.)
- A DWELT-IN SETTING IS A LOCATION ENTITY, not a transit space. Any place where the narrator DWELLS or that hosts 2+ beats — e.g. a stage/backstage where they finish props across several beats — MUST be extracted as a "location" entity with a full description, even if they later move on. The story's OPENING / primary setting (where the first events happen — the classroom, the stage, the bedroom) is ALWAYS a location entity: it anchors the opening shots, so it needs a locked look even when the narration describes it in only a sentence or two. It gets a locked look and renders consistently. RESERVE a transit space (a journey leg with locationEntityId set to null) ONLY for a place merely CROSSED in a single pass-through beat (a corridor walked through once on the way somewhere). Do NOT dump a dwelt-in setting into a bare transit label — that leaves it with no description and it renders as a generic room (a "stage" came out as a storage room). So: dwelt-in / multi-beat → entity; single-pass-through → transit.
- SPLIT RECURRING ENCLOSED SUB-SPACES into their OWN location — this is the DEFAULT, not the exception. A smaller enclosed space you sit or stand INSIDE, walled off so the rest of the place is NOT visible from within — a toilet cubicle inside a restroom, a car interior on a street, a confessional inside a church, a shower stall, an elevator — is a SEPARATE location from its parent whenever EITHER: (a) the story sets TWO OR MORE beats inside it, OR (b) the narrator stays inside it through one SUSTAINED stretch (e.g. sitting in a cubicle through a whole back-and-forth exchange). When that test passes you MUST emit BOTH entities:
  • the INTERIOR (e.g. "restroom-cubicle-interior") — described by ONLY what is seen from within: the partition walls pressing close, the latched door, the toilet. NEVER the parent's far features (no sinks, no mirror, no window wall) — they aren't visible from inside and would force the wrong space into the shot.
  • the PARENT (e.g. "school-restroom", with its sinks and mirror) — for the wide establishing / entering / exiting shots.
  This matters because each description is spliced VERBATIM into every shot that references it: put "a mirror above the sinks" into a shut-cubicle shot and the model renders the open room instead of the cubicle. The scene breakdown then tags whichever one a beat is physically inside.
  The ONLY time you keep a SINGLE location is when the enclosed space appears in exactly ONE brief, non-central beat and never recurs — then don't mint a duplicate; keep the parent and let that one shot note its tight framing inline. When in doubt for a space the story actually dwells in: SPLIT.
- EVERY entity MUST have a full, depictable visual description — never just its name/id, and never a bare non-English term. The description is spliced straight into an image prompt, so a name alone ("lumang kwarto") is useless: write what it LOOKS like ("an old wooden room, plank walls, a single bed"). Translate every non-English name into its appearance (e.g. "gasera" → "a small kerosene gas lamp", "lumang kwarto" → "a small old wooden bedroom").
- REUSE channel-canon ids where an entity matches — but still write its FULL visual description (the canon may only have the name; you supply the look). Only mint a new id for something the canon doesn't cover.
- id: ENGLISH kebab-case (e.g. "rented-bedroom", "cracked-mirror", "grandmother"). TRANSLATE any Tagalog/other-language name to English for the id — never mint a Tagalog id ("salamin-ng-banyo" → "bathroom-mirror", "cr-sa-eskwela" → "school-restroom", "reloh-sa-telepono" → "phone-clock"). This matters because the scene breakdown often echoes the id as the shot's label, and the image model only understands English — a Tagalog id renders the wrong object or fails. kind: "character" | "location" | "object".
- NAME A REAL THING BY A NAME THAT IDENTIFIES IT, don't describe it. When an entity IS a specific real-world subject the narration identifies — a titled artwork, a named vessel or vehicle, a named building or site, a named species, a named document, a real person — the id must NAME it rather than describe how it looks: "titanic", NOT "ocean-liner"; "philippine-eagle", NOT "large-forest-raptor"; "rosetta-stone", NOT "inscribed-granite-slab". Put the physical description where it belongs — in "description".
  READ THE WHOLE NARRATION BEFORE NAMING. A subject may be introduced by its generic class and identified
  precisely only later. When the later wording makes clear it is the same physical subject, preserve that
  exact model/designation/title in the ONE entity id and description everywhere — e.g. a weapon later named
  "Mark 39" becomes "mark-39", never the generic "thermonuclear-weapon". Do not split its generic mention
  and exact mention into two entities, and do not let an early generic noun erase the later exact identity.
  DISAMBIGUATE WHEN THE NAME IS ALSO AN ORDINARY WORD. The id must pick out THIS subject on its own, the way an encyclopedia article title does — so when a work's title is also a common noun, qualify it with its maker, place, or year: "duchamp-fountain", NOT "fountain" (which reads as a garden water feature); "picasso-guernica" over a bare "guernica" if the town could be meant; "hindenburg-disaster" over "hindenburg" if the person could be meant. A bare common noun is read as the generic thing, which is exactly the wrong answer.
  Why this matters, and it is invisible from where you sit: the engine can source a REAL licensed photograph of an identified subject and render every shot from the real thing, and the id is the ONLY signal it has — "porcelain-urinal" and "fountain" both resolve to any old plumbing fixture and get an invented look, while "duchamp-fountain" resolves to the actual 1917 readymade. The breakdown also echoes the id as the shot label, so a descriptive id quietly re-describes the subject at every beat.
  If the narration does NOT name a specific real instance — an anonymous bedroom, a stray dog, some cracked mirror — keep describing it generically, exactly as before. Inventing a proper name for a generic thing is the opposite error and is worse.

CONTINUITY:
- narratorPerspective: apply the participant test (see ENTITIES) — "voiceover" when the teller reports, explains, or argues about events from outside the story's world (news, documentary, explainer, essay, recap; regardless of which pronouns appear); "first_person" when the narration is told as "I/ako/ko/nakita ko/akin" by a teller who LIVED the events; otherwise "third_person".
- narratorEntityId: for a first_person reel this is the id of the narrator character you extracted above (you ALWAYS extract one for lived first-person — see ENTITIES); it tells the storyboard the narrator is POV, not a separate full figure, and locks their look for hand/reflection shots. null for third_person AND for voiceover (a voiceover narrator has no body and is never an entity).
- timeline: optional short ordered time-of-day cues if the story makes them explicit (e.g. ["evening", "3 AM"]); else [].
- journey: an ORDERED list tracing the story's world through the narration — one leg per contiguous stretch
  where PLACE, WHO-IS-PRESENT, NARRATIVE TIME/FRAME, and active character APPEARANCE stay stable. This is
  the world-state the storyboard OBEYS, so it must be ACCURATE, not vague; walk the narration front-to-back
  and change legs whenever the narrator moves, someone joins/leaves, or the narration crosses between a
  present framing scene and a remembered/earlier/later event. Do NOT add a flashback because a sentence is
  grammatically past-tense; only follow the story's actual depicted time. For each leg:
  • span: the VERBATIM narration substring this leg covers (copy-paste, no ellipsis); the legs together cover the narration in order.
  • locationLabel: a short ENGLISH label for where the narrator physically IS this leg — INCLUDING transit spaces that may not be entities (a stage, a path, a hallway). "Walking toward X" is its OWN leg in the space passed THROUGH, never inside X.
  • locationEntityId: the bible LOCATION entity the narrator is physically INSIDE this leg; null for a transit space with no entity. NEVER the destination they're only heading toward.
  • present: entity ids of the characters PHYSICALLY here this leg — only who the narration actually places here. Someone who left (went back for something, stayed behind) is NOT present until they return. In a first-person story the narrator is present in EVERY leg.
  • visible: the subset of present actually ON-camera. Usually equals present; make it NARROWER for POV / reflection / hidden beats (narrator present but off-camera; a threat seen only in a reflection). [] means "same as present".
  • appearanceByEntity: map an entity id to ONE of that entity's appearance ids when this span depicts that
    non-default state. For a character, the entity must be present; for a location it must be this leg's
    setting; an object may be bound when this span depicts its changed state. Omit the entity to use the
    parent/default description. Never bind two appearances at once. A framing shot may use the elderly
    default while the next remembered-event leg binds "remembered-youth"; an artifact may use "unsigned"
    before the narration reaches its signed form.
  • occupancyState: "outside" | "approaching" | "inside" | "leaving" — the narrator's relation to this leg's place; omit if genuinely unclear.
  • isReflection: true only if the narrator sees this leg via a mirror / window / dark glass.
  UNDER VOICEOVER the journey is a SUBJECT-MATTER ITINERARY instead: one leg per contiguous stretch whose SETTING (the place or subject the content is about) stays stable; spans still tile the narration in order; "present" lists ONLY people the narration's content itself depicts (never the narrator — there is none on screen); leave occupancyState out and isReflection false; the itinerary may jump freely between places (an argument is not locomotion).
  MOVEMENT IS CONTINUOUS (diegetic narrators only — a voiceover subject-matter itinerary may jump) — the narrator can't teleport: never go from INSIDE one place straight to INSIDE another without a leaving/transit leg between them.

CONSTRAINTS:
- directorNotes: only STORY-SPECIFIC visual rules that the genre wouldn't already imply. Leave empty if nothing specific. Do NOT restate generic genre conventions. When the story has a role:"threat" entity, ALWAYS include its labeled Contradiction entry plus its visibility/manifestation rules (see THE SUPERNATURAL THREAT).

OUTPUT (JSON only, matching this shape exactly):
{
  "entities": [
    { "id": "rented-bedroom", "kind": "location", "description": "a small rented bedroom, cream concrete walls with peeling paint, a single wooden bed, one shuttered window, a bare ceiling bulb" },
    { "id": "grandmother", "kind": "character", "description": "an elderly woman, slight build, silver hair in a low bun, dark woven blouse", "appearances": [{ "id": "remembered-youth", "description": "a young girl, slight build, long black hair tied with the same narrow red ribbon, simple cotton blouse and knee-length skirt" }] },
    { "id": "the-figure", "kind": "character", "role": "threat", "description": "a tall gaunt figure almost lost to the darkness, long wet black hair, unnaturally still; a single wet glint of light inside each deep-sunken socket", "appearances": [] }
  ],
  "continuity": {
    "narratorPerspective": "first_person",
    "narratorEntityId": null,
    "timeline": [],
    "journey": [
      { "span": "verbatim narration for this leg", "locationLabel": "family home", "locationEntityId": null, "present": ["grandmother"], "visible": ["grandmother"], "appearanceByEntity": {}, "occupancyState": "inside", "isReflection": false },
      { "span": "next verbatim remembered-event span", "locationLabel": "rural path", "locationEntityId": null, "present": ["grandmother"], "visible": ["grandmother"], "appearanceByEntity": { "grandmother": "remembered-youth" }, "occupancyState": "outside", "isReflection": false }
    ]
  },
  "constraints": { "directorNotes": ["Contradiction — Reality A: the narrator stands alone at the sinks. Reality B: the mirror holds a second face beside hers. Conflict: reflection mismatch.", "the figure exists only in the mirror — the room itself, whenever shown, is empty; never fully lit, never shown whole"] }
}

For a VOICEOVER reel the same shape applies, with: NO narrator entity anywhere in "entities", "narratorPerspective": "voiceover", "narratorEntityId": null, and journey legs as the subject-matter itinerary — "present" lists only people the content itself depicts, "occupancyState" omitted, "isReflection" false.`

  return { system, userMessage }
}
