// Operator-only production helper for Crossroads reel #3.
//
// The source dossier is deliberately curated from the 1912 inquiry record. The live evidence
// acquisition mixed two primary transcripts with a sensational later article and overstated the
// causal role of David Blair's key; this dossier preserves the truthful contrast instead.
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

  const SUBJECT =
    "Titanic's missing binoculars: the famous locker-key myth versus the Mesaba ice warning that actually failed to reach the bridge"

  const DOSSIER = `PRIMARY RECORD — BRITISH INQUIRY, GEORGE HOGG (questions 17494–17512): On the Belfast-to-Southampton leg, acting Second Officer David Blair supplied lookouts with a pair of glasses marked "Second Officer, S.S. Titanic." At Southampton, Hogg testified that Blair told him to lock those glasses in Blair's cabin and return the keys. Hogg gave the keys to able seaman William Weller. After Titanic left Southampton, the lookouts had no glasses. Hogg and other lookouts asked for them but did not receive any.

PRIMARY RECORD — BRITISH INQUIRY, FREDERICK FLEET (questions 17274–17286; 17370–17410): At about 11:40 p.m. on April 14, Fleet saw the iceberg with his unaided eyes, struck the crow's-nest bell three times, telephoned the bridge, and reported "Iceberg right ahead." Fleet believed binoculars could have helped him identify an object sooner, but the testimony distinguished first detecting an object with the naked eye from using glasses to identify it.

PRIMARY RECORD — BRITISH INQUIRY, CHARLES LIGHTOLLER (questions 14296–14304): Lightoller explained that lookouts did not keep binoculars to their eyes continuously. A lookout would normally see an object first with the naked eye; glasses might then help identify it. He said it was possible binoculars could reveal an iceberg sooner only if the lookout happened to be looking directly at it through them.

OFFICIAL FINDING — BRITISH WRECK COMMISSIONER'S REPORT, QUESTION 11: The Court found that binoculars were not provided to Titanic's lookouts. Asked whether their use was necessary or usual in those circumstances, the Court answered "No." The inquiry record therefore supports "no binoculars" but does not support the later claim that Blair's retained key caused the collision or that binoculars would certainly have prevented it.

OFFICIAL RECORD — BRITISH WRECK COMMISSIONER'S REPORT, MESSAGES RECEIVED: At 9:40 p.m. on April 14, Titanic's Marconi room received a message from Mesaba reporting heavy pack ice, many large icebergs, and field ice in coordinates the report described as Titanic's immediate vicinity. The report found that the message was not delivered to Captain Smith or any bridge officer. It said the message might have affected navigation if it had reached the bridge.

PRIMARY RECORD — BRITISH INQUIRY, JOSEPH BOXHALL (questions 16918–16937): Boxhall was on the 8 p.m.–midnight watch. He testified that he never heard of the Mesaba message aboard Titanic and that no such message reached the officers on the bridge during his watch.

OFFICIAL FINDING — BRITISH WRECK COMMISSIONER'S REPORT: Titanic maintained about 22 knots. The Court found that speed excessive in the known proximity of ice and concluded that the ship's loss was caused by collision with an iceberg brought about by the excessive speed at which she was navigated.

SOURCE BOUNDARY: The story may contrast the later locker-key legend with the documented Mesaba failure. It must not say Blair "lost" the key, that the key locked the crow's-nest binocular cabinet, that the locked glasses were definitely intended for the final voyage's lookouts, or that binoculars would have saved Titanic. Those claims are not established by the inquiry record.

SOURCES:
- British Inquiry — George Hogg testimony: https://www.titanicinquiry.org/BOTInq/BOTInq15Hogg01.php
- British Inquiry — Frederick Fleet testimony: https://www.titanicinquiry.org/BOTInq/BOTInq15Fleet01.php and https://www.titanicinquiry.org/BOTInq/BOTInq15Fleet02.php
- British Inquiry — Charles Lightoller testimony: https://www.titanicinquiry.org/BOTInq/BOTInq12Lightoller04.php
- British Inquiry — Joseph Boxhall testimony: https://www.titanicinquiry.org/BOTInq/BOTInq14Boxhall01.php
- British Inquiry report — messages received: https://www.titanicinquiry.org/BOTInq/BOTReport/botRepMessages.php
- British Inquiry report — findings: https://www.titanicinquiry.org/BOTInq/BOTReport/botRepFindings.php
- British Inquiry report — conclusion: https://www.titanicinquiry.org/BOTInq/BOTReport/botRep01.php`

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.name, 'Crossroads') })
  if (!channel?.userId) throw new Error('Crossroads or its owner was not found')

  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('Crossroads owner is not active')

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
  if (!requiresEvidence(sourcePolicy)) throw new Error('Crossroads no longer requires evidence; stop and review the channel policy')

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
