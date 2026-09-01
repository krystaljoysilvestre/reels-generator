// Throwaway: what does each channel's auto-produce/publish state look like right now?
import '../src/env.js'
void (async () => {
  const { getDb, channels, reels } = await import('@reels/db')
  const { eq, desc } = await import('drizzle-orm')
  const db = getDb()
  const rows = await db.query.channels.findMany()
  for (const c of rows) {
    const pr = (c.postingRules ?? {}) as any
    const recent = await db.query.reels.findMany({
      where: eq(reels.channelId, c.id),
      orderBy: [desc(reels.createdAt)],
      limit: 3,
      columns: { id: true, status: true, createdAt: true },
    })
    console.log(`\n${c.name}  [${c.status}]  id=${c.id.slice(0, 8)}`)
    console.log(`  autoProduce=${JSON.stringify(pr.autoProduce ?? null)}  generationMode=${c.generationMode ?? '—'}`)
    console.log(`  recent reels: ${recent.map((r) => `${r.id.slice(0, 8)}:${r.status}:${r.createdAt?.toISOString().slice(0, 10)}`).join('  ') || '(none)'}`)
  }
  process.exit(0)
})()
