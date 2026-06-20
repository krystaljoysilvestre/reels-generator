// Mood matching across vocabularies. Story scene-moods use rich words (dread, grief,
// supernatural_warmth) while music beds carry generic tags (tense, dark, calm). Exact-string overlap
// misses almost everything, so we map BOTH sides to a small set of canonical buckets and score the
// overlap. Used to pick the bed that best fits a reel (mix-audio); robust to free-form LLM mood tags.

// Canonical buckets → substring keywords. A tag joins a bucket if it CONTAINS any keyword, so compound
// tags like "supernatural_warmth" land in multiple buckets (eerie + warm).
const MOOD_BUCKETS: Record<string, string[]> = {
  dark: ['dread', 'dark', 'ominous', 'sinister', 'grim', 'forebod', 'doom', 'menac', 'evil', 'bleak', 'malevolent'],
  tense: ['tense', 'suspense', 'intense', 'anxious', 'fear', 'terror', 'panic', 'urgent', 'frantic', 'danger', 'threat', 'unease', 'dread'],
  eerie: ['eerie', 'creep', 'haunt', 'uncanny', 'unsettl', 'spooky', 'ghost', 'supernatural', 'paranormal', 'otherworld', 'occult'],
  sad: ['sad', 'grief', 'sorrow', 'mourn', 'melanchol', 'loss', 'lonely', 'wistful', 'tragic', 'longing', 'somber', 'forlorn'],
  calm: ['calm', 'serene', 'peace', 'gentle', 'soft', 'tender', 'sooth', 'restrain', 'sparse', 'quiet', 'still', 'slow', 'meditat'],
  warm: ['warm', 'hope', 'comfort', 'nostalg', 'sacred', 'rever', 'intim', 'heart', 'love', 'fond'],
  energetic: ['energet', 'hype', 'excit', 'upbeat', 'driv', 'triumph', 'epic', 'power', 'bold', 'thrill', 'momentum', 'frenzied'],
  mysterious: ['myster', 'curious', 'intrigu', 'enigmat', 'wonder', 'awe', 'cryptic'],
  playful: ['play', 'fun', 'quirky', 'comed', 'light', 'whimsic', 'cheeky', 'goofy', 'jaunty', 'silly'],
}

// Expand free-form mood tags into the canonical buckets they imply.
export function toMoodBuckets(tags: string[]): Set<string> {
  const out = new Set<string>()
  for (const raw of tags) {
    const t = raw.toLowerCase()
    for (const [bucket, kws] of Object.entries(MOOD_BUCKETS)) {
      if (kws.some((k) => t.includes(k))) out.add(bucket)
    }
  }
  return out
}

// How well two mood-tag sets match: count of shared canonical buckets. 0 = no relation.
export function moodMatchScore(a: string[], b: string[]): number {
  const bb = toMoodBuckets(b)
  let n = 0
  for (const bucket of toMoodBuckets(a)) if (bb.has(bucket)) n++
  return n
}
