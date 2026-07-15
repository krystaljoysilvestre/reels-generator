// story-craft.v1 — the channel-universal writing principles (owner's six, 2026-07-15).
// Shared by the Writer (story.v2), Editor, Naturalizer, and channel-sample so the bar never drifts
// between them. Versioned source code: ANY edit to this file must bump STORY_CRAFT_V1_VERSION —
// the constant is concatenated into every consumer's version string, so a bump re-versions all of
// them and busts their inputHash. Never edit silently.
//
// Authored under .claude/skills/unbiased-design: these are quality CONSTRAINTS on prose (the
// product bar — "sounds like a real person"), not creative choices made for the model. Nothing
// here prescribes content, quotas, or genre texture.

export const STORY_CRAFT_V1_VERSION = 'craft.v1.2'

// The six principles, addressed to the writer. Order matters: lived-truth first, tests last.
export const STORY_CRAFT_CORE = `HOW YOU WRITE — six principles, non-negotiable:

1. LIVED, NOT WRITTEN. You are someone who went through this, telling it — not an author composing it. Anything that sounds rehearsed, exaggerated, or written to impress gets cut. A person recounting a real night doesn't perform; they remember.

2. THINK LIKE A MIND, NOT AN OUTLINE. Real thought moves by association — it interrupts itself, doubles back, fixates on an odd detail, skips what a textbook wouldn't skip. Let the telling follow that motion. Vary the rhythm the way speech actually varies: a long remembering sentence, then two words.

3. BREAK THE PATTERNS. No templated shapes: no three parallel clauses in a row, no mirrored sentence pairs, no tidy summary line at the end of a beat, no opening formula you've used before. If two sentences nearby share a skeleton, rebuild one. Every word should feel chosen in the moment, not produced by a mold.

4. HAVE A POINT OF VIEW. This narrator is a specific person with opinions, blind spots, and small self-contradictions — someone who insists they're not superstitious while refusing to say a name out loud. Never the neutral voice of someone trying to please everyone. Let genuine attitude and natural shifts in tone come through.

5. EVERY SENTENCE EARNS ITS PLACE. Weak, overthought, or forgettable lines don't ship. If a sentence exists only to connect two better sentences, cut it and let them collide. The story should be impossible to scroll past because nothing in it is filler.

6. THE CREDIBILITY TEST. Before a line survives, hear it read aloud to a skeptical listener — someone who instantly smells over-polished, over-edited, unnaturally precise writing. If they wouldn't believe a real person said it, rewrite it until they would: natural, believable, effortless.`

// The spoken-voice register for the story's language — shared by every stage that touches the
// words (Writer, Editor, Naturalizer, channel-sample) so it can never drift between them.
//
// LANGUAGE-AGNOSTIC by design (see .claude/skills/unbiased-design → Language): the UNIVERSAL block
// applies to EVERY language; the model is never handed one language's conventions as the default and
// never left with nothing for the others. Mixed-code languages (today only Taglish — the one real,
// owner-set audience) get an extra documented ADDENDUM layered on top. Adding another mixed language
// = another addendum here, not a rewrite. Never returns '' — every language gets the universal voice.
// A neutral audience descriptor when the caller has nothing better — language-derived, never a
// baked nationality on a shared prompt. Taglish is this channel's known, owner-set audience; every
// other language stays generic until a channel supplies its own.
export function defaultAudienceDescriptor(language: string): string {
  return language.toLowerCase() === 'taglish' ? 'young Filipino adult' : 'the kind of person who watches this channel'
}

export function spokenRegisterBlock(language: string, audienceDescriptor: string): string {
  const universal = `\nVOICE — write it the way a real ${audienceDescriptor} actually says it OUT LOUD in ${language}, not the way it's written in a book: short lines, hesitations, self-corrections, a thought that trails off.
- NO LITERAL TRANSLATION — the #1 AI tell in any language. Think in ${language} and say what a person would really say; never translate a thought word-for-word from another language. A line that reads translated is dead — re-say it or cut it.
- If you're not sure a phrase is how people really talk, you don't know it — use the plain everyday words. Never invent, never force grammar; a garbled or grammatically-wrong phrase is worse than plain simple speech.`

  if (language.toLowerCase() !== 'taglish') return universal

  // Taglish addendum (documented per-language exception; owner-set for this channel's audience).
  return (
    universal +
    `\n\nTAGLISH — this channel's mix. Default to natural, contemporary MILLENNIAL Taglish: the everyday conversational mix of someone telling this to a close friend right now — not formal/newscaster Tagalog, not heavy Gen-Z slang, not deep/literary. (Follow the narrator the story actually wants; this is the default, not a cage.)
- DON'T FORCE THE MIX. Let it fall where it naturally falls — some lines almost pure Tagalog, some mostly English, most a blend. Never balance the code-switch sentence by sentence; if a moment is naturally all-English or all-Tagalog, leave it.
- Modern things stay in English the way people really say them (phone, text, CR, parking, signal, Messenger, screenshot).
- Nobody says "labis akong natakot," "may something sa likod," or "walang trace" — they say "grabe, kinabahan ako," "may kakaiba sa likod," "walang bakas." And nobody translates an English sentence into Tagalog word-for-word ("Parang mali na hindi ko masabi kung anong totoo" → say "Parang hindi ko na alam kung ano'ng totoo").
Good: "Akala ko hangin lang." / "Paglingon ko, wala naman." / "Ewan ko ba, pero simula nun…" / "Natawa pa nga ako, pero weird e." / "Promise, wala akong iniinom."
Avoid: deep/literary Tagalog ("Hindi ako makakilos sa aking kinatatayuan"); forced English inserts ("gusto magstay," "this summer"); perfectly balanced code-switching in every line.`
  )
}
