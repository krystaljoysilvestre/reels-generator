// scene-depiction-doctor.v1 — the FORCE half of the DEPICTION GATE. When the depiction critic
// (scene-depiction-critic.v1) fails a scene as wallpaper, the doctor repairs THAT scene's imagePrompt in
// place — never the board (a re-roll re-satisfices back to wallpaper; a targeted repair converges, same
// finding as the plan doctor, probe-plan-force.ts 2026-07-20).
//
// THE DOCTOR'S TWO LAWS (owner-set, 2026-07-25 — these are invariants, not guidance):
//   1. "The doctor never makes a scene more cinematic — it only makes it more semantically faithful."
//   2. "The doctor must never create new story information."
// Law 1 keeps the doctor from drifting into a second creative generator; law 2 blocks semantic drift —
// a repair draws only on what its span already states (inventing "the president signing the bill" when
// the narration never says so is a fabrication, the exact class the depictive-ethics floor targets).
//
// Second instance of the judge → targeted-repair → re-judge gate pattern (see scene-depiction-critic.v1
// header); repairs return ONLY {idx, imagePrompt} — narrationText/entities/tier are untouched, so tiling
// and continuity survive by construction. Versioned source; bump on any prompt-affecting edit.
import { z } from 'zod'

export const SCENE_DEPICTION_DOCTOR_V1_VERSION = 'scene-depiction-doctor.v1.6'

export const SceneDepictionRepairSchema = z.object({
  repairs: z.array(
    z.object({
      idx: z.number().int(), // must echo a failing scene's idx
      imagePrompt: z.string().min(1),
      depictionBasis: z.enum(['source', 'reconstruction', 'representative', 'conceptual']),
      sourcePresentationEntity: z.string().nullable(),
      primaryEntity: z.string().nullable(),
      supportingEntities: z.array(z.string()),
      appearanceByEntity: z.record(z.string(), z.string()),
    }),
  ),
})
export type SceneDepictionRepairs = z.infer<typeof SceneDepictionRepairSchema>

export interface SceneDepictionDoctorVars {
  nicheDescription: string
  genreCategory: string
  narratorPerspective?: string | undefined
  // Only the FAILING scenes, each with the critic's diagnosis. primaryEntity (when tagged) is the subject
  // the shot must still OPEN on — repairs that change the lead break the primary↔lead invariant and get
  // reverted by the caller's deterministic-QA guard.
  evidenceFacts?: unknown
  bibleEntities?: unknown
  journey?: unknown
  scenes: { idx: number; narrationText: string; imagePrompt: string; reason: string; primaryEntity?: string | null; depictionBasis: 'source' | 'reconstruction' | 'representative' | 'conceptual'; sourcePresentationEntity?: string | null }[]
}

export function buildSceneDepictionDoctorPrompt(v: SceneDepictionDoctorVars): { system: string; userMessage: string } {
  const perspectiveClause =
    v.narratorPerspective === 'voiceover'
      ? `\n- This reel is VOICEOVER: never introduce a narrator, host, presenter, reporter, or POV framing — the narrator has no body. Show the subject of the span.`
      : v.narratorPerspective === 'first_person'
        ? `\n- This reel is FIRST-PERSON POV: keep the repaired shot inside the narrator's eyes (their hands/back may edge the frame; never the narrator as a camera-facing figure).`
        : ''

  const system = `You are the DEPICTION DOCTOR for a short-form ${v.genreCategory} reel. Niche: ${v.nicheDescription}.
You are handed scenes whose shots FAILED the depiction gate — each with the exact reason — and you repair each shot so it depicts what its narration span actually claims. Repair, never replace the board.

TWO LAWS — these are invariants:
1. NEVER MORE CINEMATIC — ONLY MORE SEMANTICALLY FAITHFUL. Your job is what the frame TEACHES, not how it dazzles. Keep the scene's place, palette-neutral wording, and staging where they already serve the span; change only what the diagnosis names.
2. NEVER CREATE NEW STORY INFORMATION. The repair draws ONLY on what the span itself states. No invented events, names, actions, numbers, or specifics the narration doesn't carry — if the span says "the agency responded", you may stage a response as documents/symbols/anonymous staging, never a specific invented act.

REPAIR RULES:
- Render the span's load-bearing claim as something SEEN: the thing itself, a quantity made physical (a comparison beside a familiar object, abstract rising/falling forms of light), the two sides of a comparison staged in ONE frame, the change made visible. A sound-off viewer must learn the claim from the shot.
- Write 45–75 words, concrete and specific to THIS span — the wallpaper test must now fail (the shot could not sit under a different script).
- If the scene is tagged with a primary subject, your repaired shot still OPENS on that same subject — except for the restricted-real-person case below, where keeping the tag would make an honest repair impossible.
- RESTRICTED REAL-PERSON ESCAPE HATCH: an entity with depictionMode "archival_only" or "identity_withheld" may never be reconstructed or replaced with an invented likeness. When such a person is primary/supporting but no supplied referenceOrigin carries an exact sourceAssetKey that truthfully depicts this span's action/state, remove that person from primaryEntity, supportingEntities, appearanceByEntity, and imagePrompt. Retarget the repaired shot to a supported non-human subject, mechanism, document, physical effect, or anonymous representative/conceptual staging that carries the claim. A real portrait cannot prove an unrecorded decision, realization, recommendation, dialogue, or switch action. This exception is allowed to change primaryEntity or set it null; preserving an impossible person tag is a failed repair.
- Only the people the span itself places may appear; never invent background people. Any beat may be people-free.
- Repair the truth relationship too. Choose source only for exact verified pixels named by sourcePresentationEntity; reconstruction only for a specific supported moment; representative for anonymous non-event staging; conceptual for hypotheses, counterfactuals, metaphors, or mechanisms that must not read as historical documentation.
- Never invent a venue, emblem, audience, boardroom, meeting, ceremony, exhibition display, vote, publication, or identity state. If the anchors do not establish a specific event record, tighten to supported evidence/detail or use representative/conceptual staging.
- A diagnosis is a removal requirement, not wording advice. For unsupported_specificity, delete every unsupported visible detail instead of replacing it with a different plausible detail—including plausible studios, pedestals, counters, furniture, and light sources that assert an unestablished place. For invented_venue_identity, the repaired frame must contain no recognizable hall, office, institutional architecture, emblem, wall label, signage, flag, branded furniture, audience, or exhibition overview unless that exact element exists in the supplied anchors; use an anonymous/non-identifying context or a tighter supported detail chosen for this span. For invented_event_record, remove the documentary-looking event staging itself—not just faces or logos.
- A formal outcome is not evidence of its unseen interaction. On resignation, rejection, approval, vote, filing, signing, withdrawal, announcement, or publication beats, never repair into a plausible conversation, meeting, entrance, handshake, letter handoff, or posed departure unless that exact act is in the anchors. Use verified source evidence when available; otherwise render only an anonymous/non-identifying representation or supported consequence of the outcome.
- For source basis, do not invent a room, desk, hands, caption, typesetting, or readable content around the source. The exact source pixels fill the frame untouched; imagePrompt should describe presenting that verified source as itself, without asserting page details beyond its supplied provenance.
- Write only what IS visible. Never use "no", "without", "not", or a list of forbidden objects in imagePrompt; image models treat negative nouns as drawing cues. Fill the frame positively with the supported subject/context instead.
- source requires sourcePresentationEntity equal to the scene's primaryEntity. Every non-source basis requires sourcePresentationEntity:null. Return primaryEntity/supportingEntities/appearanceByEntity that match only what the repaired frame visibly contains, using exact ids and states from the supplied Story Bible; do not retain merely mentioned entities.
- No style, medium, or colour-grade words (the system owns the look); ENGLISH only; no readable text, charts, labels, or numbers IN the frame — image models garble text (render the physical comparison; the caption layer owns exact figures).${perspectiveClause}
Return repairs ONLY for the scenes given, keyed by their idx.`

  const userMessage = `SUPPLIED EVIDENCE FACTS:\n${JSON.stringify(v.evidenceFacts ?? null, null, 2)}\n\nSTORY BIBLE ENTITIES / VERIFIED SOURCES / STATES:\n${JSON.stringify(v.bibleEntities ?? null, null, 2)}\n\nCHRONOLOGY / JOURNEY:\n${JSON.stringify(v.journey ?? null, null, 2)}\n\nFAILING SCENES:\n${v.scenes
    .map((s) => `SCENE ${s.idx}${s.primaryEntity ? ` (primary subject: ${s.primaryEntity})` : ''}\nspan: ${s.narrationText.trim()}\ncurrent basis: ${s.depictionBasis}\ncurrent sourcePresentationEntity: ${s.sourcePresentationEntity ?? 'null'}\ncurrent shot: ${s.imagePrompt.trim()}\nwhy it failed: ${s.reason}`)
    .join('\n\n')}\n\nReturn the repaired shots. OUTPUT (JSON only):\n{ "repairs": [ { "idx": 1, "imagePrompt": "", "depictionBasis": "representative", "sourcePresentationEntity": null, "primaryEntity": null, "supportingEntities": [], "appearanceByEntity": {} } ] }`

  return { system, userMessage }
}
