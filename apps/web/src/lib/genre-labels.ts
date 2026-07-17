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
