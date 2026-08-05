// The starting points offered on step 1 of the wizard.
//
// TWO lists, because they answer different questions:
//
// • NICHE_PRESETS — the genre grid. One tile per creator-facing genre (the same eight labels as
//   lib/genre-labels.ts, so the wording never drifts), and each tile's `id` IS its GenreModule value —
//   'horror', 'drama', 'reddit_story' … — so the tile is bound to the genre, never to its label text.
//   Broad on purpose: a creator recognizes "scary stories" faster than they place themselves in
//   "horror & folklore" vs "true crime". Each still seeds a real description, because the profile
//   derive is only as good as the text it reads — a bare genre word produces a generic channel.
//
// • CURATED_NICHES — narrower, hand-written niches. NOT shown in the grid any more; they remain the
//   dashboard's cold-start quick-start cards (when the live trending cache is empty) and they keep
//   resolving `?preset=<id>` deep links and drafts saved while they were the grid.
//
// Picking either seeds the niche description (still fully editable) and suggests a name + language.

// Selection id for a LIVE trending card (the rail in step 1), as opposed to the presets below.
// Derived from the label, not its position: the rail refreshes daily and an index-based id would
// highlight whatever card happens to sit in that slot on a draft resume. Lives here — a plain data
// module — so both the wizard (client) and the dashboard (server) can build the same id.
export function trendingId(label: string): string {
  return `trending:${label.trim().toLowerCase()}`
}

export interface NichePreset {
  id: string
  icon: string // key into ICON_PATHS in NewChannelWizard.tsx
  color: string // literal tailwind classes for the icon chip (bg + text)
  label: string
  blurb: string // one-line shown on the card
  description: string // seeds the niche textarea
  language: string
  suggestedName: string // seeds the channel-name field (editable; never over a typed name)
}

// ── The genre grid ────────────────────────────────────────────────────────────
// Order and labels mirror GENRE_OPTIONS in lib/genre-labels.ts; the ids ARE the GenreModule values.
export const NICHE_PRESETS: NichePreset[] = [
  {
    id: 'horror',
    icon: 'horror',
    color: 'bg-violet-50 text-violet-600',
    label: 'Scary stories',
    blurb: 'Eerie retellings, twist',
    description:
      'Horror narration channel — supernatural encounters, creatures, and local folklore set in specific real-but-fictionalized places. The telling varies (first-hand encounters, retold legends, cautionary tales, found accounts) and so does the temperature: slow-burn dread, coiled suspense, sudden kinetic scares, old rules broken and paid for. Believable mundane setups, sensory detail, endings that land within a breath of the peak.',
    language: 'English',
    suggestedName: 'Midnight Tales',
  },
  {
    id: 'drama',
    icon: 'drama',
    color: 'bg-rose-50 text-rose-600',
    label: 'Heartfelt drama',
    blurb: 'Emotional, human stories',
    description:
      'Emotional short-drama channel. Ordinary people at the moment a want collides with a need and forces a choice they can\'t take back — the thing left unsaid, the apology that comes too late, the loyalty that costs something. Intimate and specific, never sentimental; the ending changes who someone is, not just what happened.',
    language: 'English',
    suggestedName: 'The Unsaid',
  },
  {
    id: 'comedy',
    icon: 'comedy',
    color: 'bg-amber-50 text-amber-600',
    label: 'Comedy',
    blurb: 'Quick laughs & bits',
    description:
      'Comedy channel of short bits — observational riffs on everyday absurdity, escalating misunderstandings, and the small indignities everyone recognizes. One premise per video, pushed until it breaks, with the funniest turn saved for the last line.',
    language: 'English',
    suggestedName: 'Mildly Unhinged',
  },
  {
    id: 'reddit_story',
    icon: 'reddit',
    color: 'bg-orange-50 text-orange-600',
    label: 'Confession stories',
    blurb: 'Reddit-style true tales',
    description:
      'Reddit-style confession channel. First-person reads of relationship drama, AITA, petty revenge, and workplace fights that sound like REAL posts — mundane stakes people take sides over, messy narrators who incriminate themselves a little, details too boring to invent. Hook in the first line, petty escalation, endings that stop the way real posts stop — on the question, not a bow.',
    language: 'English',
    suggestedName: 'Confession Threads',
  },
  {
    id: 'commentary',
    icon: 'motivation',
    color: 'bg-red-50 text-red-600',
    label: 'Opinions & motivation',
    blurb: 'Takes, discipline, mindset',
    description:
      'Opinion and discipline channel. Hard-hitting short monologues on focus, self-improvement, and the takes most people won\'t say out loud — one hard truth per video, named without flinching, with the cost of ignoring it made real. Direct second-person address, cinematic restraint, and a closing line the viewer repeats to themselves at 6AM.',
    language: 'English',
    suggestedName: 'The Daily Forge',
  },
  {
    id: 'informational',
    icon: 'facts',
    color: 'bg-sky-50 text-sky-600',
    label: 'Facts & explainers',
    blurb: 'Told with awe & clarity',
    description:
      'Curiosity channel built on one lane (for example: the deep sea, ancient Rome, the human body, aviation disasters). Each video takes something the viewer thinks they know and breaks it: one vivid "wait, what?" moment, made concrete enough to re-tell at dinner. Bright, quick, confident; ends with the idea in a shape they\'ll repeat.',
    language: 'English',
    suggestedName: 'Wait, What?',
  },
  {
    id: 'lifestyle',
    icon: 'lifestyle',
    color: 'bg-emerald-50 text-emerald-600',
    label: 'Lifestyle & how-to',
    blurb: 'Tips, routines, recipes',
    description:
      'Practical lifestyle channel — routines, recipes, and how-to in one lane the channel owns. Each video delivers one thing the viewer can do today, shown start to finish with the step everyone gets wrong called out. Warm and unhurried, never a listicle; ends on the result, not a sign-off.',
    language: 'English',
    suggestedName: 'Small Habits',
  },
  {
    id: 'general',
    icon: 'general',
    color: 'bg-slate-100 text-slate-600',
    label: 'A bit of everything',
    blurb: 'Mix it up per reel',
    description:
      'A general storytelling channel that follows whatever is genuinely interesting — a strange true event one day, a human moment the next. The through-line is the telling, not the subject: a strong hook, one idea per video, and an ending that lands. Each story picks the register it needs.',
    language: 'English',
    suggestedName: 'Worth Telling',
  },
]

// ── Curated narrower niches ───────────────────────────────────────────────────
// Kept for the dashboard's cold-start quick-start cards and for resolving older `?preset=` links and
// saved drafts. Edit freely as trends move — this is a hand-curated list, not live data.
export const CURATED_NICHES: NichePreset[] = [
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
    icon: 'drama',
    color: 'bg-rose-50 text-rose-600',
    label: 'Psychology & relationships',
    blurb: 'Human behavior, dating, dynamics',
    description:
      'Psychology channel. Bite-size insight on why people do what they do — each video opens on a relatable scene (the text left on read, the friend who always cancels), then lands one idea that reframes it. Warm but sharp, never clinical; ends with the insight in words the viewer will quote at someone.',
    language: 'English',
    suggestedName: 'Why We Do It',
  },
  {
    id: 'horror-folklore',
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

// Any preset id the wizard might be handed — a grid tile, a dashboard quick-start, or a draft saved
// before the grid changed. One lookup so a legacy `?preset=` link still seeds its original text.
export function findPreset(id: string): NichePreset | undefined {
  return NICHE_PRESETS.find((p) => p.id === id) ?? CURATED_NICHES.find((p) => p.id === id)
}
