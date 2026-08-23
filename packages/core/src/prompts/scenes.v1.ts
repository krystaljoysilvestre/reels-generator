// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).
//
// Structure: a niche-NEUTRAL CORE (always sent) + ONE genre MODULE, so a reel only pays for its own
// genre's rules (a cooking reel never reads the horror darkness rules; a horror reel never reads "show
// the subject bright and clear"). The module is chosen from the channel's `genreCategory` — an
// LLM-derived bucket stored at channel creation (channel.v1). `classifyGenre` is the keyword fallback,
// used when a channel predates the column (or the value is unrecognized).

// Back to v1.44: the closing-shot block ("THE LAST SCENE IS THE AFTERIMAGE") is reverted with the rest of
// the ending TEXT layer (decision-log 2026-08-06-003). The TIME layer that makes a closing shot playable
// at all — the outro tail in compute-timings §4.65 — is KEPT; it is the part the founder validated.
export const SCENES_V1_VERSION = 'scenes.v1.49'

export type GenreModule =
  | 'horror'
  | 'informational'
  | 'lifestyle'
  | 'drama'
  | 'commentary'
  | 'reddit_story'
  | 'comedy'
  | 'childrens'
  | 'fairytale'
  | 'general'

// Single source of truth for the bucket values — the wizard/settings validators import this
// instead of hand-writing `v === '…' || v === '…'` chains that drift.
export const GENRE_MODULE_VALUES = [
  'horror',
  'informational',
  'lifestyle',
  'drama',
  'commentary',
  'reddit_story',
  'comedy',
  'childrens',
  'fairytale',
  'general',
] as const satisfies readonly GenreModule[]

export interface ScenesPromptVars {
  // The reel's source-enriched Story Bible entities as JSON. The breakdown REFERENCES these by id/state;
  // the image assembler splices their frozen descriptions and supplies verified identity anchors. '[]' = no bible
  // (fail-soft) → the director describes everything inline, as it did before this stage existed.
  bibleEntitiesJson: string
  narratorPerspective?: 'first_person' | 'third_person' | 'voiceover' | undefined // authoritative (from the bible); undefined = detect from narration. 'voiceover' = non-diegetic narrator (see hypotheses/voiceover-perspective.md)
  directorNotes?: string[] // story-wide visual constraints from the bible (genre-default rules NOT restated here)
  era: string
  regionDescriptor: string
  nicheDescription: string // the channel's genre/niche — drives the visual language
  genreCategory?: string // LLM-derived bucket stored on the channel; falls back to classifyGenre(niche)
  aspect?: '9:16' | '16:9' // the channel's output frame (platform preset) — 9:16 when absent
  narration: string
  // Beat-driven count: a length-scaled range the director picks WITHIN by cutting on dramatic beats.
  minScenes: number
  maxScenes: number
  peakMoment: string // the reel's peak line (verbatim substring) — gets its own scene; '' to skip
  maxVideoTiers: number // motion budget — max scenes the director may mark tier "video" (see MOTION_BUDGET)
  // The narrator's JOURNEY (world-state ground truth from analyze_story) — where the narrator is + who's
  // present per leg. When provided, the director MUST obey it: tag only the leg's location, cast only who's
  // present. Structural shape (kept decoupled from the bible types).
  journey?: {
    span: string
    locationLabel: string
    locationEntityId: string | null
    present: string[]
    visible?: string[] | undefined
    appearanceByEntity?: Record<string, string> | undefined
    occupancyState?: string | undefined
    isReflection?: boolean | undefined
  }[]
  // Chaptered breakdown (long-form, see specs/long-form.md): this call storyboards ONE chapter of a
  // longer story — `narration` above is just that chapter's span. Context only; every scene rule is
  // unchanged. Absent for whole-reel (single-call) breakdowns.
  chapter?: {
    idx: number // 1-based
    count: number
    logline: string // one-line whole-story summary so the director knows the arc this chapter serves
    prevLocation?: string | undefined // where the previous chapter's last scene is set ('' for chapter 1)
    prevNarration?: string | undefined // the previous chapter's closing narration line, for continuity
  }
}

// Coarse genre bucket from the niche text — picks which module loads. Deterministic + free.
// Used as the fallback when a channel has no stored genreCategory (pre-dates the column).
export function classifyGenre(niche: string): GenreModule {
  const n = niche.toLowerCase()
  if (/fairy[- ]?tale|fairytale|enchanted tale|once upon a time/.test(n)) return 'fairytale'
  if (/children|kids|kiddie|bedtime|nursery|storybook|picture[- ]?book|toddler|preschool|for kids/.test(n)) return 'childrens'
  if (/horror|thriller|paranormal|aswang|multo|kulam|true[- ]?crime|creepy|scary|ghost|haunt|spooky|nightmare|eerie/.test(n)) return 'horror'
  if (/news|explain|educat|tutorial|histor|science|finance|document|how[- ]?to|fact|tech|business|review/.test(n)) return 'informational'
  if (/cook|food|recipe|travel|vlog|lifestyle|fashion|beauty|fitness|product|diy|craft|makeup/.test(n)) return 'lifestyle'
  if (/reddit|aita|tifu|confession|storytime/.test(n)) return 'reddit_story'
  if (/opinion|rant|hot[- ]?take|commentary|react|motivat|discipline|stoic|mindset|self[- ]?improve/.test(n)) return 'commentary'
  if (/drama|relationship|hugot|heartbreak|romance|family|love[- ]?stor/.test(n)) return 'drama'
  if (/comedy|funny|joke|humor|prank/.test(n)) return 'comedy'
  return 'general'
}

// Coerce a stored/derived string to a known module, defaulting unknown values to 'general'.
export function asGenreModule(v: string | null | undefined): GenreModule | null {
  return (GENRE_MODULE_VALUES as readonly string[]).includes(v ?? '') ? (v as GenreModule) : null
}

// The genre the MEDIA/register layer (scene modules, sound designer, colour grade) should use — a distinct
// axis from the fiction writer's genre. An Evidence-Based Narrative channel is a documentary register, so
// it resolves to `informational` (the closest built calm-register module — measured, neutral light, peak on
// the revelation) instead of falling into the empty `general` bucket, which gave EBN reels no register
// guidance at all and let the horror-tuned defaults take over. Until EBN earns its own module this is the
// right home. Standard channels are unaffected: the result is identical to the existing
// `asGenreModule(genreCategory) ?? classifyGenre(niche)` resolution.
export function resolveMediaGenre(opts: { storyMode?: string | null | undefined; genreCategory?: string | null | undefined; niche?: string | null | undefined }): GenreModule {
  if (opts.storyMode === 'ebn') return 'informational'
  return asGenreModule(opts.genreCategory) ?? (opts.niche ? classifyGenre(opts.niche) : 'general')
}

// One genre MODULE is appended to the core (only the matched one is sent).
const GENRE_MODULES: Record<GenreModule, string> = {
  horror: `GENRE — HORROR / THRILLER / PARANORMAL: build DREAD, and let it ESCALATE — early/mundane beats stay mostly NORMAL with only a faint wrongness (don't drench a calm setup shot in full horror; save the darkness for when the story turns), so the scare has contrast to land against.
THE REVEAL — SHOW THE CONTRADICTION, NOT THE CREATURE. The threat is the story's supernatural presence (infer it: when the narration presents a figure/presence that is IMPOSSIBLE or UNEXPLAINED — someone who can't be there, a second figure in a reflection, a voice with no source — that IS the threat, even if the narration never says "ghost"). A threat with NO PHYSICAL FORM (a voice, a whisper, a felt presence, a cold) is the exception to everything in this REVEAL section: it is NEVER drawn — render its EFFECT on real objects and the WITNESS's reaction instead (see A BODILESS THREAT IS NEVER GIVEN A FORM in the core rules). Only a threat with a visible body/form (a figure, a face in glass, a moved object, an impossible second person) uses the contradiction-verification rules that follow. The payoff makes the story's impossible fact directly OBSERVABLE in ONE believable photograph — an OBSERVABLE CONTRADICTION: two truths that cannot coexist, in a scene that otherwise reads completely real. Name Reality A and Reality B (obey the STORY-WIDE DIRECTION's Contradiction when one is given), then pick the VERIFICATION STRATEGY that fits where the contradiction lives — how does the viewer VERIFY the impossible fact? SPATIAL (a face in glass, a figure where none can stand, occupied emptiness) → same-frame comparison: Reality A and Reality B simultaneously verifiable in ONE frame with no inference ("the narrator stands alone at the sinks" + "the mirror holds two faces" — the empty room AND the occupied mirror both readable, nothing essential off-frame). TEMPORAL (a still thing moved; a before/after mismatch) → cross-shot comparison: the escalation ladder does the comparing — an earlier beat plainly establishes the state ("the doll faces the window"), and the payoff frame shows it unmistakably changed ("it faces the door"), each frame readable on its own. CAUSAL (evidence with no possible source) → the evidence and its missing explanation share ONE frame (muddy footprints ending at the narrator's bed, in a sealed and visibly empty room). IDENTITY (one becomes two; the photo is wrong) → side-by-side comparison in ONE frame (the family photo held beside the family — one extra child in the print). BEHAVIORAL (never blinks; stops when watched; the smile arrives a beat late) → motion IS the contradiction: make the payoff a "video" beat and put the wrongness in subjectMotion — behavior cannot freeze into a still. The image model doesn't need to understand horror — it only needs to render the verification. A muddled or off-frame contradiction loses the scare. THE CONTRADICTION IS LOAD-BEARING, NEVER THE FACE: image models render facial wrongness pretty (a "too-wide grin" comes out a pleasant smile) — compose so the scare survives even if the face renders normal: what is WHERE it can't be, what's MISSING that must exist, what DISAGREES between reflection and room, what hasn't MOVED. LIGHT IT AS DISCOVERY (chiaroscuro): deep black swallows most of the figure and frame; ONE hard, cold light source (whatever this place actually has — a phone screen, a dying fluorescent, a doorway's spill) catches the threat's committed anomaly — the light DISCOVERS the anomaly, it does not illuminate the creature; the lit sliver occupies a SMALL fraction of the frame and wins the eye by CONTRAST, never by lighting more of the figure. Steer between the two failures: (1) TOO-LIT — most of the figure visible reads as a living person in costume posing for a portrait; keep most of it in true black; (2) TOO-DARK — if the contradiction/anomaly isn't genuinely readable, the frame is just an empty dark room. ESCALATION — expectation established → expectation violated → violation UNDENIABLE, and never more: escalation means the violation gets harder to ignore, NEVER more creature (a full monster portrait is the classic failure); pre-reveal beats render the narration's OWN wrongness cues as environmental evidence (the glimmer, the gap under the door — never a figure; SHOW ONLY WHAT IS SEEN governs). Keep it DRY — never bloody or gory (gore is cheap AND trips the safety filter); NEVER telling-words ("ominous", "eerie") — describe where the light lands, what it finds, what the dark swallows. FRAME IT TIGHT: push close so the contradiction dominates; NEVER a wide shot of a small, distant figure on a payoff; when the contradiction's geometry needs room (both realities in frame), you judge the tightest frame that keeps them verifiable in ONE believable photograph. LEAD WITH IT: the imagePrompt opens on the contradiction, not the room and not the narrator (they're context at the edge). MOTION — a VIDEO payoff: the THREAT moves, ONE slow deliberate motion in shadow terms (the glint shifting as the head slowly tilts, the grin-edge widening into the light) in subjectMotion, paired with cameraMove:push_in; NEVER an empty subjectMotion on a scare — a payoff that holds perfectly still wastes the reel's most important shot; the slowness is what unnerves. (Write the threat as a figure/form/shape, never a named person — see FILTER-SAFE PHRASING in the core rules.) A reveal seen in a mirror / window / dark glass is still just a photograph — compose it however THIS moment reads scariest; the only requirement is that it looks like ONE real photograph of a real place, never a composite.
DARKNESS: night beats are shadow-DOMINATED — ceiling, far corners and deep background fall to black, NOT lit like an evening room. But the shot's KEY SUBJECT must stay clearly READABLE: the ONE light source (a weak lamp, a candle, a phone screen) actually lands on the subject and the nearest surfaces so the focal action reads at a glance, with darkness closing in AROUND it — a pool of light eaten by shadow, never a frame that's black where the subject is. Deep rural night has NO usable moonlight, so every window/opening is a near-BLACK rectangle, nothing visible outside (a glowing 3 AM window is the #1 mistake).`,
  informational: `GENRE — INFORMATIONAL / NEWS / EDUCATIONAL: clarity first. The key subject is sharp and prominent (centred or on a third), legible at a glance; neutral, even lighting; clean, uncluttered framing. Show the actual thing being explained — the object, place, person, or data — not mood for its own sake. MAKE THE INVISIBLE VISIBLE: scale and abstraction become physical comparisons staged in ONE frame (the thing beside a hand, a coin, a doorway; the two quantities side by side) — the frame does the explaining, the narration only confirms it. One idea per frame; a shot that teaches two things teaches neither. TEXT NEVER CARRIES THE FACT: image models garble written words — no charts, labels, or sentences the viewer must read; render the physical comparison instead, and leave clean space where the caption layer will put the exact number. THE PEAK: the comparison or revelation made visually undeniable in a single clean frame — the before beside the after, the assumption beside the fact — composed so a muted viewer still gets it.`,
  lifestyle: `GENRE — LIFESTYLE / FOOD / TRAVEL: bright, inviting, aspirational. Natural or warm light; the subject hero-lit, fresh and appealing (appetizing food, scenic place); vibrant but not garish; clean negative space. SENSORY CLOSE-UPS carry desire: the steam rising, the crust breaking, the pour, the light through the window — texture the viewer can almost touch, usually with human hands DOING (not posing). Keep it lived-in real, not showroom-sterile: one honest imperfection (a crumb, a worn table) makes the rest believable. THE PEAK: the payoff moment — the first bite, the door opening on the view, the finished thing — close, warm, and luscious; the single frame that makes the viewer want it. Motion stays gentle: linger, slow push, a hand entering frame.`,
  drama: `GENRE — DRAMA / HUMAN STORIES: intimacy over spectacle. The feeling lives in hands, objects, and rooms — the plate still set, the coat on its hook, a text left on read — more than in faces; when a face carries a beat, it's turned away, half-lit, or caught unaware, never performing grief at the lens. Warm-muted natural light (window light, lamp light, overcast day); nothing stylized. USE ABSENCE: the empty side of the bed, the second chair, the negative space where someone should be — emptiness composed deliberately reads as loss without a word. Hold frames still and let them breathe; the camera never rushes a wound (linger, slow push, hold — a drama that cuts fast feels like an ad). THE PEAK: the smallest human gesture seen close — a hand not letting go, a name still first in the contacts, the plate finally cleared — an intimate close-up that lands soft and heavy, never a shock reveal. Restraint in the frame mirrors restraint in the telling.`,
  commentary: `GENRE — COMMENTARY / OPINION: show the receipts. The visual language is evidence — documents, screens, storefronts, price tags, the actual place or thing under discussion — shot plainly, like news inserts. Clean, neutral-to-cool light; frames composed for credibility, not mood. CONTRAST IS THE ARGUMENT: the promise beside the reality, the ad beside the receipt, then beside now — put the two truths in comparable frames (or one frame) and let the gap speak. TEXT NEVER CARRIES THE FACT: image models garble written words, so a document reads as "a dense printed page", a screen as "a glowing chat thread" — texture and form, never legible sentences the viewer must read; the exact number or quote belongs to the caption layer, so compose the frame with clean space for it. THE PEAK: the single most damning piece of evidence filling the frame — the paper, the storefront, the empty lot where the project should be — plain, sharp, undeniable. The frame states; the narration argues.`,
  reddit_story: `GENRE — CONFESSION / REDDIT STORY: phone-real, never cinematic. Frames look like life caught, not composed — home interiors with clutter, the kitchen counter, a parked car, fluorescent office light; eye-level, slightly imperfect, the way a real person's photo roll looks. Nothing staged, nothing moody, no dramatic grades — over-produced frames break the "this actually happened" spell. THE DRAMA LIVES IN ORDINARY OBJECTS: the wedding invitation, the Tupperware, the group-chat screen glow, the receipt on the table — mundane things photographed like they matter, because in this story they do. THE PEAK: the object or scene that proves the story — shot plainly, close enough to read, like evidence photographed on a phone to show a friend. The more mundane the frame, the more believable the bomb inside it.`,
  comedy: `GENRE — COMEDY: clarity is the punchline's oxygen — comedy dies in shadow and in crops. Bright, even, almost flat light (daytime-sitcom plain); the absurd thing shown WHOLE and in focus, framed with deadpan matter-of-factness — a centered, symmetrical, almost bureaucratic composition of something ridiculous IS the joke. Play the frame straight: the more absurd the content, the more mundane and orderly the shot (document it like real estate photography, never wacky angles or fisheye — the composition never laughs at its own joke). REACTION LOGIC: alternate the absurd thing (plain, full view) with the unbothered or quietly devastated face; the gap between them is where the laugh lives. Escalation = the SAME calm framing, one notch worse content each time. THE PEAK: the full absurd picture finally seen WHOLE — often a step WIDER, not tighter, so the entire situation lands in one look (the reveal of just how far this has gone). Never darken or dramatize a funny beat; a moody grade smothers it.`,
  childrens: `GENRE — CHILDREN'S STORY: bright, warm, storybook wonder — safe and delightful, never dark or frightening. Soft, rounded, colorful shapes; friendly light (golden afternoon, a cozy lamp, gentle moonlight for bedtime); a small, endearing hero (a child or a friendly creature) the eye loves. SHOW THE WONDER AS DELIGHT: the glowing thing, the kind creature, the magical-but-safe moment — awe a child would gasp at, never a scare. ORDINARY MADE MAGICAL: render an everyday thing (crayons, a cloud, a sock, a star) turning marvelous-but-safe. Room for GENTLE VISUAL HUMOR — a silly mix-up, an exaggerated happy face, a clumsy friendly creature; playful, never mean. Keep any problem or danger GENTLE and always tilting back toward safety. THE PEAK: the warmest, most wondrous or reassuring beat — the hug, the friend found, the light coming on, the safe landing home — a soft, glowing, storybook image. Motion is gentle and playful. NEVER dark, gory, threatening, or lonely-sad; render nothing a child shouldn't see right before sleep.`,
  fairytale: `GENRE — FAIRYTALE: timeless STORYBOOK ILLUSTRATION, never photoreal and never a slick 3D render. Painterly, enchanted, archetypal — the look of a classic illustrated fairy-tale book (watercolor, oil, or ink), hand-illustrated and ancient-feeling. Warm golden or moonlit-silver light, deep storybook color, soft edges. THE MAGIC IS SYMBOLIC: render the enchanted element (the cursed rose, the endless winter, the glowing gift, the tiny fairy) as ONE wondrous focal image that carries the story's feeling — awe, or a beautiful unease — never cheap spectacle. Real shadow is allowed (a fairytale can pass through darkness), but the frame always keeps a thread of light or hope; never grimdark, never gory. THE HERO is small and ordinary against a vast, ancient world — the tiny figure at the forest's edge, dwarfed by the wonder. THE PEAK: the wondrous or RESTORATIVE turn — the forest blooming, the curse lifting, the helper appearing, spring returning — a luminous storybook image. Keep places archetypal and instantly readable (misty forest, forgotten castle, moonlit meadow, enchanted bridge), never cluttered with realistic detail.`,
  general: ``,
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const frame = v.aspect === '16:9' ? 'widescreen (16:9) narrated videos' : 'vertical (9:16) narrated reels'
  const system = `You are a storyboard director for ${frame}.

CHANNEL GENRE / NICHE: ${v.nicheDescription}
Compose every shot in the visual language of THIS genre — show what it shows, imply what it implies. Do NOT import conventions from other genres. Match the genre.

STORY BIBLE — the recurring people, places, and objects in THIS reel, each with a fixed id and a canonical look:
${v.bibleEntitiesJson}
The system AUTOMATICALLY splices each entity's canonical description into the image — so do NOT re-describe a bible entity in imagePrompt. Instead REFERENCE it by its exact id (in primaryEntity / supportingEntities) and write only what it is DOING. Reuse the SAME id every time the same thing reappears. If a subject is NOT in the bible, describe it inline in imagePrompt (fix its traits on first appearance, reuse them on return). If a bible entry conflicts with the narration, the narration wins.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const peakBlock = v.peakMoment.trim()
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so it lands as its own shot. FRAME THE PAYOFF SO IT DOMINATES: if your GENRE section below defines "THE PEAK", that grammar governs this shot (a comedy payoff wants the whole picture; a drama payoff wants the small gesture close). Otherwise default to a tight push-in — an extreme close-up on the one thing the line pays off, filling almost the entire frame, any other person at most a partial sliver at the edge (cameraMove: push_in); a payoff seen wide with no genre reason reads small. If the payoff's real geometry (a reflection, a doorway, a comparison) needs more room, you judge the tightest frame that keeps it landing in one believable photograph.`
    : ''

  // Prefer the channel's LLM-derived category; fall back to keyword classification for older channels.
  const module = asGenreModule(v.genreCategory) ?? classifyGenre(v.nicheDescription)
  const genreModule = GENRE_MODULES[module]
  const moduleBlock = genreModule ? `\n\n${genreModule}` : ''

  // Perspective is authoritative from the Story Bible when known; otherwise the director detects it.
  const POV_RULE = 'FIRST-PERSON → POV: the camera IS the narrator\'s eyes; every shot is what THEY see (never the narrator as a separate full figure; their hands/feet/shoulder may edge the frame). Write POV as a CONCRETE COMPOSITION, never the bare word "POV" — image models render a described frame far better than the abstract instruction. Anchor the near foreground with something that belongs to the narrator (a hand, a forearm, the back of their head/shoulders) and place the subject in the space beyond it. A REFLECTION beat (a mirror, a window, dark glass) is the ONLY time the narrator\'s own face is on screen — YOU choose how to compose the reflection shot for this moment; just keep the narrator a reflection/back/partial, never a front-facing figure staring into the lens. The system locks the narrator\'s appearance on reflection beats automatically, so you never need to tag them — just write the shot. QUIET BEATS ARE STILL POV: when little happens (the narrator waiting, uneasy, thinking, "standing" somewhere), do NOT fall back to describing HER as a standing/facing figure ("the narrator stands facing forward") — that is the #1 POV failure and, since her look is only locked in reflections, it renders a DIFFERENT person each shot. Instead frame what she SEES (the empty space, the object of her unease, a telling detail) or her hands / the back of her head in the near foreground. The narrator is a full FIGURE only in a reflection.'
  const OBSERVER_RULE = 'THIRD-PERSON → observer framing: show the character(s).'
  // Voiceover = a NON-DIEGETIC narrator (a voice above the story's world). Probe-validated wording
  // (hypotheses/voiceover-perspective.md Phase 0). Judgment-framed with a goal + a named failure mode —
  // never shot quotas (unbiased-design).
  const VOICEOVER_RULE = `this reel is VOICEOVER — the narrator is a voice above the story's world, NOT a person in it. The narrator NEVER appears in any form: no POV framing, no narrator hands/shoulders/reflection, no host, no presenter, no reporter, and the word "narrator" never appears in an imagePrompt. Every shot answers "what is the narration claiming right now?" with something SEEN — the thing, the place, the comparison, the change — so a viewer with the sound OFF still follows the argument's objects. THE FAILURE MODE IS WALLPAPER: a shot that would board equally well under any other script on this topic teaches nothing — make each shot specific to its span's claim (its load-bearing noun, quantity, or comparison rendered as a physical, visible thing), never topic-level scenery. People appear ONLY when the narration's content itself places them (per CAST CONTROL), framed per the static-pose rules; environment, object, concept, and data-visualization shots are all valid; any beat may be people-free.`
  const perspectiveRule =
    v.narratorPerspective === 'first_person'
      ? `this reel is FIRST-PERSON. ${POV_RULE}`
      : v.narratorPerspective === 'third_person'
        ? `this reel is THIRD-PERSON. ${OBSERVER_RULE}`
        : v.narratorPerspective === 'voiceover'
          ? VOICEOVER_RULE
          : `detect the narration's voice via the PARTICIPANT TEST, and apply ONE perspective to the whole reel. Did the teller LIVE the events (a participant telling what happened to them), or is the teller REPORTING/EXPLAINING/ARGUING about events from outside them (news, explainer, essay, recap)? Pronouns are evidence, participation is the verdict — first-person cues appear in both kinds of narration. REPORTING/EXPLAINING (voiceover) → ${VOICEOVER_RULE} LIVED FIRST-PERSON ("ako", "ko", "nakita ko", "I", "my") → ${POV_RULE} ${OBSERVER_RULE}`

  // Story-wide visual constraints from the bible (deviations from the genre default only).
  const notesBlock = v.directorNotes?.length
    ? `\n\nSTORY-WIDE DIRECTION (apply to every relevant shot):\n- ${v.directorNotes.join('\n- ')}`
    : ''

  // The journey is GROUND TRUTH the director must obey: which place each span is in, and who is present.
  // It fixes "characters already in the CR" and invented cast by removing the guess about where/who.
  const journeyBlock = v.journey?.length
    ? `\n\nJOURNEY — GROUND TRUTH (obey EXACTLY; never place anyone anywhere this contradicts). Each leg is a span of the narration:\n${v.journey
        .map((lg, i) => {
          const loc = lg.locationEntityId
            ? `INSIDE location "${lg.locationEntityId}"`
            : `a TRANSIT space "${lg.locationLabel}" — NOT inside any bible location; tag NO location entity, describe the space inline`
          const vis = lg.visible && lg.visible.length ? lg.visible.join(', ') : lg.present.join(', ') || 'no one'
          const span = lg.span.length > 70 ? `${lg.span.slice(0, 70)}…` : lg.span
          const reflectionNote = lg.isReflection
            ? '; REVEAL — give this leg its OWN dedicated scene (never merge it into a neighbour): open on the threat/apparition, so primaryEntity MUST be that threat character — UNLESS that threat has no physical form (a voice, a whisper, a presence), in which case open on the witness\'s reaction or the real thing it affects and tag THAT as primaryEntity, never the bodiless presence (see A BODILESS THREAT IS NEVER GIVEN A FORM).'
            : ''
          const appearance = Object.entries(lg.appearanceByEntity ?? {})
            .map(([entityId, appearanceId]) => `${entityId}=${appearanceId}`)
            .join(', ')
          const appearanceNote = appearance ? `; EVENT-TIME IDENTITY STATE: [${appearance}]` : ''
          return `  ${i + 1}. "${span}" → ${loc}; present: [${lg.present.join(', ') || 'no one'}]; on-camera: [${vis}]${appearanceNote}${reflectionNote}`
        })
        .join('\n')}\nFor EACH scene: tag ONLY the location entity of the leg its narration falls in (or none, for a transit leg); include ONLY the characters that leg lists as present; NEVER add a person who isn't there. EVENT-TIME IDENTITY STATE tells you which frozen state of a person, place, or object the leg depicts. Usually copy it into the scene's appearanceByEntity when that entity is visible. You may instead keep the shot in an established framing scene by using the parent/default state and writing that framing action clearly. Do not switch accidentally, invent a state, or show two states of one identity in a single frame. Cut at the boundary when you dramatize the state change. A leg marked REVEAL is the payoff — it is ALWAYS its own scene, opening on the threat (primaryEntity = the threat).`
    : ''

  // Chapter context (long-form): the director sees the arc + where the last chapter left the world, so
  // the seam cuts CONTINUOUS instead of re-opening the video. Chapter 1 opens the video as usual.
  const chapterBlock = v.chapter
    ? `CHAPTER ${v.chapter.idx} of ${v.chapter.count}: the narration below is ONE chapter of a longer story — whole-story arc, for context only: "${v.chapter.logline}". Storyboard ONLY this chapter's narration.${
        v.chapter.idx > 1
          ? ` The previous chapter ended ${v.chapter.prevLocation ? `at "${v.chapter.prevLocation}"` : 'mid-story'}${v.chapter.prevNarration ? ` on the line "${v.chapter.prevNarration}"` : ''} — this chapter continues from that exact world-state. Cut its first scene as a CONTINUATION (the next beat of the same moment, or the story's own next move), never as a fresh title-style opening of the whole video.`
          : ' This chapter OPENS the video.'
      }\n\n`
    : ''

  const userMessage = `${chapterBlock}Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension, NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order. Keep every scene SHORT: no single scene should cover more than ~16 seconds of spoken narration (roughly 40 words) — one image or clip held longer than that goes visually DEAD on a phone (the #1 pacing failure). If a beat's narration is long, CUT IT into consecutive shots that each advance the visual (a new angle, tighter framing, the next action, a telling detail), never restating the same frame. On a longer story this means favouring the UPPER end of the ${v.minScenes}–${v.maxScenes} range so no shot drags — but NEVER produce more than ${v.maxScenes} scenes. ONE PHYSICAL MOVEMENT PER SCENE: each scene is a single beat of action in a single place — do NOT collapse an approach and the arrival into one shot. "Walking toward a room" and "inside that room" are SEPARATE scenes; give the journey (leaving one place, moving through another, entering the next) its own beats instead of jumping straight to the destination.${peakBlock}

Narration:
"""${v.narration}"""${journeyBlock}

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration this scene covers (copy-paste exactly, no "…").
- primaryEntity: the bible id of the ONE thing this shot leads with — it MUST be the same subject your imagePrompt OPENS on. Do not lead the imagePrompt with one thing and tag a different thing as primary. On a reveal/payoff you open on the threat/apparition, so THAT is the primaryEntity — even in a first-person reel where the narrator's reflection or body is also in frame, the narrator goes in supportingEntities, NOT primary. (Tagging the narrator primary on a reveal splices the narrator's face onto the shot and you get the narrator instead of the threat.) Use null if the subject you lead with is NOT a bible entity (a shadow, the narrator's own hands).
- supportingEntities: the bible ids of the other recurring bible things visible in this shot. Include the scene's LOCATION entity here — but ONLY the place the scene is physically IN, NOT a place the character is merely HEADING TOWARD. A "walking toward a room" beat is set in the space they pass through (a hallway, a path, a yard), not inside that room — don't tag it with the destination (that drops them inside it); tag the place actually on screen. Also include the NARRATOR entity whenever their own reflection or body is visible (see PERSPECTIVE), so their appearance is locked. Use exact ids; never invent one.
- appearanceByEntity: the exact non-default identity state THIS SHOT depicts, as { "entity-id": "appearance-id" }. Usually copy the journey leg's EVENT-TIME IDENTITY STATE when dramatizing its action. Use {} for every parent/default state, including an intentional shot that stays on the present-day teller while remembered narration continues. Bind only entities tagged in this scene, use only appearance ids present under that entity in the Story Bible, and never bind two states for one identity.
- imagePrompt: a VIVID, SPECIFIC description of this exact shot — aim for 45–75 words, not a terse tag list. Cover concretely: WHO is in frame and the precise action they are caught MID-doing (their posture, what their hands are doing, their expression, and where their gaze goes — at the object, at each other, into the dark — NOT into the camera); the shot size + camera angle; one foreground element for depth; the ACTIVE light source + its direction; the texture of the place. Show people ABSORBED in the moment — candid, mid-motion, never posing or staring into the lens (a person facing the camera doing nothing is the #1 failure). Refer to bible entities by a natural label only ("the mirror", "the friend") — the system splices their look; describe NON-bible subjects inline. No style, medium, or colour-grade words (the system owns the look).
- sceneIntent: a short phrase for what the audience should NOTICE first in this shot (e.g. "the reflection before the woman", "the shadow under the door").
- cameraMove: the ONE camera move that best fits this beat — choose from: drift (slow, subtle), push_in, pull_out, pan_left, pan_right, tilt_up, tilt_down, handheld (loose, immediate), locked (almost still). Match it to the beat: push_in for emphasis, pull_out for a reveal, locked for observation/stillness, drift for atmosphere, handheld for immediacy, pan/tilt to follow or discover.
- subjectMotion: OPTIONAL, and only meaningful when this beat is tier "video". What the SUBJECT itself DOES on screen — above all a horror scare/reveal, where the THREAT is what moves. Write ONE short, concrete, SLOW motion (e.g. "her blank dead stare slowly splits into an impossibly wide grin, too many teeth baring", "the tall figure looms slowly closer, swelling to fill the frame", "her head tilts slowly, unnaturally, to one side, eyes never blinking"). One motion only — never a list, never frantic; the slowness is the dread. Leave it "" for any beat where only the CAMERA moves (an establishing shot, an atmosphere beat, and every "still" beat). On a scare/reveal beat DO fill it, and pair it with cameraMove:push_in so the frame closes in as the threat moves.
- tier: "video" for up to ${v.maxVideoTiers} of the most visually DYNAMIC beats — ${!v.chapter || v.chapter.idx === 1 ? 'always include the opening; ' : ''}"still" otherwise. At most ${v.maxVideoTiers} video.
- mood: 2–3 words for ambient/grade hints.
- location: a short canonical label for WHERE this scene is (e.g. "rented bedroom"). Same label for the same place; a new label only when the place actually changes.

ENGLISH ONLY (every genre): the imagePrompt, sceneIntent, location label, and mood MUST be written in ENGLISH — the image model does not understand Tagalog/Taglish and renders a non-English word as the WRONG thing or fails outright (e.g. "salamin ng banyo" rendered a lab bench, not a bathroom mirror). TRANSLATE every place, object, action, and time word to English: banyo/CR → "restroom", salamin → "mirror", eskwela → "school", gabi → "night", reloh → "clock". Reference a bible entity by an ENGLISH natural label ("the mirror", "the restroom", "the friend") — NEVER its raw id and NEVER a Tagalog phrase, even when the entity's id is Tagalog. Only the narration/voiceover stays in its original language; everything you write to describe the SHOT is English.

NEVER A CAMERA-FACING, STATIC POSE (every genre): a person standing still, front-on, looking into the lens and doing nothing is the SINGLE most common failure and reads as dead. EVERY shot with a person MUST specify (a) the concrete action they are caught MID-doing (reaching, turning, stepping, gripping, leaning, wiping) and (b) exactly where their gaze goes WITHIN the scene — at the object, at the other person, down, into the dark — anywhere but the camera. Prefer three-quarter, profile, over-the-shoulder, or from-behind angles over a flat frontal one. If the beat is genuinely a person alone doing little, give them a small real action and an off-camera gaze; a POV/first-person reel avoids this by construction (the camera is their eyes — never frame the narrator front-on).

VISUAL PRIORITY (every genre): each imagePrompt MUST begin with the most important VISIBLE thing — the specific subject, person, or action the line is about — never the setting it merely sits in. The setting is context, not the shot. Lead with the collapsed bridge, not the city skyline; the crispy pork belly on the board, not the kitchen; the couple boarding the banca, not the beach; the shadow under the closed door, not the empty hallway. If the line has no concrete subject, lead with the single detail that carries its meaning.

CONTINUITY: recurring people, places, and objects in the STORY BIBLE are already pinned — reference them by id (primaryEntity / supportingEntities) and NEVER redescribe them; the system splices their canonical look identically every time. An entity with depictionMode "reference_plate" is a verified real identity: tag it whenever that EXACT real subject and state is visibly depicted so its source anchor reaches the render. Do not tag a generic precursor, replica, counterfactual, wrong-era version, or merely mentioned subject; use appearanceByEntity when the bible exposes the exact state shown. For anything NOT in the bible, each image is generated independently, so it reads as the SAME one ONLY if you describe it the same way every time: fix its defining traits on first appearance and reuse them near-verbatim on every return; never redesign it.

LIGHTING & TIME: match the narration's time of day (incl. Tagalog cues) by naming the physical light source(s) present or implied in THIS place — not a label, and not a default. Night / gabi / madaling-araw / 3 AM → light only by what genuinely exists there: a lamp or candle in a rural bedroom, but stall lights and neon in a night market, streetlights and signage on a city road, a screen, a fire. Do NOT assume night means a dark room — a brightly lit night scene is correct when the place has light. Day / umaga / tanghali = daylight; dusk/dawn = low ambient. (How DARK a night gets, and whether windows go black, is a genre decision — see the genre module if one applies.)

SHOW ONLY WHAT IS SEEN: depict what the narrator actually sees. If something is only HEARD (a voice, a knock) or FELT and never said to be SEEN, do NOT render its source — render the visible reaction and the space around it, not an invented source. Only depict people, objects, or events the narration explicitly says are visible.

A BODILESS THREAT IS NEVER GIVEN A FORM (every genre): when the threat has no physical body — a whisper, a voice, a "presence", a cold, anything only heard or felt (a bible entity whose description says "no visible form" / "a presence") — do NOT draw it, and NEVER render it as smoke, mist, fog, swirling or reaching shadows, "distorted air", a face forming out of the dark, or a shape "taking form". An image model handed a formless presence produces exactly that vapor-and-distorted-figure look, which reads instantly fake and wastes the shot. Render instead (a) the WITNESS — their face caught in the discovery, frozen, flinching, eyes going to where the sound is; their hands — and (b) the CONCRETE real thing the threat acts on (the object that moved, the coin that came back, the phone, the latch), under one hard discovery-light. The dread lives in the human and the ordinary object, never in a rendered "presence". This OVERRIDES any instruction below to "open on the threat/apparition": if the threat is bodiless, open on the witness or the physical effect, tag THAT as primaryEntity, do NOT list the bodiless presence in primaryEntity or supportingEntities (it has no look to splice), and keep subjectMotion to real physical motion (a trembling hand, a coin settling, a door easing) — never swirling or reforming vapor/shadow.

DESCRIBE PRESENCE, NOT ABSENCE: each imagePrompt must state only what IS in the frame, never what is absent. The image model reads "no sink", "without a mirror" or "strictly no X" as a cue to DRAW that very thing — so to keep something OUT, describe what fills that space instead, leaving no room for the unwanted element (e.g. to keep a fixture out of a cramped interior: "the walls press in close on both sides", not "no sink"). Never write "no", "without" or "strictly no" in an imagePrompt.

FILTER-SAFE PHRASING (every genre): when a PERSON is depicted dead, a corpse, a victim, bloodied or gravely injured, or as a supernatural / menacing presence, describe them with NON-PERSON words — "a figure", "a form", "a shape", "it" — NEVER "a woman / man / girl / boy" or "her / him" for THAT subject. Naming a person in such a state trips the image model's safety filter and the shot fails to render entirely; the exact same subject described as "a figure / form" renders an identical image and passes. This holds in ANY genre — a news tragedy, a true-crime victim, a horror apparition. But ORDINARY, living, unharmed people stay PEOPLE — describe them normally (a woman, the friend, a chef); this rule is ONLY for the dead, harmed, menacing, or supernatural.

CAST CONTROL: only the people the narration actually places in this scene appear in frame — NEVER invent background extras, passers-by, bystanders, or a crowd the story doesn't mention. Frame exactly who the beat names; if the narration says the place is empty or the narrator is alone, show the space deserted around them. Stating who is present (and that the rest is empty) stops the model populating the background with strangers.

REAL PARTIES ARE NEVER STAGED (every genre): when the narration names an identifiable real living person (an official, executive, athlete, celebrity, or private individual) or a named real organization's people or events (its officials, spokespeople, meetings, signings, ceremonies, announcements), NEVER write a shot that depicts that party as if photographed at an event — no staged handshakes, podium moments, boardrooms, raids, or ceremonies attributed to the named party. Rendered photoreal, such a frame is a fabricated press photo: a false record of real people at an event that never happened. Depict the beat's SUBSTANCE through representative, anonymous, or conceptual imagery instead: the real place or object itself, documents and maps as physical things, unbranded working hands, a distant non-identifiable figure, symbolic staging (two flags on an empty table, a signed page, an empty podium). Describe that anonymous staging POSITIVELY (see DESCRIBE PRESENCE, NOT ABSENCE), never "no faces". This triggers on IDENTITY, not on people: ordinary unnamed people (a vendor, a nurse, a crowd) stay people, and fictional characters are untouched — the trigger is a real name, a real office or title, real insignia, or context that points at one specific real party. Under an explicitly illustrative, never-photoreal rendering profile, reconstruction is governed by that profile's own contract — but no render, in any style, is ever presented as an authentic photograph of a real event.

PERSPECTIVE: ${perspectiveRule}

BE TRUE TO THE BEAT: depict what is literally happening in THIS line — including the subject's exact POSTURE and what any device/screen actually shows. If the action implies sitting, show them seated; if they are reading a message, the phone shows a text-message screen (not a camera viewfinder or home screen); match the real activity, not a generic stand-and-pose. If the narration says something is missing, lost, forgotten, or left behind, do NOT show it; if a character is going TO LOOK FOR an object, they don't have it yet (don't hand them the thing they're searching for). Keep each shot to ONE clear focal action — don't stack competing subjects or effects into a single frame, or it renders as a muddled, illegible image.

ATTEMPT IS NOT OUTCOME: when the narration says something was submitted, proposed, requested, attempted, nominated, or brought somewhere but then rejected, excluded, refused, cancelled, or never used, do NOT stage the successful outcome. A submission is a handoff/entry/threshold beat, not public display or acceptance; a proposal is not a completed project; a rejected subject is not shown occupying the place it was denied. Show only the state the narration has reached in that span.

PROGRESSION & VARIETY: the reel is a sequence, not similar stills. Each scene must ADVANCE the reel with new visual information — never restate the previous shot as the same moment from a slightly different angle unless the narration genuinely lingers there. Don't repeat the same shot size / distance / focal point on consecutive scenes; vary framing (wide, medium, close, low/high). BUT when consecutive scenes are about the SAME subject, keep that subject the recognizable focus — don't cut to an unrelated environment shot.

ENCLOSED SPACE (every genre): when consecutive scenes sit INSIDE the same small enclosed space (a toilet cubicle, a car interior, an elevator, a confessional — the journey keeps the same interior location across those legs), frame them TIGHT and from WITHIN, with the door CLOSED: the latched/locked door, the narrator's own hands, the phone screen, the gap under the door, the partition walls pressing close. NEVER cut to a wide shot of the person standing out in the open room, and NEVER have them wander out of the space until the narration says they leave. Imply mundane business (using the toilet) — never depict it; show the tension (a gripped latch, a held breath, eyes on the door gap) instead. VARY within the box: a different tight detail each beat (the door, then the hands, then the phone, then the floor gap), not the same framing repeated and not an escape to a bigger space.

SAFETY (all genres): no gore, no graphic violence, no nudity/sexualization, no minors in harmful or sexual contexts.${moduleBlock}${notesBlock}

OUTPUT (JSON only):
{
  "scenes": [
    { "idx": 1, "narrationText": "complete verbatim substring", "primaryEntity": "cracked-mirror", "supportingEntities": ["the-tenant"], "appearanceByEntity": {}, "imagePrompt": "the tenant steps toward the glass, medium shot from behind their shoulder, dust adrift, the bare bulb throwing weak light from above", "sceneIntent": "the reflection before the figure", "cameraMove": "push_in", "subjectMotion": "", "tier": "still", "mood": ["tense", "quiet"], "location": "rented bedroom" }
  ]
}`

  return { system, userMessage }
}
