// Read-only voice continuity check for a reel's channel.
// Usage: pnpm --filter worker exec tsx scripts/_inspect-channel-voices.ts <reelId>
import '../src/env.js'

void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('usage: _inspect-channel-voices <reelId>')
  const { getDb, reels, channels, stories } = await import('@reels/db')
  const { desc, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const prior = await db.query.reels.findMany({
    where: eq(reels.channelId, reel.channelId),
    orderBy: [desc(reels.createdAt)],
    limit: 8,
  })
  const story = reel.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : null
  console.log(JSON.stringify({
    currentVoiceId: reel.voiceId,
    narratorVoice: (story?.elements as { narratorVoice?: unknown } | null)?.narratorVoice ?? null,
    channelVoicePool: channel?.voicePool ?? [],
    recent: prior.filter((item) => item.id !== reelId).map((item) => ({ id: item.id, status: item.status, voiceId: item.voiceId })),
  }, null, 2))
  process.exit(0)
})()
