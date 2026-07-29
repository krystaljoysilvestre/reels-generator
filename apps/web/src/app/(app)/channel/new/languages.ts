// Languages the pipeline can handle: the model writes the story in them, and ElevenLabs TTS narrates
// them. A fixed list (no free text) so we never store a language we can't produce. Default is English
// (set in the wizard); the rest are alphabetical, so the picker reads as niche/region-neutral. (TTS
// voice coverage varies by language — verify per language when producing non-English channels.)
//
// ONE Filipino entry, deliberately. "Tagalog" and "Taglish" are not offered:
//   · Filipino is the national language (ISO 'fil' — the code our TTS actually uses; 'tl' is Tagalog)
//     and the register Philippine media is narrated in. It's also the label Netflix/YouTube/iOS use.
//   · Taglish is a code-switch, not a language — and picking Filipino already produces naturally
//     code-switched speech (the SPOKEN FILIPINO addendum in story-craft.v1 says so outright).
//   · Tagalog was a duplicate choice that changed NOTHING: isFilipinoRegister() groups all three, and
//     they share the same 'fil' voices and 'Filipino' cast nationality. Offering a distinction we don't
//     honor is worse than not offering it.
// Channels created earlier still carry 'tagalog'/'taglish' and keep working — isFilipinoRegister()
// accepts them on purpose. Don't re-add either here without re-reading that addendum.

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
  'Tamil',
  'Turkish',
  'Ukrainian',
  'Vietnamese',
]
