import { sql, eq } from 'drizzle-orm'
import { getDb, reels, recordSpendEvent } from '@reels/db'
import { spendFromError } from '@reels/providers'

// Money that left the account on a call that then FAILED.
//
// Some provider calls pay for one or more transports before giving up: llmCall's schema-repair path bills
// two completions, the TTS chunk loop bills chunks 1..N-1 before chunk N errors. The provider hangs those
// cents on the thrown error (attachSpend) so a throw — which carries no return value — can still report
// them. The worker harness has always read them back; the on-demand web routes never did, so a failing
// preview or regen was real spend that reached neither reels.costCents nor spend_events. That under-counts
// exactly when something is going wrong repeatedly, which is when the budget gates most need to bite.
//
// Two sinks, matching the two success paths already in the codebase:
//   reel  → atomic increment on reels.costCents (what pipeline/* routes do on success)
//   event → a spend_events row (what channel/*, story/*, voices/* do on success — no reel to bill)
//
// Best-effort by design: a bookkeeping failure must never mask the real error the caller is handling.
type FailedSpendSink =
  | { kind: 'reel'; reelId: string }
  | { kind: 'event'; userId: string; channelId?: string | undefined; surface: string; provider: string }

export async function recordFailedSpend(err: unknown, sink: FailedSpendSink): Promise<void> {
  const cents = spendFromError(err)
  if (cents <= 0) return
  try {
    if (sink.kind === 'reel') {
      await getDb()
        .update(reels)
        .set({ costCents: sql`${reels.costCents} + ${cents}`, updatedAt: new Date() })
        .where(eq(reels.id, sink.reelId))
    } else {
      await recordSpendEvent({
        userId: sink.userId,
        ...(sink.channelId ? { channelId: sink.channelId } : {}),
        surface: sink.surface,
        provider: sink.provider,
        costCents: cents,
      })
    }
  } catch (bookkeepingErr) {
    console.error('[failed-spend] could not record spend from a failed call:', bookkeepingErr)
  }
}
