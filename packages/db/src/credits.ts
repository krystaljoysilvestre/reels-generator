import { eq } from 'drizzle-orm'
import { getDb } from './client.js'
import { scenes } from './schema.js'

/**
 * Every scene's image provenance for a reel, in scene order (jsonb, so each entry is unvalidated — the
 * caller parses with MediaOriginSchema). NULL entries are generated scenes, which is most of them.
 *
 * Exists so the three independent consumers of image credits — the auto-gate, the YouTube publish route, and
 * the export zip — read scene provenance the same way. A licence obligation honoured at two sites out of
 * three is not honoured, and the previous bible-only credits under-attributed exactly the media that is
 * shown to the viewer unaltered.
 */
export async function sceneImageOrigins(reelId: string): Promise<unknown[]> {
  const db = getDb()
  const rows = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    columns: { idx: true, imageOrigin: true },
  })
  return rows.sort((a, b) => a.idx - b.idx).map((r) => r.imageOrigin)
}
