// Run Kendrix's OWN evidence acquisition for one subject on one channel, and print the dossier for
// founder review before a reel exists. Same function the auto-produce tick uses (series-queue.ts).
// Usage: pnpm --filter worker exec tsx scripts/_acquire.ts "<channel name>" "<subject>"
import '../src/env.js'
void (async () => {
  const [channelName, subject] = process.argv.slice(2)
  if (!channelName?.trim() || !subject?.trim()) {
    console.error('usage: _acquire.ts "<channel name>" "<subject>"')
    process.exit(1)
  }
  const { getDb, channels, users, getUserUsage, getGlobalSpendTodayCents } = await import('@reels/db')
  const { checkUserLimits, DEFAULT_USER_LIMITS, assertGlobalDailyBudget } = await import('@reels/core')
  const { eq } = await import('drizzle-orm')
  const { acquireEvidence } = await import('../src/series-queue.js')
  const db = getDb()
  const matches = await db.query.channels.findMany({ where: eq(channels.name, channelName) })
  if (matches.length !== 1) {
    console.error(matches.length === 0 ? 'channel not found' : `channel name is ambiguous (${matches.length} matches); use a unique name`)
    process.exit(1)
  }
  const c = matches[0]!
  if (!c.userId) { console.error('channel has no owner; refusing paid acquisition'); process.exit(1) }
  const owner = await db.query.users.findFirst({ where: eq(users.id, c.userId) })
  if (!owner || owner.status !== 'active') { console.error('channel owner is not active'); process.exit(1) }
  const usage = await getUserUsage(c.userId)
  if (!usage) { console.error('channel owner usage could not be resolved'); process.exit(1) }
  const gate = checkUserLimits(usage, {
    monthlyBudgetCents: usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents,
    dailyReelQuota: usage.dailyReelQuota ?? DEFAULT_USER_LIMITS.dailyReelQuota,
  })
  if (!gate.ok) { console.error(`owner limit: ${gate.reason}`); process.exit(1) }
  assertGlobalDailyBudget(await getGlobalSpendTodayCents())
  const ev = await acquireEvidence(c, subject)
  if (!ev) { console.log('\nINSUFFICIENT — no reel should be created for this subject as phrased.'); process.exit(0) }
  console.log(`\n===== DOSSIER (${ev.sources.length} sources) =====\n`)
  console.log(ev.dossier)
  process.exit(0)
})()
