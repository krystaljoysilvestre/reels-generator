// Languages the pipeline can handle: Claude writes the story in them, and ElevenLabs TTS narrates
// them. "Taglish" is a Tagalog↔English code-switch. A fixed list (no free text) so we never store a
// language we can't produce. Default is English (set in the wizard); the rest are alphabetical, so the
// picker reads as niche/region-neutral. (TTS voice coverage varies by language — verify per language
// when producing non-English channels.)

export const SUPPORTED_LANGUAGES: string[] = [
  'English',
  'Arabic',
  'Bulgarian',
  'Chinese',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'Filipino',
  'Finnish',
  'French',
  'German',
  'Greek',
  'Hindi',
  'Indonesian',
  'Italian',
  'Japanese',
  'Korean',
  'Malay',
  'Polish',
  'Portuguese',
  'Romanian',
  'Russian',
  'Slovak',
  'Spanish',
  'Swedish',
  'Tagalog',
  'Taglish',
  'Tamil',
  'Turkish',
  'Ukrainian',
  'Vietnamese',
]
