// story-styles.v1 — the STYLE layer: the storytelling TRADITION a channel works in, within its
// genre (horror → urban_legend / psychological / found_footage / folk). Per-channel, operator-
// selectable. A refinement of HOW a genre is expressed, not a new genre.
//
// ── LAYER-RESPONSIBILITY RULE (the de-dup test) ──
// Style BIASES, it does not OWN. Genre owns the emotional promise; story-mechanics own the emotional
// levers; story-elements own the composition knobs (structure/turn/setting/anchor…); the writer
// identity owns voice. Style must NOT re-declare reveal-type / structure / pacing as authoritative
// fields — those already live in Elements/Mechanics/Planner. Style only TILTS the Planner's choices
// among them (`leans`) and adds the tradition's telling conventions (`conventions`, Writer-facing).
// If a field here duplicates something a prior layer owns, it belongs there, not in Style.
//
// Authored under .claude/skills/unbiased-design: tendencies to reason from, never quotas or a single
// texture. The influence dial (light|medium|full) scales how hard to lean, so we don't need a dozen
// near-duplicate styles. NAMING: this is `narrativeStyle` — NOT the visual `stylePreset`.
// Versioned source code: any edit bumps STORY_STYLES_V1_VERSION (rides into planner/writer versions).

import type { GenreModule } from './scenes.v1.js'

export const STORY_STYLES_V1_VERSION = 'styles.v1'

export type StyleInfluence = 'light' | 'medium' | 'full'

export interface StyleSpec {
  /** e.g. "Urban legend" — shown in the picker */
  label: string
  /** one line: what tradition this borrows from */
  tradition: string
  /** the telling conventions this tradition uses (Writer-facing) */
  conventions: string[]
  /** the BIAS it applies to the Planner's existing knobs — a tilt, never an owned field */
  leans: string
  /** style-specific things to avoid */
  antiPatterns: string[]
}

// 3–4 styles per genre at launch (styles are product features — expand on real usage, not upfront).
// general = {} (freeform: no style layer, pure genre).
export const STORY_STYLES: Record<GenreModule, Record<string, StyleSpec>> = {
  horror: {
    urban_legend: {
      label: 'Urban legend',
      tradition: 'The story everyone swears happened to a friend-of-a-friend — a warning that could be about your own street.',
      conventions: [
        'Familiar, everyday setting the viewer also lives in (a condo, a jeepney, the CR at work).',
        'Told as something that really happened, first- or second-hand, plainly.',
        'A rule or warning under it ("that\'s why you never…").',
      ],
      leans: 'Favors the ordinary-turned-wrong and contamination of a shared everyday thing; the threat stays folk-plausible, never elaborate lore.',
      antiPatterns: ['Elaborate mythology or named demonology.', 'A setting too exotic to feel like the viewer\'s own life.'],
    },
    psychological: {
      label: 'Psychological',
      tradition: 'The horror of not trusting your own perception — is it out there, or in the narrator?',
      conventions: [
        'Unreliable narration; the viewer can\'t fully trust what\'s reported.',
        'Interior pressure — paranoia, sleeplessness, doubt — carries as much weight as any event.',
        'Ambiguity held to the end; the explanation stays out of reach.',
      ],
      leans: 'Favors indirect, ambiguous reveals and internal escalation over an external monster; withholds more than it shows.',
      antiPatterns: ['A clean external explanation that resolves the ambiguity.', 'A concrete creature reveal that collapses the doubt.'],
    },
    found_footage: {
      label: 'Found footage',
      tradition: 'A recovered recording — CCTV, a livestream, a last voice note — pieced together after.',
      conventions: [
        'Limited, single-perspective observation; the frame only sees so much.',
        'Incomplete information — gaps, dropouts, what the camera missed.',
        'Present-tense immediacy, as if narrated while it happens or transcribed from a device.',
      ],
      leans: 'Favors what the record captured vs what it couldn\'t; the dread is in the off-frame and the cut-off.',
      antiPatterns: ['Omniscient narration the recording couldn\'t contain.', 'A tidy, fully-explained ending.'],
    },
    folk: {
      label: 'Folk horror',
      tradition: 'Old rural belief, ritual, and the land itself — the province remembers what the city forgot.',
      conventions: [
        'Rooted in place, custom, and season; the setting is a character.',
        'An old rule or observance the narrator broke or ignored.',
        'The community knows something the outsider/narrator doesn\'t.',
      ],
      leans: 'Favors inevitability and irreversible-choice mechanics; dread grows from tradition and place, not a lone haunt.',
      antiPatterns: ['Modern-urban framing that erases the folk texture.', 'A jump-scare where a slow, earned wrongness belongs.'],
    },
  },

  drama: {
    slice_of_life: {
      label: 'Slice of life',
      tradition: 'A small ordinary moment that turns out to carry everything.',
      conventions: ['Low-key, everyday stakes.', 'The weight lives in the mundane detail.', 'No villain — just people and time.'],
      leans: 'Favors the unmet-need and the-unsaid; the turn is quiet recognition, not a big event.',
      antiPatterns: ['Manufactured melodrama.', 'A tidy lesson stapled on.'],
    },
    tragedy: {
      label: 'Tragedy',
      tradition: 'A loss the viewer can see coming and can\'t stop.',
      conventions: ['A flaw or circumstance that makes the ending feel inevitable.', 'The reader understands before the narrator.', 'The cost is real and irreversible.'],
      leans: 'Favors irreversible-loss and too-late-truth; the ending lands hard and stays.',
      antiPatterns: ['A last-minute rescue that cheapens the fall.', 'Grief used as decoration.'],
    },
    coming_of_age: {
      label: 'Coming of age',
      tradition: 'The moment someone stops being who they were.',
      conventions: ['A before/after the narrator can name later.', 'A first: first loss, first betrayal, first real choice.', 'Retrospective warmth or ache.'],
      leans: 'Favors misunderstanding and sacrifice; the turn is a permanent change in the self.',
      antiPatterns: ['Nostalgia with no cost.', 'An adult narrator who learned nothing.'],
    },
  },

  reddit_story: {
    aita: {
      label: 'AITA',
      tradition: '"Am I the asshole?" — a dispute posted for strangers to judge.',
      conventions: ['Opens mid-argument, already defensive.', 'Lays out "my side" with suspicious thoroughness.', 'Invites a verdict.'],
      leans: 'Favors the moral-split and self-incrimination; the narrator reveals their own fault without meaning to.',
      antiPatterns: ['A narrator who is cleanly, obviously right.', 'A tidy resolution instead of an open verdict.'],
    },
    tifu: {
      label: 'TIFU',
      tradition: '"Today I f***ed up" — a mistake confessed, half-cringing, half-laughing.',
      conventions: ['Escalating small decisions, each reasonable in the moment.', 'Self-aware, embarrassed narration.', 'The full scale of the mess lands at the end.'],
      leans: 'Favors escalation-ladder and delayed-realization; the fault is the narrator\'s own.',
      antiPatterns: ['Blaming everyone else.', 'A brag disguised as a confession.'],
    },
    petty_revenge: {
      label: 'Petty revenge',
      tradition: 'The small, satisfying comeuppance — proportionate, deniable, deeply enjoyed.',
      conventions: ['A wrong that\'s minor but infuriating.', 'A cleverly restrained response.', 'The quiet satisfaction of the payoff.'],
      leans: 'Favors setups where the mundane stakes matter and the turn is earned justice.',
      antiPatterns: ['Disproportionate cruelty that loses the reader.', 'A revenge that required no wit.'],
    },
  },

  commentary: {
    hot_take: {
      label: 'Hot take',
      tradition: 'The confident, contrarian position stated without flinching.',
      conventions: ['Claim first, cold.', 'One line the reader will want to quote or fight.', 'No hedging.'],
      leans: 'Favors sacred-cow and name-the-unsaid; picks a real fight.',
      antiPatterns: ['Hedging into mush.', 'A take so safe no one could disagree.'],
    },
    satire: {
      label: 'Satire',
      tradition: 'Making the point by playing it straight to absurdity.',
      conventions: ['Deadpan commitment to the bit.', 'Exaggeration that exposes the real thing.', 'The target is clear underneath.'],
      leans: 'Favors double-standard framing; the humor carries the argument.',
      antiPatterns: ['Winking so hard the satire collapses.', 'Punching down.'],
    },
    personal_essay: {
      label: 'Personal essay',
      tradition: 'The opinion earned through lived experience.',
      conventions: ['A specific personal story anchors the argument.', 'Reflection, not just assertion.', 'Arrives at the take by the end, not the start.'],
      leans: 'Favors receipts drawn from the narrator\'s own life; concedes before it turns.',
      antiPatterns: ['Generic opinion with no lived detail.', 'A conclusion the story didn\'t earn.'],
    },
  },

  comedy: {
    absurdist: {
      label: 'Absurdist',
      tradition: 'A ridiculous premise followed with total logical seriousness.',
      conventions: ['One insane rule, obeyed strictly.', 'Escalation by that rule\'s own logic.', 'Straight-faced throughout.'],
      leans: 'Favors logical-escalation to the one-step-too-far.',
      antiPatterns: ['Random zaniness with no internal logic.', 'The narrator breaking to laugh.'],
    },
    observational: {
      label: 'Observational',
      tradition: 'The comedy of "why is this so specifically true".',
      conventions: ['Hyper-specific everyday detail.', 'Recognition humor — "this is us".', 'Precision over exaggeration.'],
      leans: 'Favors hyper-specificity; the laugh is recognition, not surprise.',
      antiPatterns: ['Generic relatability with no specific bite.'],
    },
    deadpan_story: {
      label: 'Deadpan story',
      tradition: 'An escalating personal anecdote told flat, funnier for the flatness.',
      conventions: ['Understated narration of an increasingly ridiculous situation.', 'The funny word lands last.', 'A callback that returns at the worst moment.'],
      leans: 'Favors expectation-subversion and callback.',
      antiPatterns: ['Over-selling the joke.', 'Reacting to the punchline instead of landing it.'],
    },
  },

  informational: {
    explainer: {
      label: 'Explainer',
      tradition: 'The clear "here\'s how this actually works".',
      conventions: ['One idea, one vivid case.', 'Plain language, no jargon dump.', 'A carryable takeaway.'],
      leans: 'Favors misconception-flip and the-so-what.',
      antiPatterns: ['Covering everything, landing nothing.'],
    },
    myth_busting: {
      label: 'Myth-busting',
      tradition: '"You believe X. Here\'s why it\'s wrong."',
      conventions: ['Names the common belief first.', 'The collision — evidence against it.', 'The corrected picture.'],
      leans: 'Favors the misconception-flip hard; the reveal is being wrong.',
      antiPatterns: ['A strawman nobody believes.', 'Smugness over clarity.'],
    },
    deep_dive: {
      label: 'Deep dive',
      tradition: 'The satisfying "let me take you all the way down".',
      conventions: ['A curiosity gap opened early and paid off.', 'Layered build, each beat earning the next.', 'A landing that reframes the opening.'],
      leans: 'Favors curiosity-gap and felt-scale.',
      antiPatterns: ['Depth that loses the thread.', 'A build with no payoff.'],
    },
  },

  lifestyle: {
    aspirational: {
      label: 'Aspirational',
      tradition: 'The beautiful thing you suddenly want.',
      conventions: ['Lead with the wantable payoff.', 'Sensory, warm, close.', 'A visible first step.'],
      leans: 'Favors payoff-first and sensory-anchor.',
      antiPatterns: ['Glossy with no texture.', 'Enviable but unreachable.'],
    },
    day_in_life: {
      label: 'Day in the life',
      tradition: 'The intimate "come with me through this".',
      conventions: ['Present-tense, first-person walk-through.', 'Real small moments over highlights.', 'The feel of the routine.'],
      leans: 'Favors insider-secret and sensory-anchor.',
      antiPatterns: ['A staged highlight reel with no real texture.'],
    },
    transformation: {
      label: 'Transformation',
      tradition: 'The before → after that feels achievable.',
      conventions: ['A clear starting point the viewer recognizes.', 'The turn/effort that mattered.', 'An attainable path, not a miracle.'],
      leans: 'Favors attainability; desire plus a believable first step.',
      antiPatterns: ['An after so extreme it reads fake.'],
    },
  },

  general: {},
}

// Flat union of every style id, cast to a non-empty tuple so `z.enum(STYLE_VALUES)` type-checks.
export const STYLE_VALUES = [
  ...new Set(Object.values(STORY_STYLES).flatMap((byId) => Object.keys(byId))),
] as unknown as [string, ...string[]]

// Styles available for a genre — for the wizard/settings picker.
export function stylesForGenre(genre: GenreModule): Array<{ id: string; label: string }> {
  return Object.entries(STORY_STYLES[genre] ?? {}).map(([id, s]) => ({ id, label: s.label }))
}

// Resolve a (genre, style) to its spec. null = no style layer (pure genre) — also the graceful
// fallback when a style doesn't belong to the genre, so a mismatch never errors.
export function resolveStyle(genre: GenreModule, style: string | null | undefined): StyleSpec | null {
  if (!style) return null
  return STORY_STYLES[genre]?.[style] ?? null
}

const INFLUENCE_LEAD: Record<StyleInfluence, string> = {
  light: 'Lightly borrow from',
  medium: 'Work in the tradition of',
  full: 'Fully commit to',
}

// Planner-facing: the tradition + its bias over the existing knobs (influence-scaled). Never owns
// structure/reveal/pacing — it tilts them.
export function renderStyleForPlanner(spec: StyleSpec, influence: StyleInfluence): string {
  return `STORY STYLE — ${INFLUENCE_LEAD[influence]} the ${spec.label} tradition (${spec.tradition}).
It leans your choices this way (a bias on the story you plan, never a rule): ${spec.leans}
Avoid, for this style: ${spec.antiPatterns.join(' ')}
This tilts the story you commit to; it does not override the genre's mechanics or your freedom to serve the story.`
}

// Writer-facing: the tradition's telling conventions (influence-scaled). Voice/rhythm stay the
// identity's + narrativeVoice's job; this is the tradition's texture.
export function renderStyleTellingForWriter(spec: StyleSpec, influence: StyleInfluence): string {
  return `STYLE — ${INFLUENCE_LEAD[influence]} the ${spec.label} tradition when telling this: ${spec.conventions.join(' ')} (Conventions to reach for when they fit — the story outranks them.)`
}
