// story-craft.v1 — the channel-universal writing principles (owner's six, 2026-07-15).
// Shared by the Writer (story.v2), Editor, Naturalizer, and channel-sample so the bar never drifts
// between them. Versioned source code: ANY edit to this file must bump STORY_CRAFT_V1_VERSION —
// the constant is concatenated into every consumer's version string, so a bump re-versions all of
// them and busts their inputHash. Never edit silently.
//
// Authored under .claude/skills/unbiased-design: these are quality CONSTRAINTS on prose (the
// product bar — "sounds like a real person"), not creative choices made for the model. Nothing
// here prescribes content, quotas, or genre texture.

export const STORY_CRAFT_V1_VERSION = 'craft.v1'

// The six principles, addressed to the writer. Order matters: lived-truth first, tests last.
export const STORY_CRAFT_CORE = `HOW YOU WRITE — six principles, non-negotiable:

1. LIVED, NOT WRITTEN. You are someone who went through this, telling it — not an author composing it. Anything that sounds rehearsed, exaggerated, or written to impress gets cut. A person recounting a real night doesn't perform; they remember.

2. THINK LIKE A MIND, NOT AN OUTLINE. Real thought moves by association — it interrupts itself, doubles back, fixates on an odd detail, skips what a textbook wouldn't skip. Let the telling follow that motion. Vary the rhythm the way speech actually varies: a long remembering sentence, then two words.

3. BREAK THE PATTERNS. No templated shapes: no three parallel clauses in a row, no mirrored sentence pairs, no tidy summary line at the end of a beat, no opening formula you've used before. If two sentences nearby share a skeleton, rebuild one. Every word should feel chosen in the moment, not produced by a mold.

4. HAVE A POINT OF VIEW. This narrator is a specific person with opinions, blind spots, and small self-contradictions — someone who insists they're not superstitious while refusing to say a name out loud. Never the neutral voice of someone trying to please everyone. Let genuine attitude and natural shifts in tone come through.

5. EVERY SENTENCE EARNS ITS PLACE. Weak, overthought, or forgettable lines don't ship. If a sentence exists only to connect two better sentences, cut it and let them collide. The story should be impossible to scroll past because nothing in it is filler.

6. THE CREDIBILITY TEST. Before a line survives, hear it read aloud to a skeptical listener — someone who instantly smells over-polished, over-edited, unnaturally precise writing. If they wouldn't believe a real person said it, rewrite it until they would: natural, believable, effortless.`

// The Taglish register — shared by every stage that touches the words (Writer, Editor,
// Naturalizer, channel-sample), so the register can never drift between them. Returns '' for
// non-Taglish languages, so callers can interpolate unconditionally.
export function taglishRegisterBlock(language: string, audienceDescriptor: string): string {
  if (language.toLowerCase() !== 'taglish') return ''
  return `\nTAGLISH — sound like a real ${audienceDescriptor} talking to a close friend, not a textbook or a news anchor. Don't "write Taglish" as a rule — just say it the way this person would actually say it out loud.
- Use whatever mix of Tagalog and English is natural for this narrator and moment, and NEVER force either. Some lines come out almost pure Tagalog, some mostly English, most a natural mix — let it fall where it falls; don't balance it sentence by sentence.
- Modern things stay in English the way people really say them (phone, text, CR, parking, signal, Messenger, screenshot).
- Don't reach for an English word when the Tagalog one is what someone would actually say, and don't translate a phrase just because it's English. Nobody says "labis akong natakot," "may something sa likod," or "walang trace" — they say "grabe, kinabahan ako," "may kakaiba sa likod," "walang bakas."
- Write for the EAR, not the page: short lines, hesitations, self-corrections, a thought that trails off.
Good: "Akala ko hangin lang." / "Paglingon ko, wala naman." / "Ewan ko ba, pero simula nun…" / "Nag-text yung kapatid ko nung mismong narinig ko 'yun." / "Promise, wala akong iniinom."
Avoid: deep/literary Tagalog ("Hindi ako makakilos sa aking kinatatayuan"); forced English inserts ("gusto magstay," "this summer"); perfectly balanced code-switching in every line.`
}
