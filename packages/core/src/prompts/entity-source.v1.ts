// entity-source.v1 — the judgement calls around sourcing a REAL photograph for a factual entity
// (see specs/depictive-fidelity.md). Supersedes place-source.v1, which asked the same two questions but only
// about places.
//
// WHY ONE CLASSIFIER INSTEAD OF ONE PROMPT PER KIND: the Story Bible's `kind` only distinguishes
// character/location/object, which cannot tell a Philippine eagle from a person, or the Titanic from a
// cracked mirror. Routing needs the SUBJECT CLASS, so this decides that once and every gate downstream reads
// it. It is also what makes animals work with no new entity kind — an animal lands in `character` or
// `object` today, and only `human` may ever reach the liveness gate.
//
// Both calls stay deliberately conservative: we attach a real photo only when it genuinely helps and
// genuinely matches. Everything else falls through to a generated plate, which is the pre-existing behaviour.

import { z } from 'zod'
import { SubjectClassSchema } from '../types/depiction.js'

export const ENTITY_SOURCE_V1_VERSION = 'entity-source.v1.18'

// (1) DECIDE — what class of real-world thing is this, and is it specific enough that a real photograph
// would improve the render? The impact≠coverage guard is the whole point: a GENERIC subject (a bedroom, a
// stray dog, a cracked mirror) must NOT pull in a random real photo of some other bedroom/dog/mirror.
export const EntitySourceDecisionSchema = z.object({
  subjectClass: SubjectClassSchema,
  sourceable: z.boolean(),
  query: z.string().default(''), // Wikipedia/Commons search query when sourceable; '' otherwise
  reason: z.string().default(''),
})

export function buildEntitySourceDecidePrompt(
  kind: 'character' | 'location' | 'object',
  name: string,
  description: string,
  region?: string,
  narrationEvidence?: string,
): { system: string; userMessage: string } {
  const system = `You classify what a documentary scene's ENTITY actually is, and decide whether a real photograph of it exists and would help.

Classify into exactly one subjectClass:
- "place" — a specific, real, NAMED location: a landmark, a named building, a named historic site, a named natural feature ("Paoay Church", "Tacoma Narrows Bridge", "Mount Pinatubo").
- "object" — a specific, real, NAMED thing: a named vessel, vehicle, aircraft, artwork, artifact, document, monument, or instrument ("Titanic", "Spirit of St. Louis", "the Rosetta Stone", "Apollo 11 command module").
- "animal" — a real ANIMAL: a named species ("Philippine eagle", "Bengal tiger") or an individual famous animal ("Hachikō", "Lonesome George"). Use this for any non-human creature that really exists or existed.
- "human" — a real, identifiable PERSON, named or unambiguously identified by office/title ("José Rizal", "Abraham Lincoln", "the current Secretary of Trade").
- "fictional" — invented: a story character, a mythological or folkloric being, a supernatural presence. Use this EVEN IF the name resembles a real person's — an invented character called "Maria Santos" is fictional.
- "generic" — real in kind but ANONYMOUS and unnamed: "a bedroom", "an office", "a street", "a stray dog", "a cracked mirror", "a rusty key", "a schoolgirl". No specific real instance is meant.

An organization, institution, company, government body, movement, committee, or group of people is NOT a
visual subject in this taxonomy. Classify the organization itself as "generic" and sourceable FALSE: its logo,
headquarters, members, and documents are different subjects, and choosing one would make a false visual claim.
Only classify a separately named physical building/site, specific document/artifact, or eligible individual
person when that is the entity actually described.

A historical event — an exhibition, ceremony, vote, trial, battle, protest, launch, accident, or meeting — is
also NOT one visual subject. Classify the event itself as "generic" and sourceable FALSE. Its actual venue,
participants, documents, vehicles, artifacts, or genuine event photograph are separate visual subjects and
must be represented by the concrete entity they actually depict. Never classify an event as a "place" merely
because it happened somewhere.

A named mission, operation, expedition, campaign, program, or flight is event/context too — not one physical
object. Classify the mission itself as "generic" and sourceable FALSE even when its description mentions the
vehicle, vessel, aircraft, capsule, or equipment used. Never silently substitute one participant object for
the whole mission. Only a separately named physical subject — for example a specific command module, launch
vehicle, ship, aircraft, instrument, or document — may be classified as that concrete object.

Judge the ENTITY NAME, factual description, and any BOUND NARRATION EVIDENCE together. The name is normally
the strongest signal, but it may be analyzer shorthand rather than the audience-facing identity. If bound
narration explicitly identifies this same physical subject more precisely — a model/designation, titled work,
named vessel, dated artifact, species, building, or person — the exact narration-supported identity wins even
when the entity name is generic. Use that exact identity in the query. Never borrow a nearby proper name unless
the evidence clearly says it is this entity; a merely mentioned subject does not rename another object.

Then set sourceable:
- TRUE only for "place", "object", "animal", or "human" — a specific real VISUAL subject a viewer could look up and that plausibly has photographs.
- FALSE for "fictional" and "generic", always. A real photograph of some other bedroom, or of a real person who merely shares a made-up character's name, would be wrong — not helpful.

When sourceable, write the best search query for a clear photograph of that subject: its proper name${region ? ', including the country/region when that disambiguates it' : ''}. For a species, the common English name. For a person, their full commonly-used name. Keep it short, no quotes.`

  const userMessage = `Entity kind (structural only — do not let it decide subjectClass): "${kind}"
Entity name: "${name}"
Factual description:
"""${description}"""${narrationEvidence ? `\n\nBOUND NARRATION EVIDENCE (only spans whose scene binds this entity):\n"""${narrationEvidence}"""` : ''}${region ? `\n\nRegion/country context: ${region}` : ''}

Return JSON: { "subjectClass": string, "sourceable": boolean, "query": string, "reason": string }`

  return { system, userMessage }
}

// (2) VERIFY — does the SOURCED image (IMAGE 1, supplied by the caller) actually depict the described
// subject? A FILTER against obvious mismatches, not a proof of correctness: it rejects a wrong subject /
// generic stand-in / map / logo, but cannot catch a wrong-but-similar instance (the wrong cathedral, the
// wrong ship of a class, the wrong person of a similar face). Below threshold → discard the source and fall
// back to a generated plate.
//
// `appearsGrayscale` rides along at zero marginal cost — the call already holds the image. It exists because
// an archival black-and-white portrait used to condition colour scenes produces a grayscale-head-on-
// colour-body seam (spike-continuity, 2026-07-20), so such a plate is colourised first. Named "appears"
// because this is a deliberately accepted model judgement, not pixel analysis.
export const EntityVerifySchema = z.object({
  matches: z.boolean(),
  confidence: z.number().min(0).max(1),
  appearsGrayscale: z.boolean().default(false),
  note: z.string().default(''),
})

export const IdentityStateVerifySchema = z.object({
  identityPreserved: z.boolean(),
  candidateMatchesTargetExactly: z.boolean(),
  confidence: z.number().min(0).max(1),
  note: z.string().default(''),
})

export function buildEntityVerifyPrompt(
  subjectClass: 'place' | 'object' | 'animal' | 'human',
  name: string,
  description: string,
  usage?: 'conditioning_reference' | 'presented_archival',
): { system: string; userMessage: string } {
  const objectCriteria = usage === 'conditioning_reference'
    ? `the named object itself, clearly the subject of the frame. Fail a different object, a generic example of its category, a replica presented as something else, a map, a diagram, or a logo. Require identity-defining shape and INTRINSIC DURABLE STATE explicitly named in the description, including edition, markings, damage, or restoration. Do not treat final-shot motion, action, camera, setting, placement, temporary external apparatus, or hidden/internal mechanisms as identity state. Example: for "descending with a deployed parachute," require the correct object, but NEVER require the conditioning reference to be airborne or to include the temporary parachute inside its crop; the final generated scene and its QA own that visible action. Safing pins, switch positions, arming sequences, and other internal or non-visible states never cause failure unless the image is explicitly a close-up intended to expose them.`
    : 'the named object itself, clearly the subject of the frame. Fail a different object, a generic example of its category, a replica presented as something else, a map, a diagram, or a logo. A museum or archival photograph of the real object passes. When the description requires a dated issue, edition, version, marking, damage state, restoration state, or other exact historical state, that state is part of identity: fail an image that visibly contradicts it or only shows a different edition/state. Judge only what the pixels can establish: do not demand visible proof of an internal, hidden, microscopic, or otherwise non-visible mechanism/state unless the description explicitly requires it exposed on screen.'
  // What counts as a match differs by class, and a place-worded rule misjudges the others: a portrait is the
  // CORRECT result for a person and a disqualifying result for a building.
  const criteria: Record<typeof subjectClass, string> = {
    place: 'the right kind of structure or landscape with matching distinctive features. Fail a different subject, a generic stand-in, a map, a diagram, a logo, or a portrait of a person.',
    object: objectCriteria,
    animal: 'the named species or individual animal, clearly the subject. Fail a different species, an illustration presented as a photograph, a diagram, or a logo. A photograph of the animal in any setting — wild, captive, or archival — passes.',
    human: 'the named person, as a portrait, photograph, painted portrait, or historical image of them. Fail a different person, an anonymous figure, a crowd, a statue or monument OF them rather than an image of them, a map, a document, or a logo. When you are not confident it is this specific person, FAIL — a similar-looking stranger is the failure mode this check exists to stop.',
  }

  const conditioningCriteria = usage === 'conditioning_reference'
    ? `

This image is a CONDITIONING REFERENCE, not the final staged scene. Its camera angle, background, placement, and transient action may differ from the factual description. Verify the named identity and any durable visible configuration or historical state; do not require the reference itself to stage the final shot.`
    : ''

  const system = `You verify whether an image depicts a specific named subject. You are a strict FILTER against obvious mismatches: pass an image ONLY if it clearly shows the named subject — ${criteria[subjectClass]} When unsure, fail (low confidence).${conditioningCriteria}

Also report whether the image APPEARS to be black-and-white / monochrome / sepia rather than full colour.`

  const userMessage = `Does IMAGE 1 depict "${name}"?
Factual description:
"""${description}"""
${usage === 'conditioning_reference' ? '\nApply the conditioning-reference rule strictly: do not cite a missing camera angle, setting, placement, motion/action, or hidden/internal detail as a reason to fail. A landed or recovered view may anchor an object depicted moving in the final shot. Judge only the named identity and durable state evidence visible in these pixels.\n' : ''}

Return JSON: { "matches": boolean, "confidence": 0..1, "appearsGrayscale": boolean, "note": string }`

  return { system, userMessage }
}

// (2b) VERIFY A DERIVED IDENTITY STATE — unlike source verification above, provenance is already established
// by IMAGE 1. IMAGE 2 is allowed to differ exactly where story time requires it (unsigned vs signed, intact
// vs damaged, original vs restored), so asking whether IMAGE 2 alone "is the historical object" produces a
// false failure whenever the target state intentionally removes the later identifying mark.
export function buildIdentityStateVerifyPrompt(
  name: string,
  targetState: string,
): { system: string; userMessage: string } {
  const system = `You verify a state-adapted visual reference against its verified source identity. Make TWO SEPARATE judgments; never collapse them into a provenance verdict.

IMAGE 1 is the verified source identity. IMAGE 2 is a generated candidate showing that SAME physical subject at a different story-time state.

1. identityPreserved: IMAGE 2 preserves IMAGE 1's identity-defining physical structure wherever the TARGET does not explicitly change it — geometry, proportions, openings, rim/edge shape, component arrangement, markings, and other distinctive form. Fail a visibly different model, object, building, animal, or person.
2. candidateMatchesTargetExactly: IMAGE 2 visibly satisfies the target orientation, markings, labels, damage, restoration, age, or other state details below.

Judge only target details that pixels can establish. A hidden, internal, microscopic, or otherwise non-visible mechanism/state does not need visible proof unless the target explicitly requires it exposed on screen. Visible external apparatus or action named by the target does need to be present.

The target state is authoritative. Evaluate the TARGET against IMAGE 2 only, never against IMAGE 1. Evaluate identity from physical features the target leaves unchanged, ignoring every source-state attribute that the target changes. When the target says "unmarked," removing IMAGE 1's signature is REQUIRED target compliance and MUST NOT make either boolean false when the remaining identity holds. Provenance was already established from IMAGE 1; never ask IMAGE 2 to prove it independently.

DESTRUCTIVE OR FORM-CHANGING TARGETS: when the target explicitly requires breakup, fragmentation, collapse, dismantling, crushing, burning, or another state that changes structural continuity, do NOT require IMAGE 2 to remain intact. Missing continuity, separated components, deformation, or damage explicitly required by the target cannot by itself make identityPreserved false. Instead, judge whether the surviving form remains recognizably the same sourced subject or exact model through the distinctive geometry and model-specific components that should survive. Fail a different subject/model, generic debris, or a candidate with too little recognizable evidence to carry the identity claim. This exception applies only to changes the target explicitly requires; it does not excuse unrelated identity drift.

Truth-table example: IMAGE 1 is signed; target says unmarked; IMAGE 2 has the same geometry and is unmarked → identityPreserved=true AND candidateMatchesTargetExactly=true. The fact that IMAGE 2 differs from IMAGE 1 on the requested state is the purpose of adaptation, never a failure.`

  const destructiveExample = `Destructive-state example: IMAGE 1 is a verified intact aircraft; the target says broken apart in mid-air; IMAGE 2 shows that same aircraft model breaking apart with recognizable model-specific components → identityPreserved=true AND candidateMatchesTargetExactly=true. A different aircraft model or unidentifiable generic debris → identityPreserved=false.`

  const userMessage = `Subject identity: "${name}"
Target story-time state:
"""${targetState}"""

${destructiveExample}

Compare IMAGE 1 with IMAGE 2. Return JSON: { "identityPreserved": boolean, "candidateMatchesTargetExactly": boolean, "confidence": 0..1, "note": string }`

  return { system, userMessage }
}

// (3) COLOURISE — applied ONLY to a monochrome plate that will CONDITION generated scenes, never to an
// archival photograph presented as itself (that would be generative modification of real media). Asks for a
// faithful colourisation and nothing else: any re-posing or re-lighting here would defeat the plate's whole
// purpose, which is to hold one identity steady across shots.
export const PLATE_COLOURISE_PROMPT =
  'Colourise this photograph naturally and faithfully. Keep the subject, pose, framing, expression, clothing and background exactly as they are — change nothing except adding realistic, period-plausible colour. Do not stylise, do not retouch, do not alter any feature.'

// (4) REPRESENTATIVE STAGING — the positive half of the archival fallback. When a living/recent real person
// cannot be shown from a genuine archival photograph, the scene must still carry its SUBSTANCE, and the
// depictive-ethics floor requires describing the staging we DO want rather than negating what we don't
// ("DESCRIBE PRESENCE, NOT ABSENCE" — a negative prompt is the weakest lever available).
//
// The deterministic name-scrub in generate-images is the safety guarantee; this call only makes the result
// good. If it fails or returns something unusable, the caller falls back to the entity's role-representative
// description, never to the original prompt.
export const RepresentativeStagingSchema = z.object({
  imagePrompt: z.string().min(1),
})

export function buildRepresentativeStagingPrompt(
  visualPrompt: string,
  personLabel: string,
): { system: string; userMessage: string } {
  const system = `You rewrite a documentary shot description so it carries the beat's SUBSTANCE without depicting an identifiable real person.

Rendered photoreal, a frame showing a named real person at an event is a fabricated press photo — a false record of a real person somewhere they may never have been. So the person must not appear as themselves. Rewrite the shot to convey the same information through representative, anonymous, or conceptual imagery:
- the real place, building, object, or document involved, as a physical thing
- unbranded working hands, a signed page, two flags on an empty table, an empty podium, an empty chair
- a distant, silhouetted, or non-identifiable figure
- symbolic staging that states the event without staging the people

RULES:
- Write POSITIVELY. Describe the staging you want. NEVER write "no faces", "unidentifiable", "without showing", or any other negation — image models render what you name, not what you forbid.
- Do NOT name the person, their office, their title, or their organisation. Do not describe their likeness, age, build, clothing, or face.
- Keep the setting, era, mood, and camera framing of the original where they don't depend on the person.
- One or two sentences. Concrete and renderable. No text or lettering in frame.`

  const userMessage = `Original shot description:
"""${visualPrompt}"""

The person who must NOT be depicted: ${personLabel}

Rewrite the shot. Return JSON: { "imagePrompt": string }`

  return { system, userMessage }
}
