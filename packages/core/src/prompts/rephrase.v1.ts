// rephrase.v1 — content-filter retry template (docs/04 §4.3)

export const REPHRASE_V1_VERSION = 'rephrase.v1'

export function buildRephrasePrompt(
  originalPrompt: string,
  opts?: { genreCategory?: string },
): { system: string; userMessage: string } {
  // This fires only after the provider HARD-rejected the image, so the rewrite must dial something back to
  // get through — pushing harder just gets rejected again. The question is how far. A horror channel recovers
  // WITHOUT going tame: keep the dread at full strength and soften only the single most explicit element
  // (open wounds, spilled blood, a mutilated body) into implication/aftermath. Other niches drop graphic
  // terms entirely.
  const guidance =
    opts?.genreCategory === 'horror'
      ? 'Rewrite it to keep the SAME level of dread and menace, softening only the single most explicit element (open wounds, gore, a mutilated body) into implication and aftermath — a dark stain, a half-seen shape, an unnatural silhouette, a wrong detail in shadow. It must stay genuinely frightening; do not make it calm, safe, or pretty. Avoid only the most graphic literal terms — everything else unsettling stays.'
      : 'Rewrite it to convey the same dread through atmosphere, framing, and absence (shadow, doorway, aftermath, implied presence) with zero violent or graphic terms.'
  return {
    system: 'You are a storyboard director for vertical (9:16) narrated reels.',
    userMessage: `This image prompt was rejected by a safety filter:

"${originalPrompt}"

${guidance} Return only the rewritten prompt text, no JSON wrapper.`,
  }
}
