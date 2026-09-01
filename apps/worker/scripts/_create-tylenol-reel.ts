// Operator-only production helper for Crossroads reel #4.
//
// The live acquisition returned a thin, internally inconsistent dossier and was rejected before a
// reel existed. This replacement is curated from federal records: a Senate committee report, the
// appellate record of the extortion case, and FDA history/regulatory guidance.
import '../src/env.js'

void (async () => {
  const {
    getDb,
    channels,
    users,
    reels,
    getUserUsage,
  } = await import('@reels/db')
  const {
    checkUserLimits,
    DEFAULT_USER_LIMITS,
    MAX_INFLIGHT_REELS_PER_USER,
    UNSHIPPED_REEL_STATUSES,
    requiresEvidence,
    resolveChannelPolicy,
  } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { and, count, eq, inArray } = await import('drizzle-orm')

  const CROSSROADS_CHANNEL_ID = 'ab8a71bd-e056-4bd6-89f0-edb2fe8f4b22'
  const SUBJECT =
    'The 1982 Tylenol Strategy Committee decision to withdraw capsules nationwide, stop advertising, and halt manufacturing until tamper-resistant packaging existed—and the federal packaging rules that followed'

  const DOSSIER = `OFFICIAL RECORD — U.S. SENATE REPORT NO. 98-69, THE FEDERAL ANTI-TAMPERING ACT (May 2, 1983), BACKGROUND: Between September 30 and October 2, 1982, seven deaths were reported in the Chicago suburbs after ingestion of Extra-Strength Tylenol capsules laced with potassium cyanide. McNeil Consumer Products, a Johnson & Johnson subsidiary, ultimately recalled all Tylenol and Cotylenol capsules not in blister packs throughout the United States. The report says 31 million bottles were withdrawn from retailers, wholesalers, and the public. It attributes to the company a $100 million estimate for public warnings, recall, testing, and destruction; that figure is a company estimate recorded by the committee, not an independently audited cost.

OFFICIAL RECORD — UNITED STATES v. LEWIS, 797 F.2d 358 (7th Cir. 1986), PARAGRAPHS 8–10: In response to the poisoning crisis, Johnson & Johnson formed a Tylenol Strategy Committee that included top management. The court record says the committee decided to remove Tylenol capsules from the market, stop all advertising for the product, and halt its manufacture until tamper-resistant packaging could be developed. The company checked more than 10 million capsules while investigating the contamination.

OFFICIAL RECORD — UNITED STATES v. LEWIS, PARAGRAPHS 15–19: An extortion letter was sent to Johnson & Johnson after the poisonings. James Lewis was convicted of attempted extortion for the letter. The record does not establish that Lewis poisoned the capsules. The story must not identify him—or anyone else—as the killer.

OFFICIAL FDA HISTORY — PROMOTING SAFE & EFFECTIVE DRUGS FOR 100 YEARS: FDA records that seven people in Chicago died after swallowing cyanide-laced Tylenol capsules and that FDA issued Tamper-Resistant Packaging Requirements in 1982. The Federal Anti-Tampering Act followed in 1983.

OFFICIAL FDA GUIDANCE — CPG SEC. 450.500: FDA says the final tamper-resistant packaging requirements covering most over-the-counter products were published on November 5, 1982. The rule required an indicator or barrier whose breach or absence would give consumers visible evidence of entry, plus labeling that identifies the package's protective feature.

DECISION BOUNDARY: The documented crossroads is the Strategy Committee's choice to withdraw capsules, stop advertising, and halt manufacturing until safer packaging existed. The record establishes the action, not a private boardroom conversation or a stated moral motive. Do not invent dialogue, a decisive speech, a vote, a deadline, or the phrase "customers before profits."

CAUSAL BOUNDARY: The poisonings prompted federal packaging rules and anti-tampering legislation. Johnson & Johnson's withdrawal was part of the crisis response, but the sources do not establish that the company single-handedly created the rules or invented tamper-resistant packaging. Do not claim the recall alone changed every medicine bottle.

DEPICTIVE BOUNDARY: The story can be told through capsule bottles, pharmacy shelves, recall notices, newspaper presses, package seals, and regulatory text. Do not stage victims taking capsules, depict a poisoning, fabricate a Strategy Committee meeting, or present an invented face as a real participant.

SOURCES:
- U.S. Senate Report No. 98-69, The Federal Anti-Tampering Act (May 2, 1983), especially pp. 3–4: https://www.govinfo.gov/content/pkg/SERIALSET-13506_00_00-015-0069-0000/pdf/SERIALSET-13506_00_00-015-0069-0000.pdf
- United States v. Lewis, 797 F.2d 358 (7th Cir. 1986), especially paragraphs 8–19: https://law.resource.org/pub/us/case/reporter/F2/797/797.F2d.358.84-2011.html
- FDA, Promoting Safe & Effective Drugs for 100 Years, Anti-Tampering Regulations: https://www.fda.gov/about-fda/histories-product-regulation/promoting-safe-effective-drugs-100-years
- FDA, CPG Sec. 450.500, Tamper-Resistant Packaging Requirements for Certain Over-the-Counter Human Drug Products: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/cpg-sec-450500-tamper-resistant-packaging-requirements-certain-over-counter-human-drug-products`

  const db = getDb()
  const channel = await db.query.channels.findFirst({
    where: and(eq(channels.id, CROSSROADS_CHANNEL_ID), eq(channels.name, 'Crossroads')),
  })
  if (!channel?.userId) throw new Error('The expected Crossroads channel or its owner was not found')

  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('Crossroads owner is not active')

  const duplicate = await db.query.reels.findFirst({
    where: and(eq(reels.channelId, channel.id), eq(reels.seedIdea, SUBJECT)),
  })
  if (duplicate) throw new Error(`Tylenol reel already exists: ${duplicate.id}`)

  if (owner.role !== 'admin') {
    const usage = await getUserUsage(owner.id)
    if (!usage) throw new Error('Could not resolve owner usage')
    const limit = checkUserLimits(usage, {
      monthlyBudgetCents: usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents,
      dailyReelQuota: usage.dailyReelQuota ?? DEFAULT_USER_LIMITS.dailyReelQuota,
    })
    if (!limit.ok) throw new Error(limit.reason)

    const [inflight] = await db
      .select({ n: count() })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .where(
        and(
          eq(channels.userId, owner.id),
          inArray(reels.status, [...UNSHIPPED_REEL_STATUSES]),
        ),
      )
    if ((inflight?.n ?? 0) >= MAX_INFLIGHT_REELS_PER_USER) {
      throw new Error(`Too many reels in progress (max ${MAX_INFLIGHT_REELS_PER_USER})`)
    }
  }

  const sourcePolicy = resolveChannelPolicy(null, null, channel)
  if (!requiresEvidence(sourcePolicy)) {
    throw new Error('Crossroads no longer requires evidence; stop and review the channel policy')
  }

  const language = (channel.languages[0] ?? 'english').toLowerCase()
  const [reel] = await db
    .insert(reels)
    .values({
      channelId: channel.id,
      status: 'drafting',
      language,
      seedIdea: SUBJECT,
      dossier: DOSSIER,
      sourcePolicy,
    })
    .returning()

  console.log(`[audit] operator created sourced reel ${reel!.id} for channel ${channel.id}, owner ${owner.id}`)
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })
  console.log(`enqueued generate_story for ${reel!.id}`)
  process.exit(0)
})()
