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

export const SCENE_DEPICTION_DOCTOR_V1_VERSION = 'scene-depiction-doctor.v1.0'

export const SceneDepictionRepairSchema = z.object({
  repairs: z.array(
    z.object({
      idx: z.number().int(), // must echo a failing scene's idx
      imagePrompt: z.string().min(1),
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
  scenes: { idx: number; narrationText: string; imagePrompt: string; reason: string; primaryEntity?: string | null }[]
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
- If the scene is tagged with a primary subject, your repaired shot still OPENS on that same subject.
- Only the people the span itself places may appear; never invent background people. Any beat may be people-free.
- No style, medium, or colour-grade words (the system owns the look); ENGLISH only; no readable text, charts, labels, or numbers IN the frame — image models garble text (render the physical comparison; the caption layer owns exact figures).${perspectiveClause}
Return repairs ONLY for the scenes given, keyed by their idx.`

  const userMessage = `FAILING SCENES:\n${v.scenes
    .map((s) => `SCENE ${s.idx}${s.primaryEntity ? ` (primary subject: ${s.primaryEntity})` : ''}\nspan: ${s.narrationText.trim()}\ncurrent shot: ${s.imagePrompt.trim()}\nwhy it failed: ${s.reason}`)
    .join('\n\n')}\n\nReturn the repaired shots. OUTPUT (JSON only):\n{ "repairs": [ { "idx": 1, "imagePrompt": "" } ] }`

  return { system, userMessage }
}
