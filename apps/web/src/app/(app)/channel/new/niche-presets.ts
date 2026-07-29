// Curated trending short-form / faceless-video niches. Picking one seeds the
// niche description (still fully editable) + suggests languages. This is a
// hand-curated list, not live TikTok data — edit freely as trends move.

// Selection id for a LIVE trending card (the rail in step 1), as opposed to the curated presets below.
// Derived from the label, not its position: the rail refreshes daily and an index-based id would
// highlight whatever card happens to sit in that slot on a draft resume. Lives here — a plain data
// module — so both the wizard (client) and the dashboard (server) can build the same id.
export function trendingId(label: string): string {
  return `trending:${label.trim().toLowerCase()}`
}

export interface NichePreset {
  id: string
  icon: string // key into PRESET_ICONS in NewChannelWizard.tsx
  color: string // literal tailwind classes for the icon chip (bg + text)
  label: string
  blurb: string // one-line shown on the card
  description: string // seeds the niche textarea
  language: string
  suggestedName: string // seeds the channel-name field (editable; never over a typed name)
}

export const NICHE_PRESETS: NichePreset[] = [
  {
    id: 'true-crime',
    icon: 'crime',
    color: 'bg-red-50 text-red-600',
    label: 'True crime',
    blurb: 'Cases, mysteries, investigations',
    description:
      'True-crime narration channel. Tightly-paced retellings of real case patterns — the timeline, the evidence, the one overlooked detail that turned it — dramatized with fictionalized names and places, sober and respectful, never lurid. Strong cold-open, clear stakes, a lingering question at the end.',
    language: 'English',
    suggestedName: 'The Case File',
  },
  {
    id: 'reddit-stories',
    icon: 'reddit',
    color: 'bg-orange-50 text-orange-600',
    label: 'Reddit stories',
    blurb: 'AITA, revenge, drama narration',
    description:
      'Reddit-style confession channel. First-person reads of relationship drama, AITA, petty revenge, and workplace fights that sound like REAL posts — mundane stakes people take sides over, messy narrators who incriminate themselves a little, details too boring to invent. Hook in the first line, petty escalation, endings that stop the way real posts stop — on the question, not a bow.',
    language: 'English',
    suggestedName: 'Confession Threads',
  },
  {
    id: 'motivation',
    icon: 'motivation',
    color: 'bg-amber-50 text-amber-600',
    label: 'Motivation & discipline',
    blurb: 'Stoicism, mindset, self-improvement',
    description:
      'Motivation and discipline channel. Hard-hitting short monologues on stoicism, focus, and self-improvement — one hard truth per video, named without flinching, with the cost of ignoring it made real. Direct second-person address, cinematic restraint, and a closing line the viewer repeats to themselves at 6AM.',
    language: 'English',
    suggestedName: 'The Daily Forge',
  },
  {
    id: 'fun-facts',
    icon: 'facts',
    color: 'bg-sky-50 text-sky-600',
    label: 'Did-you-know facts',
    blurb: 'Surprising facts, quick curiosity',
    description:
      'Curiosity channel built on one lane (for example: the deep sea, ancient Rome, the human body, aviation disasters). Each video takes something the viewer thinks they know and breaks it: one vivid "wait, what?" moment, made concrete enough to re-tell at dinner. Bright, quick, confident; ends with the idea in a shape they\'ll repeat.',
    language: 'English',
    suggestedName: 'Wait, What?',
  },
  {
    id: 'history',
    icon: 'history',
    color: 'bg-yellow-50 text-yellow-700',
    label: 'History & mysteries',
    blurb: 'Forgotten events, ancient enigmas',
    description:
      'History and mysteries channel. Short, atmospheric retellings of forgotten events, ancient enigmas, and "what really happened" stories — a strong narrative spine, evocative detail, an unresolved or eerie ending. Focused on one territory — an era, a region, or a thread (lost expeditions, royal scandals, vanished cities) — so the channel builds a world instead of sampling everything.',
    language: 'English',
    suggestedName: 'Lost Chapters',
  },
  {
    id: 'space-science',
    icon: 'space',
    color: 'bg-indigo-50 text-indigo-600',
    label: 'Space & science',
    blurb: 'Cosmic awe, big ideas, simply told',
    description:
      'Space and science wonder channel. Awe-driven explainers of cosmic and scientific ideas — scale, time, the unknown — each built on one assumption the viewer holds that turns out to be wrong, made felt through vivid comparison. Calm narration, a sense of vastness, a thought that lingers.',
    language: 'English',
    suggestedName: 'Beyond the Blue',
  },
  {
    id: 'money',
    icon: 'money',
    color: 'bg-emerald-50 text-emerald-600',
    label: 'Money & finance',
    blurb: 'Habits, hustle, practical tips',
    description:
      'Personal finance channel. Practical, no-fluff money insight for young earners — habits, saving, side income, and the traps hidden in everyday money decisions. One actionable idea per video, confident and plain-spoken, a clear "do this" close.',
    language: 'English',
    suggestedName: 'Plain Money',
  },
  {
    id: 'psychology',
    icon: 'psychology',
    color: 'bg-rose-50 text-rose-600',
    label: 'Psychology & relationships',
    blurb: 'Human behavior, dating, dynamics',
    description:
      'Psychology channel. Bite-size insight on why people do what they do — each video opens on a relatable scene (the text left on read, the friend who always cancels), then lands one idea that reframes it. Warm but sharp, never clinical; ends with the insight in words the viewer will quote at someone.',
    language: 'English',
    suggestedName: 'Why We Do It',
  },
  {
    id: 'horror',
    icon: 'horror',
    color: 'bg-violet-50 text-violet-600',
    label: 'Horror & folklore',
    blurb: 'Scary stories, local myths & legends',
    description:
      'Horror narration channel covering supernatural encounters, creatures, and local folklore, set in specific real-but-fictionalized places. The telling varies — first-hand encounters, retold legends, cautionary tales, found accounts — and so does the temperature: slow-burn dread, coiled suspense, sudden kinetic scares, old rules broken and paid for. Believable mundane setups, sensory detail, endings that land within a breath of the peak.',
    language: 'Filipino',
    suggestedName: 'Mga Kwentong Gabi',
  },
]
