// Creator-facing genre labels (house voice — outcomes, not taxonomy). One list shared by the
// wizard's genre chip and Settings so the wording never drifts. Values are GenreModule ids.
export const GENRE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'horror', label: 'Scary stories' },
  { value: 'drama', label: 'Heartfelt drama' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'reddit_story', label: 'Confession stories' },
  { value: 'commentary', label: 'Opinions & motivation' },
  { value: 'informational', label: 'Facts & explainers' },
  { value: 'lifestyle', label: 'Lifestyle & how-to' },
  { value: 'general', label: 'A bit of everything' },
]

export function genreLabel(value: string | null | undefined): string {
  return GENRE_OPTIONS.find((g) => g.value === value)?.label ?? 'A bit of everything'
}

// How the narration reaches the audience (house voice). A lean the pipeline reasons from — each story
// still decides for itself, so "Hosted" is a preference, never a guarantee a host appears. Shared by the
// wizard and Settings. Values map to channels.presentation ('' | 'voiceover' | 'hosted').
export const PRESENTATION_OPTIONS: Array<{ value: '' | 'voiceover' | 'hosted'; label: string }> = [
  { value: '', label: 'Auto — decide per story' },
  { value: 'voiceover', label: 'Voiceover — no one on screen' },
  { value: 'hosted', label: 'Hosted — an on-screen presenter' },
]
