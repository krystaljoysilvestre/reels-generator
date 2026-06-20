// Curated trending short-form / faceless-video niches. Picking one seeds the
// niche description (still fully editable) + suggests languages. This is a
// hand-curated list, not live TikTok data — edit freely as trends move.

export interface NichePreset {
  id: string
  icon: string // key into PRESET_ICONS in NewChannelWizard.tsx
  color: string // literal tailwind classes for the icon chip (bg + text)
  label: string
  blurb: string // one-line shown on the card
  description: string // seeds the niche textarea
  language: string
}

export const NICHE_PRESETS: NichePreset[] = [
  {
    id: 'true-crime',
    icon: 'crime',
    color: 'bg-red-50 text-red-600',
    label: 'True crime',
    blurb: 'Cases, mysteries, investigations',
    description:
      'True-crime narration channel. Tightly-paced retellings of solved and unsolved cases — the timeline, the evidence, the turning point — with a sober, respectful tone. Strong cold-open hook, clear stakes, a lingering question at the end.',
    language: 'English',
  },
  {
    id: 'reddit-stories',
    icon: 'reddit',
    color: 'bg-orange-50 text-orange-600',
    label: 'Reddit stories',
    blurb: 'AITA, revenge, drama narration',
    description:
      'Reddit-style story narration channel. Dramatic first-person reads of relationship drama, AITA, petty revenge, and workplace stories. Punchy hook in the first line, escalating tension, satisfying payoff.',
    language: 'English',
  },
  {
    id: 'motivation',
    icon: 'motivation',
    color: 'bg-amber-50 text-amber-600',
    label: 'Motivation & discipline',
    blurb: 'Stoicism, mindset, self-improvement',
    description:
      'Motivation and discipline channel. Hard-hitting short monologues on stoicism, focus, and self-improvement, built around one sharp idea per video. Direct second-person address, cinematic restraint, a memorable closing line.',
    language: 'English',
  },
  {
    id: 'fun-facts',
    icon: 'facts',
    color: 'bg-sky-50 text-sky-600',
    label: 'Did-you-know facts',
    blurb: 'Surprising facts, quick curiosity',
    description:
      'Curiosity / did-you-know channel. Rapid-fire surprising facts on a theme, each with a vivid hook and a clean payoff. Bright, fast pacing; one "wait, what?" moment per video.',
    language: 'English',
  },
  {
    id: 'history',
    icon: 'history',
    color: 'bg-yellow-50 text-yellow-700',
    label: 'History & mysteries',
    blurb: 'Forgotten events, ancient enigmas',
    description:
      'History and mysteries channel. Short, atmospheric retellings of forgotten events, ancient enigmas, and "what really happened" stories. Evocative imagery, a strong narrative spine, an unresolved or eerie ending.',
    language: 'English',
  },
  {
    id: 'space-science',
    icon: 'space',
    color: 'bg-indigo-50 text-indigo-600',
    label: 'Space & science',
    blurb: 'Cosmic awe, big ideas, simply told',
    description:
      'Space and science wonder channel. Awe-driven explainers of cosmic and scientific ideas — scale, time, the unknown — told simply and beautifully. Calm narration, a sense of vastness, a thought that lingers.',
    language: 'English',
  },
  {
    id: 'money',
    icon: 'money',
    color: 'bg-emerald-50 text-emerald-600',
    label: 'Money & finance',
    blurb: 'Habits, hustle, practical tips',
    description:
      'Personal finance channel. Practical, no-fluff tips on money habits, saving, and side income aimed at young earners. One actionable takeaway per video, confident and plain-spoken, a clear "do this" close.',
    language: 'English',
  },
  {
    id: 'psychology',
    icon: 'psychology',
    color: 'bg-rose-50 text-rose-600',
    label: 'Psychology & relationships',
    blurb: 'Human behavior, dating, dynamics',
    description:
      'Psychology channel. Bite-size insights on human behavior, relationships, and dating dynamics — why people do what they do. Warm but sharp tone, a relatable scenario, one insight that reframes it.',
    language: 'English',
  },
  {
    id: 'horror',
    icon: 'horror',
    color: 'bg-violet-50 text-violet-600',
    label: 'Horror & folklore',
    blurb: 'Scary stories, local myths & legends',
    description:
      'Horror narration channel covering supernatural encounters, creatures, and local folklore, set in specific real-but-fictionalized places. Slow-burn dread, sensory detail, believable mundane setup, twist endings. The telling can vary — first-hand encounters, retold legends, cautionary tales, found accounts — not one fixed format.',
    language: 'Taglish',
  },
]
