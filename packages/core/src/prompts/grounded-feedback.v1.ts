// grounded-feedback.v1 — AI-grounded options for the storyboard REGENERATE flow.
// When an operator attaches a reference image (📎) to a scene, a vision model reads BOTH the current scene
// image AND the attachment, then offers a few CONCRETE, image-grounded ways to use the reference (plus the
// UI's always-present "Other…" free-text). Each option is wired to the render knobs (anchor + directive) that
// control how strongly the reference takes hold (see regen-image: current-first nudges, reference-only
// replaces), so the operator picks an intent and never has to know the mechanism.
//
// This exists because a bare attachment does little on its own: the downstream prompt-rewriter can't SEE the
// photo, and in "vary" mode the current image dominates. This vision step DOES see the photo, names the real
// differences, and writes them into a directive the renderer can act on.

import { z } from 'zod'

export const GROUNDED_FEEDBACK_V1_VERSION = 'grounded-feedback.v1'

// anchor = the reference-ordering knob honoured by regen-image:
//   current-first   → keep this shot, the reference is a nudge (borrow a detail / keep the composition)
//   reference-first → the reference leads, the current image is secondary (strong adoption)
//   reference-only  → drop the current image, render fresh from the reference (full replace)
export const GroundedFeedbackSchema = z.object({
  // The key visible difference the model sees between the two images — the "grounded" evidence, shown to the
  // operator as "What I see". Optional: a model that omits it still yields usable options.
  observation: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string().min(1), // short button text (≤ ~6 words)
        description: z.string().min(1), // one grounded sentence — specific to these two images
        intent: z.enum(['borrow-detail', 'match-keep-composition', 'replace-fully']),
        anchor: z.enum(['current-first', 'reference-first', 'reference-only']),
        directive: z.string().min(1), // one sentence of image-prompt phrasing (spells the photo into words)
      }),
    )
    .min(2)
    .max(4),
})
export type GroundedFeedback = z.infer<typeof GroundedFeedbackSchema>

// Builds the system + user text. The two images (current scene, then attachment) are supplied by the caller
// as image content blocks — this only writes the instructions.
export function buildGroundedFeedbackPrompt(): { system: string; userMessage: string } {
  const system = `You are an assistant inside a video-studio image editor. The operator is regenerating a SCENE image and has ATTACHED a reference image. IMAGE 1 = the current scene, IMAGE 2 = the attached reference.

Return 2–4 options. Each option is a BUTTON the operator taps, and MUST have ALL of these fields:
- "label": short button text, ≤6 words.
- "description": ONE sentence, grounded in what ACTUALLY differs between the two images (name the real visual differences — architecture, structures, subject, palette, setting). Never generic filler like "adjust the style".
- "intent": one of borrow-detail | match-keep-composition | replace-fully.
- "anchor": one of current-first | reference-first | reference-only.
- "directive": ONE sentence of literal image-prompt phrasing (present-tense, content only — no style/medium words). Spell out the reference's real features in words, because the downstream prompt-writer cannot see the photo.

Intent → anchor mapping:
- borrow-detail → current-first (keep this shot; take only a specific element from the reference)
- match-keep-composition → current-first (adopt the reference's subject but keep the current camera/angle)
- replace-fully → reference-only (make the scene become the reference's subject, rendered fresh)

Order options from smallest change (borrow-detail) to largest (replace-fully). Also return a top-level "observation": one sentence naming the key visual difference you see. Do NOT include an "Other" choice — the UI appends that free-text option itself.`

  const userMessage = `IMAGE 1 = current scene. IMAGE 2 = the attached reference. Generate the grounded options.`

  return { system, userMessage }
}
