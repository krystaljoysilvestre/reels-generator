// Series queue — picking the next subject for a channel that has an Editorial Program.
// See specs/channel-series.md.
//
// Before this, the only source of story subjects was the Planner inventing one against an abstract
// structural angle. That is the right default for an anthology and the WRONG one for a channel whose
// creator already listed what it covers. This module answers one question — "what should the next reel
// be about?" — and answers it with `null` whenever the channel has nothing queued, which is what keeps
// the whole feature additive: no series, or an empty queue, and the caller behaves exactly as before.
//
// Rotation is round-robin over enabled series by orderIdx. That is a STARTING DEFAULT, not a considered
// scheduling policy — freshness/engagement weighting is deliberately out of scope (RFC).
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, channelSeries, seriesTopics, reels, recordSpendEvent } from '@reels/db'
import { llmCall } from '@reels/providers'
import { buildSeriesTopicsPrompt, SeriesTopicsSchema, SERIES_TOPICS_V1_VERSION } from '@reels/core/prompts/series-topics.v1'
import { resolveChannelPolicy, requiresRealSubjects } from '@reels/core'
import { buildEvidenceAcquirePrompt, EvidenceAcquireSchema, EVIDENCE_ACQUIRE_V1_VERSION, renderDossier } from '@reels/core/prompts/evidence-acquire.v1'

/**
 * The channel fields this module needs. `sourcePolicy` is declared explicitly even though it is only
 * read through resolveChannelPolicy: a narrower type still COMPILES (every field on the resolver is
 * optional) while silently falling through to the legacy inference, so an explicitly-set channel policy
 * would be ignored with no error anywhere.
 */
export interface SeriesChannel {
  id: string
  name: string
  nicheDescription: string
  userId: string | null
  storyMode: string | null
  genreCategory: string
  factCheck?: boolean | null
  sourcePolicy?: unknown
}

export interface SeriesPick {
  seriesId: string
  seriesName: string
  topicId: string
  subject: string
  /** The series' own genre override, or null when it has no opinion (→ falls back to the channel's). */
  genreCategory: string | null
  narrativeStyle: string | null
}

/**
 * The next (series, topic) for this channel, or null when there is nothing queued anywhere.
 *
 * Fairness: the series that has gone longest without producing a reel goes next. Using
 * "reels produced per series" rather than a stored cursor means the rotation self-corrects — a series
 * added later, or re-enabled after a pause, catches up instead of waiting a full cycle, and there is no
 * cursor to drift out of sync with the actual reels. Ties break on orderIdx, so a fresh channel whose
 * series have all produced nothing runs them in the creator's own order.
 */
export async function pickNextSeriesTopic(
  channelId: string,
  // Passing the channel row enables auto-replenish when a series runs dry. Omit it (tests, read-only
  // callers) and a dry series is simply skipped — no generation, no spend.
  channel?: SeriesChannel,
): Promise<SeriesPick | null> {
  const db = getDb()

  const allSeries = await db
    .select()
    .from(channelSeries)
    .where(and(eq(channelSeries.channelId, channelId), eq(channelSeries.enabled, true)))
    .orderBy(asc(channelSeries.orderIdx))
  if (allSeries.length === 0) return null

  // How many reels each series has produced (only enabled ones matter).
  const counts = new Map<string, number>()
  const rows = await db
    .select({ seriesId: reels.seriesId, n: sql<number>`count(*)::int` })
    .from(reels)
    .where(inArray(reels.seriesId, allSeries.map((s) => s.id)))
    .groupBy(reels.seriesId)
  for (const r of rows) if (r.seriesId) counts.set(r.seriesId, Number(r.n))

  // Least-produced first, then the creator's own order. A series whose queue has run dry is skipped
  // rather than blocking the rotation — otherwise one empty series would starve the whole channel.
  const ordered = [...allSeries].sort((a, b) => {
    const d = (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)
    return d !== 0 ? d : a.orderIdx - b.orderIdx
  })

  for (const s of ordered) {
    let [topic] = await db
      .select()
      .from(seriesTopics)
      .where(and(eq(seriesTopics.seriesId, s.id), eq(seriesTopics.status, 'queued')))
      .orderBy(asc(seriesTopics.createdAt))
      .limit(1)

    // Dry queue → refill it rather than skipping the series. This is what keeps the creator out of data
    // entry: they described the channel once, and the queue keeps itself fed. Fails soft to `continue`.
    if (!topic && channel) {
      const added = await replenishSeriesTopics(channel, s)
      if (added > 0) {
        ;[topic] = await db
          .select()
          .from(seriesTopics)
          .where(and(eq(seriesTopics.seriesId, s.id), eq(seriesTopics.status, 'queued')))
          .orderBy(asc(seriesTopics.createdAt))
          .limit(1)
      }
    }
    if (!topic) continue
    return {
      seriesId: s.id,
      seriesName: s.name,
      topicId: topic.id,
      subject: topic.subject,
      genreCategory: s.genreCategory,
      narrativeStyle: s.narrativeStyle,
    }
  }
  return null // every enabled series is out of topics → caller falls back to planner-invented
}

// How many subjects to generate when a series runs dry, and the floor that triggers it. Generating a
// batch rather than one-at-a-time keeps this to roughly one small call per N reels.
const REPLENISH_BATCH = 8

export interface AcquiredEvidence {
  dossier: string
  sources: { title: string; url: string; outlet: string }[]
}

/**
 * Gather live source material for ONE subject, so an evidence-required channel never writes a factual
 * script from model memory. Returns null when the evidence isn't there — and the caller MUST then
 * create no reel. "No evidence, no story" is the whole point; a null here is a correct outcome.
 *
 * Live web search, never model recall (the trending-refresh discipline). Paid call outside runStep — no
 * reel exists yet — so spend goes through the spend_events funnel like series replenishment does.
 */
export async function acquireEvidence(
  channel: SeriesChannel & { languages?: string[] },
  subject: string,
): Promise<AcquiredEvidence | null> {
  try {
    const policy = resolveChannelPolicy(null, null, channel)
    const p = buildEvidenceAcquirePrompt({
      subject,
      channelName: channel.name,
      nicheDescription: channel.nicheDescription,
      language: channel.languages?.[0] ?? 'english',
      allowPeople: policy.realPeople !== 'none',
    })
    const r = await llmCall({
      templateVersion: EVIDENCE_ACQUIRE_V1_VERSION,
      schema: EvidenceAcquireSchema,
      webSearch: true, // live results — never answer a factual brief from model memory
      system: p.system,
      messages: [{ role: 'user', content: p.userMessage }],
      maxTokens: 2500,
    })
    if (channel.userId) {
      await recordSpendEvent({ userId: channel.userId, channelId: channel.id, surface: 'evidence_acquire', provider: 'openai', costCents: r.costCents })
    }
    const d = r.data
    // `.default([])` on an optional zod field still types as possibly-undefined under
    // exactOptionalPropertyTypes; normalize once so the guards below read plainly.
    // Normalize once: `.default('')` on a nested field still infers as possibly-undefined under
    // exactOptionalPropertyTypes, and every consumer below wants a plain string.
    const sources = (d.sources ?? []).map((x) => ({ title: x.title, url: x.url, outlet: x.outlet ?? '' }))
    const dossier = renderDossier(d.dossier ?? '')
    if (!d.sufficient || !dossier || sources.length === 0) {
      console.warn(`[evidence] "${subject}" — insufficient: ${d.reason || 'no usable sources'} (${r.costCents}¢)`)
      return null
    }
    // Provenance rides in the dossier text: the extractor and Fact-Fidelity Checker already read it,
    // and it is what lets the published description attribute what the script was built from.
    const sourceBlock = sources.map((s) => `- ${s.title}${s.outlet ? ` (${s.outlet})` : ''} — ${s.url}`).join('\n')
    console.log(`[evidence] "${subject}" — ${sources.length} source(s) (${r.costCents}¢)`)
    return { dossier: `${dossier}\n\nSOURCES:\n${sourceBlock}`, sources }
  } catch (err) {
    // Fail CLOSED: an acquisition error must never fall through to writing from memory.
    console.warn(`[evidence] "${subject}" failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Refill a series whose queue has run dry, so the creator never has to sit and type a topic list —
 * they described the channel once; the engine keeps it fed.
 *
 * Returns how many topics were added (0 on any failure). NEVER throws: an empty queue is a normal,
 * survivable state (the Planner invents, exactly as before series existed), so a failed replenish must
 * degrade to that rather than break the tick.
 *
 * FABRICATION IS THE RISK, not emptiness. On a channel about real subjects, an invented "legend" becomes
 * a published video about something that does not exist — so anything the model won't vouch for as real
 * is DISCARDED here rather than queued, and everything that survives is stored origin:'generated' so it
 * stays distinguishable from what the creator actually asked for.
 */
export async function replenishSeriesTopics(
  channel: SeriesChannel,
  series: { id: string; name: string },
): Promise<number> {
  const db = getDb()
  try {
    // Every subject anywhere on this CHANNEL — queued, used or skipped, across ALL series, not just this
    // one. Scoping the avoid-list per-series let the same subject be queued twice under two series and
    // produce duplicate reels: a live test proposed "Balete Drive" under Hidden Places when the White Lady
    // of Balete Drive was already seeded under Urban Legends, and re-proposed the Manananggal into Urban
    // Legends from Creatures. This is what the denormalized channelId on series_topics is for.
    const seen = await db.select({ subject: seriesTopics.subject }).from(seriesTopics).where(eq(seriesTopics.channelId, channel.id))

    // Does this channel's content have to be REAL? Now the creator's declared Source Policy, not a guess.
    // The old heuristic (storyMode==='ebn' || genre==='informational') got the motivating case exactly
    // backwards: a folklore channel sits on `horror`, so it was told invention was fine — while its whole
    // premise is real legends a viewer can look up.
    const requireReal = requiresRealSubjects(resolveChannelPolicy(null, null, channel))

    const p = buildSeriesTopicsPrompt({
      channelName: channel.name,
      nicheDescription: channel.nicheDescription,
      seriesName: series.name,
      existingSubjects: seen.map((s) => s.subject),
      count: REPLENISH_BATCH,
      requireReal,
    })
    const r = await llmCall({
      templateVersion: SERIES_TOPICS_V1_VERSION,
      schema: SeriesTopicsSchema,
      system: p.system,
      messages: [{ role: 'user', content: p.userMessage }],
      temperature: 0.8,
      maxTokens: 900,
    })
    // Paid call outside runStep (no reel exists yet) → the spend_events funnel, attributed to the owner.
    if (channel.userId) {
      await recordSpendEvent({ userId: channel.userId, channelId: channel.id, surface: 'series_replenish', provider: 'openai', costCents: r.costCents })
    }

    // Normalize before comparing: an exact-string match missed "The Tiyanak" against "Tiyanak". Strips a
    // leading article and punctuation only — deliberately NOT fuzzy matching, which would start dropping
    // genuinely distinct subjects. A semantic near-duplicate ("The Lost Gold of General Yamashita" vs
    // "Yamashita Treasure") still gets through; that is what the queue being visible is for.
    const norm = (t: string) => t.trim().toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    const existing = new Set(seen.map((s) => norm(s.subject)))
    const proposed = r.data.topics ?? []
    const fresh = proposed
      .filter((t) => (requireReal ? t.real : true)) // discard anything unvouched on a real-subject channel
      .map((t) => t.subject.trim())
      .filter((s) => s.length > 0 && !existing.has(norm(s)))
    if (fresh.length === 0) {
      console.warn(`[series-replenish] ${channel.name} / ${series.name}: nothing usable returned (${r.costCents}¢)`)
      return 0
    }

    await db.insert(seriesTopics).values(
      fresh.map((subject) => ({ channelId: channel.id, seriesId: series.id, subject, origin: 'generated' })),
    )
    const dropped = proposed.length - fresh.length
    console.log(
      `[series-replenish] ${channel.name} / ${series.name}: +${fresh.length} topics` +
        `${dropped > 0 ? ` (${dropped} dropped: duplicate or not vouched real)` : ''} (${r.costCents}¢)`,
    )
    return fresh.length
  } catch (err) {
    // Fail soft — a dry queue just means the Planner invents this reel, which is the pre-series behaviour.
    console.warn(`[series-replenish] ${channel.name} / ${series.name} failed: ${err instanceof Error ? err.message : String(err)}`)
    return 0
  }
}

/**
 * Mark a topic consumed by a reel. Conditional on the row still being `queued`, so two concurrent
 * ticks (or a tick racing a manual create) can never hand the same subject to two reels — the second
 * update matches nothing and the caller is told, rather than silently producing a duplicate episode.
 * Returns false if the topic was already taken.
 */
/**
 * Retire a topic we could not source. `'skipped'` already exists in the status enum and this is exactly
 * what it is for: we tried and the evidence isn't there. Conditional on `queued` for the same reason the
 * claim is — and it stops a permanently-unsourceable subject burning a paid search call on every tick.
 */
export async function skipSeriesTopic(topicId: string, reason: string): Promise<boolean> {
  const db = getDb()
  const skipped = await db
    .update(seriesTopics)
    .set({ status: 'skipped' })
    .where(and(eq(seriesTopics.id, topicId), eq(seriesTopics.status, 'queued')))
    .returning({ id: seriesTopics.id })
  if (skipped.length > 0) console.warn(`[series-queue] topic ${topicId.slice(0, 8)} skipped — ${reason}`)
  return skipped.length > 0
}

export async function claimSeriesTopic(topicId: string, reelId: string): Promise<boolean> {
  const db = getDb()
  const claimed = await db
    .update(seriesTopics)
    .set({ status: 'used', usedByReelId: reelId })
    .where(and(eq(seriesTopics.id, topicId), eq(seriesTopics.status, 'queued')))
    .returning({ id: seriesTopics.id })
  return claimed.length > 0
}
