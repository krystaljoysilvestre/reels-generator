// Deterministic QA for a scene breakdown — pure, no LLM, cheap to run on every reel.
// Complements validateSceneTiling (gaps/coverage/order, enforced in breakdown_scenes): this covers the
// checks that tiling + the Zod schema DON'T — peak placement, tier discipline, and image-prompt hygiene.
//
// Two severities, by design:
//   - errors:   structural violations worth one LLM repair round (peak split across scenes, too many
//               video tiers). Things the model can fix and that genuinely hurt the reel.
//   - warnings: image-prompt hygiene + soft misses (style-word leakage, leading with the setting,
//               location-label drift, count outside the suggested range). Surfaced for observability so
//               real failures accumulate; never block a render on a heuristic.
//
// idx integrity is NOT checked here — it's fixed deterministically at persist time (idx = narration
// order), which is more robust than asking the LLM to renumber.

import { slug } from './story-bible.js'
import type { BibleEntity, JourneyLeg } from '../types/story-bible.js'

export interface SceneQAScene {
  narrationText: string
  imagePrompt: string
  tier: 'still' | 'video'
  location: string
  primaryEntity?: string | null
  supportingEntities?: string[]
  subjectMotion?: string // the SUBJECT's on-screen motion (video beats); '' = only the camera moves
  sceneIntent?: string | null
}

export interface SceneQAInput {
  narration: string
  // Chaptered breakdown: `narration` is the CHAPTER's text (drives count/duration checks), while the
  // journey legs live in the whole story — pass it here so journey grounding still resolves. Absent →
  // narration (whole-reel callers unchanged).
  fullNarration?: string
  peakMoment: string // '' when the reel has no designated peak
  minScenes: number
  maxScenes: number
  scenes: SceneQAScene[]
  // Phase 2A grounding (optional/back-compat): when present, location + cast are validated against the
  // journey (the independent world-state), not just the scene's own self-consistency.
  bibleEntities?: BibleEntity[]
  narratorEntityId?: string | null
  journey?: JourneyLeg[]
  // Reel-wide embodiment (from the bible). 'voiceover' arms the no-host/no-POV check below — a voiceover
  // reel's narrator has no body, so any narrator/host/POV framing is a structural error worth a repair
  // round. Absent → no perspective-specific check (legacy callers unchanged).
  narratorPerspective?: 'first_person' | 'third_person' | 'voiceover' | undefined
  // Video-tier cap for THIS set of scenes (a chapter gets its per-chapter allocation; a whole short reel
  // gets the flat budget). Absent → MOTION_BUDGET, so legacy callers are unchanged.
  maxVideoTiers?: number
  // False when these scenes are a mid-story chapter — "the opening scene should be video" only applies
  // to the scenes that actually open the video. Absent → true (legacy whole-reel callers).
  isOpening?: boolean
}

export interface SceneQAResult {
  errors: string[] // → trigger an LLM repair round
  warnings: string[] // → logged only
}

// Motion budget: the max scenes that become tier "video" (i2v-animated). i2v is the most expensive op in
// the pipeline (~$0.35/clip), so this is the natural subscription lever — later resolved per plan rather
// than a constant. Single source for both the cap enforced here and the "at most N video" line in the
// scenes prompt (breakdown passes it into buildScenesPrompt).
export const MOTION_BUDGET = 3

// Duration-scaled budget: short reels keep the flat 3; past 3 minutes a flat 3 starves the runtime of
// motion (3 clips across 10 minutes reads as a slideshow), so scale ~1 clip / 90s, capped at 8 (~$2.80
// of i2v) as the cost ceiling. Deterministic — the breakdown allocates these across chapters.
export function motionBudgetForSeconds(seconds: number): number {
  if (seconds <= 180) return MOTION_BUDGET
  return Math.min(8, Math.round(seconds / 90))
}

// A scene's shot stays on screen for as long as its narration is spoken. Estimate that span from the word
// count at the project's canonical speaking rate (the same 2.5 wps the music/timing estimators use) so QA
// can catch a shot held so long it goes visually DEAD — the "undersplit" failure (a 51s still reads as a
// frozen frame). This is an EGREGIOUS-length guard, not ideal pacing (the count range handles pacing):
// 16s is well past a comfortable phone-reel shot yet stays satisfiable inside the 16-scene schema cap for
// stories up to ~250s. Long stories are fine; long single SHOTS are not.
export const WORDS_PER_SEC = 2.5
export const MAX_SCENE_SEC = 16
export function estimateNarrationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return words / WORDS_PER_SEC
}

// Style/medium words the image prompt must NOT contain — the system owns the look.
// Kept tight + word-boundary matched to avoid false hits (e.g. "render" inside "tenderness").
const STYLE_LEAK_WORDS = [
  'cinematic', 'photograph', 'photorealistic', 'photo-realistic', 'hyperrealistic', 'hyper-realistic',
  'painting', 'illustration', 'render', 'octane', 'unreal engine', '4k', '8k', 'ultra hd', 'hdr',
  'color grade', 'colour grade', 'color-graded', 'film grain', 'bokeh',
]

// Openers that signal the prompt leads with the SETTING/shot rather than the subject (VISUAL PRIORITY).
// Heuristic — a warning, not an error. Matched at the very start of the prompt, case-insensitive.
const SETTING_FIRST_OPENERS = [
  'a room', 'an empty', 'a dark room', 'the room', 'interior', 'a wide shot', 'wide shot',
  'an empty room', 'a kitchen', 'the kitchen', 'a hallway', 'the hallway', 'a landscape', 'a view of',
  'establishing shot', 'a establishing', 'an establishing',
]

function norm(s: string): string {
  return s.trim().toLowerCase()
}

// Two location labels likely name the SAME place if one contains the other as a whole-word phrase
// (e.g. "bedroom" vs "rented bedroom"). Same-place labels MUST match exactly or they break the
// per-location seed that keeps a room continuous across shots.
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function labelsLikelySamePlace(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  if (x === y) return false
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return new RegExp(`\\b${escapeRe(short)}\\b`).test(long)
}

// A scene's `location` label names the SAME place as a location entity when: the humanized id equals the
// label, one contains the other as a whole-word phrase ("restroom" ↔ "school-restroom"), or the label
// appears whole-word in the entity's description. Used to catch a scene tagging a location it isn't in.
function labelMatchesLocationEntity(label: string, e: BibleEntity): boolean {
  if (!label.trim()) return false
  // Compare on slugs so "school-stage" (a label that copied the id) and "school stage" both match id
  // "school-stage" — hyphens vs spaces must not cause a false mismatch. \b treats a hyphen as a boundary,
  // so whole-word containment ("restroom" in "school-restroom") still works on slugs.
  const l = slug(label)
  const id = slug(e.id)
  if (!l) return false
  if (l === id) return true
  const [short, long] = l.length <= id.length ? [l, id] : [id, l]
  if (new RegExp(`\\b${escapeRe(short)}\\b`).test(long)) return true
  if (new RegExp(`\\b${escapeRe(norm(label))}\\b`).test(norm(e.description))) return true
  return false
}

// Map a scene to the journey leg that covers the START of its narration span (same offset technique as
// validateSceneTiling). Returns null when the span can't be located (→ skip journey-grounded checks; never
// a false error).
function legForScene(scene: SceneQAScene, journey: JourneyLeg[], narration: string): JourneyLeg | null {
  const at = narration.indexOf(scene.narrationText.trim())
  if (at === -1) return null
  for (const leg of journey) {
    const span = leg.span?.trim()
    if (!span) continue
    const legAt = narration.indexOf(span)
    if (legAt !== -1 && at >= legAt && at < legAt + span.length) return leg
  }
  return null
}

// Person nouns that signal a human in frame (for cast + static-pose heuristics). Word-boundary matched.
const PERSON_NOUN_RE = /\b(boy|man|men|woman|women|girl|child|children|kid|figure|hand|hands|arm|arms|shadow|silhouette|crowd|people|person|bystander|passer-?by|stranger|guard|nurse|doctor|teacher|classmate|friend)\b/i
// Action / gaze verbs (stemmed, no trailing boundary so conjugations match). Their ABSENCE next to a person
// signals a static, likely camera-facing pose.
const ACTION_VERB_RE = /\b(reach|turn|step|grip|lean|wip|look|gaz|glanc|star|walk|run|hold|push|pull|open|clos|enter|exit|kneel|crouch|bend|point|cover|clutch|trembl|freez|frozen|rais|lower|tilt|hunch|flinch|creep|approach|peer|lift|drop|grab|touch|press|reel|back)\w*/i
// FIRST-PERSON narrator drawn as a full/standing FIGURE (not POV). "The narrator stands/walks/sits/faces …"
// draws her as a visible person; on a non-reflection beat her look is stripped at render (the visibility
// rule), so she renders UN-ANCHORED → her wardrobe drifts shot-to-shot. Catch the pattern so the breakdown
// re-rolls the beat as true POV (what she sees / her hands / her back), where she isn't drawn as a figure at
// all. The [0,48]-char window keeps "the narrator's hand pushes …" (POV) from matching.
const NARRATOR_FIGURE_RE = /\bthe narrator\b[^.]{0,48}\b(stands?|standing|stood|walk(?:s|ing)?|sits?|sitting|sat|faces?|facing|poses?|posing|full[- ]?body|full figure)\b/i
// VOICEOVER embodiment cues — a voiceover reel's narrator has no body, so ANY narrator/host/presenter
// mention or POV framing in an imagePrompt is a structural error (the 2026-07-24 fake-host failure class).
// TEMPORARY DETERMINISTIC BACKSTOP (owner-flagged): lexical lists age poorly ("correspondent", "lecturer",
// "guide" will slip through) — the durable detector is the depiction critic's judgment ("does this shot
// visually introduce a narrator figure?"); this regex only catches the cheap obvious cases pre-spend.
const VOICEOVER_HOST_RE = /\b(the\s+)?(narrator|host|presenter|reporter|newscaster|news\s+anchor)\b/i
const VOICEOVER_POV_RE = /\bPOV\b|\bpoint[- ]of[- ]view\b|\bfirst[- ]person\b/i
// Depictive-ethics floor backstop (WARNING-tier; the durable detector is the image-QA vision check).
// A real-party CUE — a role noun, OR an ALL-CAPS 2–5-letter org acronym (BCDA, DTI, …; the [A-Z]{2,5}
// shape avoids matching lowercased common words) — paired with EVENT-STAGING is a likely fabricated
// press photo of real people. Requiring BOTH cues keeps false positives low.
const REAL_PARTY_ROLE_RE = /\b(official|officer|minister|senator|congress(?:man|woman)?|mayor|governor|president|executive|spokesperson|spokesman|delegate|politician|representative)s?\b/i
const ORG_ACRONYM_RE = /\b[A-Z]{2,5}\b/
const EVENT_STAGING_RE = /\b(shak\w* hands|handshake|at (?:a|the) podium|press (?:conference|briefing)|signing|ceremon\w+|ribbon[- ]?cut\w*|address\w+ (?:the|a) (?:crowd|room|audience|attendees)|gestur\w+ (?:at|toward)|oath|inaugurat\w+)/i

export function reviewSceneBreakdown(input: SceneQAInput): SceneQAResult {
  const errors: string[] = []
  const warnings: string[] = []
  const { scenes } = input
  const narration = input.narration.trim()
  // Journey legs (and scene positions relative to them) resolve against the WHOLE story's text — on a
  // chaptered breakdown that's wider than the chapter narration driving the pacing checks above.
  const groundText = (input.fullNarration ?? input.narration).trim()

  // ── Peak placement (error) ───────────────────────────────────────────────
  // The peak line must sit WITHIN a single scene so it lands as its own beat. If it's a real substring
  // of the narration but no single scene's text contains it, it's split across a boundary → repairable.
  const peak = input.peakMoment.trim()
  if (peak && narration.includes(peak)) {
    const containedIn = scenes.filter((s) => s.narrationText.includes(peak))
    if (containedIn.length === 0) {
      errors.push(`The peak line ("${peak.slice(0, 60)}") is split across scene boundaries — it must sit within ONE scene so it lands as its own beat.`)
    } else {
      // Contained, but buried in a much longer span → soft nudge toward its own shot.
      const host = containedIn[0]!
      if (peak.length / host.narrationText.trim().length < 0.5) {
        warnings.push(`The peak line is buried in a longer scene (peak is ${Math.round((peak.length / host.narrationText.trim().length) * 100)}% of the scene's text) — consider giving it its own shot.`)
      }
    }
  }

  // ── Voiceover embodiment (errors) ────────────────────────────────────────
  // A voiceover reel's narrator is non-diegetic — no host, no POV, no narrator body ever on screen. Any
  // such framing is exactly the fake-host failure class this check exists for; an error triggers the
  // repair round, which re-boards the beat as subject b-roll. (Regexes are a temporary backstop — see
  // VOICEOVER_HOST_RE; the depiction critic carries the durable judgment.)
  if (input.narratorPerspective === 'voiceover') {
    if (input.narratorEntityId) {
      warnings.push(`Voiceover reel carries a narratorEntityId ("${input.narratorEntityId}") — the analyzer should never mint a narrator entity for a non-diegetic narrator (upstream bible inconsistency; scenes can't repair this).`)
    }
    scenes.forEach((s, i) => {
      const text = `${s.imagePrompt} ${s.sceneIntent ?? ''}`
      const host = VOICEOVER_HOST_RE.exec(text)?.[0]
      const pov = VOICEOVER_POV_RE.exec(text)?.[0]
      if (host || pov) {
        errors.push(`Scene ${i + 1}: this is a VOICEOVER reel — the narrator is a voice above the story, never on screen, yet the shot ${host ? `names "${host.trim()}"` : `uses ${pov} framing`}. Re-board the beat to show the SUBJECT of its narration (the thing, place, comparison, or change the span claims) with no narrator, host, or POV framing.`)
      }
    })
  }

  // ── Tier discipline ──────────────────────────────────────────────────────
  const videoBudget = input.maxVideoTiers ?? MOTION_BUDGET
  const videoCount = scenes.filter((s) => s.tier === 'video').length
  if (videoCount > videoBudget) {
    errors.push(`${videoCount} scenes are marked "video"; at most ${videoBudget} are allowed (cost + render time). Keep the ${videoBudget} most visually dynamic beats as video, the rest "still".`)
  }
  if ((input.isOpening ?? true) && scenes.length > 0 && scenes[0]!.tier !== 'video') {
    warnings.push('The opening scene is not "video" — the first beat usually benefits from motion.')
  }

  // ── Count vs the suggested beat-driven range (warning) ─────────────────────
  if (scenes.length < input.minScenes) {
    warnings.push(`${scenes.length} scenes is below the suggested minimum (${input.minScenes}) for this length — the story may be under-cut.`)
  } else if (scenes.length > input.maxScenes) {
    warnings.push(`${scenes.length} scenes is above the suggested maximum (${input.maxScenes}) for this length — the story may be over-cut.`)
  }

  // ── Scene duration (error) ─────────────────────────────────────────────────
  // The hard version of the count check: a single shot may not hold longer than MAX_SCENE_SEC of narration,
  // or it goes visually dead (the undersplit failure — one image frozen for 30-50s). Unlike the count range,
  // this triggers the repair round: the director must cut the offending span into more beats. Estimated
  // per scene so it fires on the actual long spans, not just a low total count (a reel can hit its scene
  // count yet still bury one 51s monologue in a single shot).
  //
  // FEASIBILITY: the limit is raised to whatever an even split across maxScenes would require, so the guard
  // can NEVER demand more scenes than the schema's cap allows. Without this, a very long narration
  // (>maxScenes × MAX_SCENE_SEC) would flag scenes the model physically cannot shorten within the cap → an
  // unsatisfiable repair loop / a hard schema failure. For normal-length reels this stays at MAX_SCENE_SEC.
  const evenSplitSec = input.maxScenes > 0 ? estimateNarrationSec(narration) / input.maxScenes : MAX_SCENE_SEC
  const sceneSecLimit = Math.max(MAX_SCENE_SEC, evenSplitSec)
  scenes.forEach((s, i) => {
    const sec = estimateNarrationSec(s.narrationText)
    if (sec > sceneSecLimit) {
      errors.push(`Scene ${i + 1} covers ~${Math.round(sec)}s of narration (over the ~${Math.round(sceneSecLimit)}s limit) — a single shot held that long looks static and dead. Split it into consecutive beats, cutting on each shift in action, focus, or tension; each new shot must advance the visual (a new angle, a new detail, the next action). Do not exceed ${input.maxScenes} scenes total.`)
    }
  })

  // ── Image-prompt hygiene (warnings) ────────────────────────────────────────
  scenes.forEach((s, i) => {
    const prompt = norm(s.imagePrompt)
    const n = i + 1
    const leaked = STYLE_LEAK_WORDS.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(prompt))
    if (leaked.length > 0) {
      warnings.push(`Scene ${n} image prompt contains style/medium words (${leaked.join(', ')}) — content only; the system owns the look.`)
    }
    if (SETTING_FIRST_OPENERS.some((o) => prompt.startsWith(o))) {
      warnings.push(`Scene ${n} image prompt may lead with the setting, not the subject (VISUAL PRIORITY) — open on the specific thing the line is about.`)
    }
    // Depictive-ethics floor (deterministic, WARNING-first): a shot that pairs a real-party cue (a role
    // noun or an ALL-CAPS org acronym) with event-staging (handshake/podium/ceremony/…) is likely a
    // fabricated press photo of real people. Warned here + caught firmly by image-QA's REAL-PARTY
    // FABRICATION vision check; promote to an error only once this heuristic's precision is proven.
    const partyCue = REAL_PARTY_ROLE_RE.exec(s.imagePrompt)?.[0] ?? ORG_ACRONYM_RE.exec(s.imagePrompt)?.[0]
    const stagingCue = EVENT_STAGING_RE.exec(s.imagePrompt)?.[0]
    if (partyCue && stagingCue) {
      warnings.push(`Scene ${n} may stage a real party as an event photo (depictive-ethics floor): "${partyCue.trim()}" + "${stagingCue.trim()}". Prefer representative/anonymous/conceptual imagery (documents, the real place, distant/silhouetted or unbranded figures, symbolic staging).`)
    }
  })

  // ── primaryEntity ↔ imagePrompt lead consistency (error) ───────────────────
  // The bible splices the PRIMARY entity's canonical look as the shot's subject. If the imagePrompt clearly
  // OPENS on a *supporting* entity while primaryEntity is a different one, the wrong subject gets spliced
  // (e.g. a reveal that opens on the apparition but tags the narrator primary → renders the narrator).
  // Conservative on purpose: only fires when a supporting entity's id appears in the OPENING clause and the
  // primary's id does not — natural-label prompts (the norm) contain no ids, so they never false-trigger.
  const idForms = (id: string): string[] => [id.toLowerCase(), id.replace(/-/g, ' ').toLowerCase()]
  const inLead = (id: string, lead: string): boolean => idForms(id).some((f) => lead.includes(f))
  scenes.forEach((s, i) => {
    const primary = s.primaryEntity
    const supporting = s.supportingEntities ?? []
    if (!primary || supporting.length === 0) return
    const lead = norm(s.imagePrompt).slice(0, 45)
    const leadSupporting = supporting.find((se) => inLead(se, lead))
    if (leadSupporting && !inLead(primary, lead)) {
      errors.push(`Scene ${i + 1} opens on "${leadSupporting}" (a supporting entity) but primaryEntity is "${primary}", which the shot never leads with. Set primaryEntity to the subject the imagePrompt opens on — that's what the bible splices as the shot's subject.`)
    }
  })

  // ── Location-label drift (warning) ─────────────────────────────────────────
  const labels = [...new Set(scenes.map((s) => s.location.trim()).filter(Boolean))]
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (labelsLikelySamePlace(labels[i]!, labels[j]!)) {
        warnings.push(`Location labels "${labels[i]}" and "${labels[j]}" may name the same place — use ONE label so same-place scenes share a generation seed (continuity).`)
      }
    }
  }

  // ── Journey-grounded + structural storyboard checks (Phase 1 + 2A) ─────────
  // All CONSERVATIVE: fire only on clear violations, skip when the data to judge is missing.
  const entityById = new Map<string, BibleEntity>((input.bibleEntities ?? []).map((e) => [slug(e.id), e]))
  const resolve = (ref: string | null | undefined): BibleEntity | undefined => (ref ? entityById.get(slug(ref)) : undefined)
  const narratorSlug = input.narratorEntityId ? slug(input.narratorEntityId) : null
  const journey = input.journey ?? []
  const refsOf = (s: SceneQAScene): string[] => [...(s.primaryEntity ? [s.primaryEntity] : []), ...(s.supportingEntities ?? [])]
  const peakScene = peak && narration.includes(peak) ? scenes.find((s) => s.narrationText.includes(peak)) : undefined

  scenes.forEach((s, i) => {
    const n = i + 1
    const leg = journey.length ? legForScene(s, journey, groundText) : null
    const locEnts = refsOf(s).map(resolve).filter((e): e is BibleEntity => !!e && e.kind === 'location')

    // Location: a scene may only tag the place it's physically IN.
    if (leg) {
      // 2A — ground on the journey leg (catches coherently-wrong tags, not just self-inconsistency).
      for (const le of locEnts) {
        if (leg.locationEntityId && slug(le.id) !== slug(leg.locationEntityId)) {
          errors.push(`Scene ${n} tags location "${le.id}" but the journey has the narrator in "${leg.locationEntityId}" for this beat — that splices the wrong place in. Tag the leg's location, not a place they aren't in.`)
        } else if (!leg.locationEntityId) {
          errors.push(`Scene ${n} tags location "${le.id}" but the journey has the narrator in a TRANSIT space ("${leg.locationLabel}") here — they haven't entered that place yet. Don't tag the destination; describe the transit space inline.`)
        }
      }
    } else if (input.bibleEntities) {
      // 1 (fallback, no journey) — self-consistency: a tagged location entity must match the scene's label.
      for (const le of locEnts) {
        if (!labelMatchesLocationEntity(s.location, le)) {
          errors.push(`Scene ${n} is labeled "${s.location}" but tags location entity "${le.id}", splicing that place's description into a shot set elsewhere. Tag only the place the scene is physically IN; if the label's place isn't a bible location, tag none and describe it inline.`)
        }
      }
    }

    // Cast: a bible CHARACTER referenced but the leg says isn't present = invented (the "friend in the CR
    // she never entered" case). Narrator excluded — in a first-person reel she's the POV, always present.
    if (leg) {
      const presentSlugs = new Set((leg.present ?? []).map(slug))
      for (const ref of refsOf(s)) {
        const e = resolve(ref)
        if (e && e.kind === 'character' && slug(ref) !== narratorSlug && !presentSlugs.has(slug(ref))) {
          errors.push(`Scene ${n} includes character "${ref}" but the journey says present = [${(leg.present ?? []).join(', ') || 'no one'}] for this beat — remove them (not here yet, or already gone).`)
        }
      }
      // person-noun in prose but nobody visible this beat → possible invented extra (prose-only, so WARNING)
      const visible = leg.visible && leg.visible.length ? leg.visible : leg.present ?? []
      if (PERSON_NOUN_RE.test(s.imagePrompt) && visible.length === 0) {
        warnings.push(`Scene ${n} prose mentions a person but the journey has no one visible in this beat — check for an invented extra (a bystander/hand/figure).`)
      }
    }

    // Check D — static/camera-facing (warning): a person in frame with no action/gaze verb. Grounded pass
    // only (needs bible context; keeps pure/legacy callers unaffected).
    const mentionsPerson = PERSON_NOUN_RE.test(s.imagePrompt) || refsOf(s).some((r) => resolve(r)?.kind === 'character')
    if (input.bibleEntities && mentionsPerson && !ACTION_VERB_RE.test(s.imagePrompt)) {
      warnings.push(`Scene ${n} shows a person but no clear action/gaze verb — risk of a static, camera-facing pose. Give them a mid-action and an off-camera gaze.`)
    }

    // Check E — first-person narrator drawn as a full figure (error). In a first-person reel (narratorEntityId
    // set) the narrator is the CAMERA, not a subject; describing her as a standing/walking/facing figure draws
    // her body, but her look is stripped at render on non-reflection beats → she renders un-anchored and her
    // wardrobe drifts between shots. A reflection beat is the ONE place she's legitimately shown (and gets
    // re-anchored), so it's exempt. Force a POV re-roll instead.
    const isReflectionBeat = /\b(mirror|reflection|reflected|glass)\b/i.test(`${s.imagePrompt} ${s.sceneIntent ?? ''}`)
    if (narratorSlug && !isReflectionBeat && NARRATOR_FIGURE_RE.test(s.imagePrompt)) {
      errors.push(`Scene ${n} draws the narrator as a visible standing/facing figure, but this is a FIRST-PERSON reel — she is the camera. Rewrite as POV: what she SEES (the space, a detail) or her hands/the back of her head in the near foreground, never a full figure of her facing the frame. (Outside a reflection her look isn't locked, so a figure here renders as a different person each shot.)`)
    }
  })

  // ── Check B — the reveal opens on the threat (error) ───────────────────────
  // A reveal leads with its threat. When the peak scene's journey leg has the threat PRESENT (the peak IS the
  // threat's appearance), the threat must be the primaryEntity — the shot opens on it, never on the room or
  // the narrator (which splices the wrong subject and loses the payoff). Journey-grounded and general — fires
  // on ANY threat reveal, not just mirror beats; the narrator's own splice on a reflection reveal is handled
  // deterministically at render (the visibility rule in generate_images).
  if (peakScene && journey.length && (input.bibleEntities?.length ?? 0) > 0) {
    const threat = input.bibleEntities!.find((e) => e.role === 'threat')
    const peakLeg = legForScene(peakScene, journey, groundText)
    const threatPresent = !!threat && !!peakLeg && (peakLeg.present ?? []).some((p) => slug(p) === slug(threat!.id))
    if (threat && threatPresent && resolve(peakScene.primaryEntity)?.role !== 'threat') {
      errors.push(`The reveal (peak scene) has the threat ("${threat.id}") present but not as primaryEntity — the payoff must OPEN on the threat. Set primaryEntity to the threat so the shot leads with it, not the room or the narrator.`)
    }
  }

  // ── Check C — a scare/reveal VIDEO beat must move the threat (error) ───────
  scenes.forEach((s, i) => {
    if (!input.bibleEntities || s.tier !== 'video') return
    const isPeak = peakScene !== undefined && s === peakScene
    const tagsThreat = refsOf(s).some((r) => resolve(r)?.role === 'threat')
    if ((isPeak || tagsThreat) && !(s.subjectMotion ?? '').trim()) {
      errors.push(`Scene ${i + 1} is a video scare/reveal beat but subjectMotion is empty — the threat must MOVE (e.g. a slow smile widening, a head tilting wrong). A payoff held still wastes the reel's most important shot.`)
    }
  })

  return { errors, warnings }
}
