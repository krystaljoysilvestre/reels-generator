// story-craft.v1 — the channel-universal writing principles (owner's six, 2026-07-15).
// Shared by the Writer (story.v2), Editor, Naturalizer, and channel-sample so the bar never drifts
// between them. Versioned source code: ANY edit to this file must bump STORY_CRAFT_V1_VERSION —
// the constant is concatenated into every consumer's version string, so a bump re-versions all of
// them and busts their inputHash. Never edit silently.
//
// Authored under .claude/skills/unbiased-design: these are quality CONSTRAINTS on prose (the
// product bar — "sounds like a real person"), not creative choices made for the model. Nothing
// here prescribes content, quotas, or genre texture.

export const STORY_CRAFT_V1_VERSION = 'craft.v1.9'

// The six principles, addressed to the writer. Order matters: lived-truth first, tests last.
export const STORY_CRAFT_CORE = `HOW YOU WRITE — shared craft, interpreted through the creator's genre, form, voice and audience:

1. A CREDIBLE TELLER. The voice belongs to someone with a coherent relationship to the material. A lived account, an outside storyteller, a performed poem and a precise explainer need different kinds of credibility. Do not manufacture a confession or fake witness to make the narration feel human.

2. PURPOSEFUL RHYTHM. Let pacing carry attention and emotional movement. Mechanical sameness is a failure; deliberate repetition, parallelism, meter, refrains and engineered comic timing are craft when they earn their effect.

3. SPECIFICITY. Concrete details should clarify the world or carry meaning. Avoid interchangeable description, unsupported factual precision, and detail added only to sound authentic.

4. EARNED FEELING. Create the promised emotional experience through development. Direct feeling or a named takeaway can belong to the form; what fails is announcing an emotion or lesson the story has not earned.

5. EVERY PASSAGE HAS A PURPOSE. Keep the context a first-time listener needs, as well as purposeful pauses, repetition or digressions. Cut material that contributes neither understanding nor the intended experience. Distill a short telling rather than compressing a whole longer plot into an outline.

6. THE LISTENER'S TEST. Hear the work aloud for its intended audience. Can they follow what matters, feel the intended movement, and receive the promised payoff? Correct broken or translated-sounding language without sanding away the chosen voice.`

// The spoken-voice register for the story's language — shared by every stage that touches the
// words (Writer, Editor, Naturalizer, channel-sample) so it can never drift between them.
//
// LANGUAGE-AGNOSTIC by design (see .claude/skills/unbiased-design → Language): the UNIVERSAL block
// applies to EVERY language; the model is never handed one language's conventions as the default and
// never left with nothing for the others. The Filipino register (below) gets an extra documented
// ADDENDUM layered on top. Adding another mixed-code language = another addendum here, not a
// rewrite. Never returns '' — every language gets the universal voice.

// The Filipino spoken register — one predicate so every stage groups these the same way. 'Taglish' and
// 'Tagalog' are no longer offered in the channel picker (a code-switch isn't a separate language, and
// Tagalog was a duplicate of Filipino), but both stay accepted here: channels created earlier carry them.
export function isFilipinoRegister(language: string): boolean {
  const l = language.toLowerCase()
  return l === 'taglish' || l === 'filipino' || l === 'tagalog'
}

// A neutral audience fallback; language does not establish age, nationality or cultural form.
export function defaultAudienceDescriptor(language: string): string {
  return `the intended audience for this ${language} channel`
}

export function spokenRegisterBlock(language: string, audienceDescriptor: string): string {
  const universal = `\nVOICE — write ${language} that ${audienceDescriptor} can follow when heard aloud. The creator's selected voice and form govern the register: conversational, documentary, lyrical, oral-traditional and other deliberate styles can all sound natural on their own terms.
- THE PERSON AND FORM SET THE REGISTER. Match the speaker's vocabulary, perspective and purposeful rhythm. Do not add slang, hesitations or self-corrections merely as proof of being human. Preserve intentional repetition or precision that serves this telling.
- NO LITERAL TRANSLATION. Think in ${language}; avoid word-for-word transfers that produce unnatural or broken phrasing. A chosen literary or formal register is not itself a language defect.
- Prefer words this audience understands. Familiarity depends on the audience and context, not whether a word is native or borrowed. Explain unfamiliar terms when they matter; do not replace them with inaccurate approximations.`

  if (!isFilipinoRegister(language)) return universal

  // Filipino code-switch addendum (documented per-language exception). Real spoken Filipino is
  // naturally code-switched — the English isn't "Taglish as a separate language," it's how people
  // actually talk. The REGISTER (who's telling it, natural default) is universal above; this block
  // governs ONLY how the code-switch itself falls — the one genuinely Filipino-specific thing.
  return (
    universal +
    `\n\nSPOKEN FILIPINO — when the selected speaker, audience and form use code-switching, let English and Filipino fall naturally. Follow a creator's monolingual or formal register when requested; the examples below describe casual speech, not a rule for every Filipino story.
- DON'T FORCE THE MIX. Let it fall where it naturally falls — some lines almost pure Tagalog, some mostly English, most a blend. Never balance the code-switch sentence by sentence; if a moment is naturally all-English or all-Tagalog, leave it.
- In a casual mixed register, everyday English terms may be the familiar choice (phone, text, CR, parking, signal, Messenger, screenshot). Choose what this audience uses.
- For casual conversation, "grabe, kinabahan ako," "may kakaiba sa likod," and "walang bakas" may fit better than elevated or awkward mixed wording. Avoid translating English word-for-word ("Parang mali na hindi ko masabi kung anong totoo" → say "Parang hindi ko na alam kung ano'ng totoo").
- WRONG-WORD TELLS — a Tagalog word used slightly off its real meaning, or an inappropriate word for the selected register, can distract as much as a translation. "Tigang na ako sa puyat" → "puyat na puyat na ako"; "sa isang iglap" → "bigla na lang"; "ume-echo sa utak ko" → "paulit-ulit sa isip ko"; "ibang usapan na" (translated filler) → "iba na 'to". Use the version that fits the chosen teller and audience; a legitimate word in another register is not automatically wrong.
Casual examples: "Akala ko hangin lang." / "Paglingon ko, wala naman." / "Ewan ko ba, pero simula nun…" / "Natawa pa nga ako, pero weird e." / "Promise, wala akong iniinom."
Avoid forced English inserts or mechanically balanced switching. Formal and literary Filipino are valid when the selected telling calls for them.`
  )
}
