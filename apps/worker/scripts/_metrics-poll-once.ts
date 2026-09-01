// Throwaway: run the metrics poll once now, then print the full YouTube time series.
// The scheduled job only fires at 00/06/12/18, so this is how a snapshot lands on demand.
// Run: pnpm --filter worker exec tsx scripts/_metrics-poll-once.ts [--poll]   (--poll appends a fresh snapshot)
import '../src/env.js'
import { runMetricsPoll } from '../src/metrics-poll.js'

void (async () => {
  const { getDb, publications, metrics, reels, stories } = await import('@reels/db')
  if (process.argv.includes('--poll')) await runMetricsPoll()

  const db = getDb()
  const pubs = await db.query.publications.findMany({
    where: (p, { eq }) => eq(p.platform, 'yt'),
    with: { reel: { with: { story: { columns: { title: true } } } } },
  })
  for (const p of pubs) {
    const rows = await db.query.metrics.findMany({
      where: (m, { eq }) => eq(m.publicationId, p.id),
      orderBy: (m, { asc }) => [asc(m.capturedAt)],
    })
    const title = (p as any).reel?.story?.title ?? '(untitled)'
    console.log(`\n${p.platformPostId}  ${title}`)
    console.log(`  status=${p.status}  publishedAt=${p.publishedAt?.toISOString() ?? '—'}  snapshots=${rows.length}`)
    for (const r of rows) {
      const raw = (r.raw ?? {}) as { likes?: number; comments?: number }
      console.log(`  ${r.capturedAt?.toISOString()}  views=${r.views}  likes=${raw.likes ?? '—'}  comments=${raw.comments ?? '—'}`)
    }
  }
  process.exit(0)
})()
