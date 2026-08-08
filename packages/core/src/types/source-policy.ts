// Source Policy — what a channel's stories may treat as REAL (specs/channel-series.md's sibling
// dimension; see ~/.claude/plans/staged-beaming-lovelace.md W4).
//
// Four switches already expressed this idea and none of them were creator-visible: `storyMode`
// ('ebn' = facts supplied and frozen), `ebnSpecialization`, `factCheck` (advisory fidelity pass), and
// the planner's GUARDS line (which unconditionally told every channel to fictionalize real places).
// A folklore/history channel is built ON real named places and real documented legends, so that last
// one silently laundered "White Lady of Balete Drive" into an invented street on every reel.
//
// This is a CONSOLIDATION, not new plumbing: the policy SETS the existing switches rather than
// replacing them, so EBN's load-bearing path is untouched and an old row derives a policy from the
// columns it already has.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// PRECEDENCE — this is the part that must never be misread:
//
//   Platform floor        depictive-ethics floor · EBN illustrative floor · safety guards
//     ↓  NON-OVERRIDABLE — ratified "floors-are-law", a hard safety constraint, explicitly not taste
//   Channel Source Policy creator intent: what the STORY may treat as real
//     ↓
//   Series override
//     ↓
//   Frozen reel policy    resolved at creation, never re-resolved
//
// Source Policy expresses creator choice STRICTLY WITHIN the platform's non-overridable safety and
// depiction floor. It cannot authorize any category prohibited globally, and no future field may be
// added that would.
//
// In particular `realPeople` is NARRATIVE permission, never DEPICTION permission. The depictive-ethics
// floor triggers on IDENTITY, not on people: naming a real living public figure in narration is already
// permitted today; rendering them as if photographed at an event that never happened never is, at any
// setting of this policy. See specs/depictive-ethics-floor.md.
// ────────────────────────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'

export const SourcePolicySchema = z.object({
  // May the story NAME real places accurately (Balete Drive, Corregidor) instead of inventing a
  // stand-in? Also gates the Wikimedia real-photo sourcing path for those locations.
  realPlaces: z.boolean().default(false),
  // May the story treat real documented EVENTS as real (a wartime disappearance, a real disaster)?
  realEvents: z.boolean().default(false),
  // NARRATIVE reference to real people. 'none' = fictionalize everyone (today's behaviour for every
  // existing channel); 'historical' = long-dead public-domain figures may be named; 'public_figures' =
  // living public figures may be named and discussed. Depiction is the floor's, at every value.
  realPeople: z.enum(['none', 'historical', 'public_figures']).default('none'),
  // Must claims be checkable against supplied source material? Drives factCheck (and, where a dossier
  // is required up front, storyMode='ebn').
  evidenceRequired: z.boolean().default(false),
  // How much the Planner may invent. 'free' = invent everything (fiction). 'constrained' = the SUBJECT
  // is real, the telling is the writer's. 'none' = nothing may be invented; every load-bearing specific
  // comes from evidence.
  invention: z.enum(['free', 'constrained', 'none']).default('free'),
})
export type SourcePolicy = z.infer<typeof SourcePolicySchema>

/** Today's behaviour for every channel that predates this dimension: invent everything, name nobody. */
export const DEFAULT_SOURCE_POLICY: SourcePolicy = SourcePolicySchema.parse({})

/**
 * The policy for a channel that has never had one set, inferred from the columns it already carries.
 * Deliberately CONSERVATIVE: an existing channel keeps behaving exactly as it does today, and where a
 * column implies factual intent we turn on the checking, never the permissions. Nothing here silently
 * grants a channel the right to name real people or places — that stays an explicit creator choice.
 */
export function legacySourcePolicy(channel: {
  storyMode?: string | null
  factCheck?: boolean | null
  genreCategory?: string | null
}): SourcePolicy {
  const ebn = channel.storyMode === 'ebn'
  return SourcePolicySchema.parse({
    // NOT inferred from genre. An informational channel is often factual, but "probably factual" is not
    // a licence to start naming real places in output that used to fictionalize them.
    realPlaces: false,
    realEvents: ebn,
    realPeople: 'none',
    evidenceRequired: ebn || channel.factCheck === true,
    invention: ebn ? 'none' : 'free',
  })
}

/**
 * The ONE seam every consumer reads policy through — the `resolvePlatformPreset()` / `effectiveGenre()`
 * pattern. Consumers never index `channels.sourcePolicy` directly, so when policy eventually moves off
 * `channels` (the signal being a THIRD resolution scope, most likely org-level brand safety), this is
 * the only function that changes.
 *
 * Order: the reel's FROZEN policy wins outright — a reel generated under "fictional only" must never be
 * re-judged, re-rendered or re-cache-keyed under "real places allowed". Only when a reel has none
 * (created before this dimension existed) do we fall back to series → channel → legacy inference.
 */
export function resolveChannelPolicy(
  reel: { sourcePolicy?: unknown } | null | undefined,
  series: { sourcePolicy?: unknown } | null | undefined,
  channel: { sourcePolicy?: unknown; storyMode?: string | null; factCheck?: boolean | null; genreCategory?: string | null },
): SourcePolicy {
  const frozen = SourcePolicySchema.safeParse(reel?.sourcePolicy)
  if (reel?.sourcePolicy && frozen.success) return frozen.data

  const fromSeries = SourcePolicySchema.safeParse(series?.sourcePolicy)
  if (series?.sourcePolicy && fromSeries.success) return fromSeries.data

  const fromChannel = SourcePolicySchema.safeParse(channel.sourcePolicy)
  if (channel.sourcePolicy && fromChannel.success) return fromChannel.data

  return legacySourcePolicy(channel)
}

/**
 * Whether topic/subject generation for this channel must name only real, already-documented things.
 * Replaces the conservative heuristic the series replenisher hardcoded before this dimension existed
 * (`storyMode === 'ebn' || genreCategory === 'informational'`), which got it backwards for exactly the
 * motivating case: a folklore channel sits on `horror`, so it was told invention was fine — while its
 * whole premise is real legends people can look up.
 */
export function requiresRealSubjects(p: SourcePolicy): boolean {
  return p.invention !== 'free' || p.evidenceRequired || p.realEvents || p.realPlaces
}

// ── The question the wizard asks when the description doesn't settle the policy ──────────────────
//
// This list is CODE, not model output, on purpose. A live derivation omitted the policy (correctly —
// "cinematic science what-ifs" is genuinely ambiguous) and then emitted no question either, which would
// have left the channel silently on the restrictive default with the creator never asked. A prompt
// instruction is the wrong mechanism for the one question whose wrong answer is unsafe in both
// directions; the model may still phrase a nicer question, but the CHOICES are guaranteed by code.
//
// Four options, spanning the real space without asking anyone to reason about five booleans.
export const SOURCE_POLICY_CHOICES: { label: string; hint: string; value: SourcePolicy }[] = [
  {
    label: 'Completely invented stories',
    hint: 'Places, people and events are all made up. Nothing real is named.',
    value: SourcePolicySchema.parse({ invention: 'free' }),
  },
  {
    label: 'Real places and real history',
    hint: 'Real locations and documented events, named accurately. People stay fictionalized.',
    value: SourcePolicySchema.parse({ realPlaces: true, realEvents: true, realPeople: 'historical', invention: 'constrained' }),
  },
  {
    label: 'Real subjects, checked against sources',
    hint: 'Everything is real and must hold up: real places, real events, and claims backed by source material.',
    value: SourcePolicySchema.parse({ realPlaces: true, realEvents: true, realPeople: 'historical', evidenceRequired: true, invention: 'none' }),
  },
  {
    label: 'Real people in the news',
    hint: 'Living public figures may be named and discussed — tech, business, sports, current events.',
    value: SourcePolicySchema.parse({ realEvents: true, realPeople: 'public_figures', evidenceRequired: true, invention: 'none' }),
  },
]

/**
 * The wizard MUST ask when this returns true. Code-enforced rather than prompt-enforced: the derivation
 * is free to omit the policy (and should, when the description is genuinely ambiguous), but it must never
 * be possible for a channel to end up with an unasked, silently-defaulted policy.
 */
export function mustAskSourcePolicy(derived: { sourcePolicy?: SourcePolicy | undefined }): boolean {
  return !derived.sourcePolicy
}
