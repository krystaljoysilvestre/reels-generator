// Languages the pipeline can realistically handle: Claude writes the story in
// them, and ElevenLabs TTS supports them for narration. "Taglish" is our special
// Tagalog↔English code-switch. Picked from a fixed list (no free text) so we
// never store a language we can't actually produce.
//
// NOTE: the per-reel story prompt (story.v1) currently formally types only
// tagalog/taglish/english — widen that union when we wire reel production for
// non-Filipino channels. Storing these on the channel is fine today.

export const SUPPORTED_LANGUAGES: string[] = [
  // Filipino-first (our core)
  'Tagalog',
  'Taglish',
  'English',
  // Rest, alphabetical
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
  'Tamil',
  'Turkish',
  'Ukrainian',
  'Vietnamese',
]
