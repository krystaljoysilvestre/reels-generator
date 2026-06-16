// Few-shot story selection + weighting (docs/04 §2.2)

export interface ReferenceStory {
  title: string
  narration: string
  subgenreTags: string[]
  performanceScore: number   // 0–100
  createdAt: Date
}

interface WeightedStory {
  story: ReferenceStory
  weight: number
}

export function selectFewShot(
  stories: ReferenceStory[],
  targetTags: string[],
  topN = 5,
): ReferenceStory[] {
  if (stories.length === 0) return []

  const now = Date.now()
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

  const weighted: WeightedStory[] = stories.map((s) => {
    const perfScore = (s.performanceScore / 100) * 0.5                      // 0.5 weight
    const recencyScore = Math.max(0, 1 - (now - s.createdAt.getTime()) / (ONE_WEEK_MS * 8)) * 0.3  // 0.3 weight
    const tagOverlap = targetTags.filter((t) => s.subgenreTags.includes(t)).length
    const tagScore = (tagOverlap / Math.max(targetTags.length, 1)) * 0.2    // 0.2 weight
    return { story: s, weight: perfScore + recencyScore + tagScore }
  })

  weighted.sort((a, b) => b.weight - a.weight)
  return weighted.slice(0, topN).map((w) => w.story)
}

export function formatFewShot(stories: ReferenceStory[]): string {
  if (stories.length === 0) return '(no reference stories yet — write in the channel voice)'
  return stories
    .map((s, i) => `--- Reference ${i + 1}: "${s.title}" ---\n${s.narration}`)
    .join('\n\n')
}
