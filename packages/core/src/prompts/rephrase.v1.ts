// rephrase.v1 — content-filter retry template (docs/04 §4.3)

export const REPHRASE_V1_VERSION = 'rephrase.v1'

export function buildRephrasePrompt(originalPrompt: string): { system: string; userMessage: string } {
  return {
    system: 'You are a storyboard director for vertical (9:16) narrated reels.',
    userMessage: `This image prompt was rejected by a safety filter:

"${originalPrompt}"

Rewrite it to convey the same dread through atmosphere, framing, and absence (shadow, doorway, aftermath, implied presence) with zero violent or graphic terms. Return only the rewritten prompt text, no JSON wrapper.`,
  }
}
