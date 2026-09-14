import { type SourcePolicy, DEFAULT_SOURCE_POLICY } from '../types/source-policy.js'
import { asGenreModule, classifyGenre, type GenreModule } from './scenes.v1.js'
import { resolveStyle, renderStyleTellingForWriter, STORY_STYLES_V1_VERSION, type StyleInfluence } from './story-styles.v1.js'
import { resolveVoice, STORY_VOICES_V1_VERSION } from './story-voices.v1.js'

// This is existing creator intent carried between stages, not a new creative proposal or taxonomy.
export const STORY_CONTEXT_VERSION = `story-context.v1+${STORY_STYLES_V1_VERSION}+${STORY_VOICES_V1_VERSION}`

export interface StoryCreativeContext {
  genre: string
  niche: string
  language: string
  audienceDescriptor: string
  targetSeconds: number
  narrativeStyle?: string | undefined
  styleInfluence?: StyleInfluence | undefined
  narrativeVoice?: string | undefined
  editorialPrinciples?: string | undefined
  sourcePolicy?: SourcePolicy | undefined
}

/** An explicit custom genre is intent, never permission to replace it with a keyword match. */
export function resolveWritingGenre(genreCategory: string | null | undefined, niche: string): GenreModule {
  const declared = genreCategory?.trim()
  return declared ? asGenreModule(declared.toLowerCase()) ?? 'general' : classifyGenre(niche)
}

export function renderStoryCreativeContext(context: StoryCreativeContext): string {
  const genre = resolveWritingGenre(context.genre, context.niche)
  const style = resolveStyle(genre, context.narrativeStyle)
  const voice = resolveVoice(context.narrativeVoice)
  const influence = context.styleInfluence ?? 'medium'
  const styleContext = style
    ? `${style.label} — ${style.tradition}\n${renderStyleTellingForWriter(style, influence)}`
    : context.narrativeStyle
  return `CREATOR'S STORY CONTRACT — judge and preserve this same intent at every stage.
Declared genre / form: ${context.genre || '(defined by the niche below)'}
Channel intent: ${context.niche}
Language: ${context.language}
Audience: ${context.audienceDescriptor}
Target duration: ${context.targetSeconds} seconds
${context.narrativeStyle ? `Selected storytelling style: ${styleContext}\nStyle influence: ${influence}. This sets the strength of a preference: light borrows selectively, medium works within the tradition, full commits to it where compatible with the creator's other direction. Do not turn lightly borrowed conventions into mandatory criteria.\n` : ''}${context.narrativeVoice ? `Selected narrator voice: ${voice ? `${voice.label} — ${voice.sound} ${voice.sentenceRhythm} ${voice.vocabularyLean}` : context.narrativeVoice}\n` : ''}${context.editorialPrinciples?.trim() ? `Creator's editorial rules:\n${context.editorialPrinciples.trim()}\n` : ''}
PRECEDENCE: source fidelity and safety constraints remain binding. Within those constraints, the creator's declared genre, form, style, voice, audience and editorial rules govern. Built-in genre guidance supplies defaults only where compatible with that intent; it does not narrow an unfamiliar or mixed genre into a familiar one. Infer the appropriate emotional promise and payoff from THIS contract, then judge whether the story earns them. A deliberate departure from a default is not a defect. Do not invent creator preferences or treat this direction as factual evidence.`
}

/** The same narrative permissions and existing safety floor for every authoring/refinement pass. */
export function renderStorySourceGuards(p: SourcePolicy = DEFAULT_SOURCE_POLICY): string {
  const places = p.realPlaces
    ? 'Real places may be named accurately; preserve their identity instead of inventing a stand-in.'
    : 'Fictionalize specific real places (invented street/business names; a real region/era is fine).'
  const people = p.realPeople === 'public_figures'
    ? 'Real public figures may be named and discussed, but never placed in invented scenes, quoted with words they did not say, or accused of anything not established by the source.'
    : p.realPeople === 'historical'
      ? 'Long-dead historical figures may be named; no living identifiable people and no invented wrongdoing attributed to real named parties.'
      : 'No real, identifiable people.'
  const events = p.realEvents
    ? 'Real documented events may be treated as real; never invent an event and present it as documented.'
    : 'Events are invented.'
  const invention = p.invention === 'none'
    ? 'Every load-bearing specific must come from the supplied source material — invent nothing.'
    : p.invention === 'constrained'
      ? 'The subject is real and must stay accurate; the telling is yours. Preserve established facts.'
      : 'Fiction may be invented within these permissions; never present an illustrative invention as verified fact.'
  return `SOURCE AND SAFETY CONSTRAINTS:
- ${places}
- ${people}
- ${events}
- ${invention}${p.evidenceRequired ? '\n- Factual claims require supplied evidence; confidence or plausibility is not verification.' : ''}
- No graphic gore or sexual content; never harm to minors as subject matter.
- Original work only — no retellings of known films, books, or copypastas.
- Naming permission applies to narration only; it never relaxes the depiction safety floor.`
}
