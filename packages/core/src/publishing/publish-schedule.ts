// Where a finished reel lands on the channel's posting calendar.
//
// Pure date math, no I/O: given the channel's slots (UTC hours), the days it posts on, and the slots
// already claimed by reels waiting to go out, return the next free instant. Callers hand this to
// YouTube as status.publishAt so the platform — not our worker — is what wakes up at the slot.
//
// Two reels must never claim the same slot: a channel producing 3 a day with one slot a day would
// otherwise publish three videos at once. `taken` is how the caller passes the already-claimed slots.

export interface NextPublishSlotOptions {
  now: Date
  slotsUtc: number[] // UTC hours, e.g. [13] or [1, 13]
  daysUtc: number[] // UTC weekdays, 0 = Sunday … 6 = Saturday
  taken: Date[] // slots already claimed by scheduled-but-unpublished reels on this channel
  horizonDays?: number
}

// How far ahead we're willing to book. This is a spend guard, not a calendar limit: every booked reel
// was already paid for, so a channel producing faster than it posts is buying inventory. Two weeks is
// enough rhythm to be useful and short enough that the mismatch surfaces (no free slot → the reel
// stays 'approved', which the auto-produce backlog guard then counts) before it becomes expensive.
export const PUBLISH_HORIZON_DAYS = 14

export function nextPublishSlot(opts: NextPublishSlotOptions): Date | null {
  const { now, taken } = opts
  const slots = [...new Set(opts.slotsUtc.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b)
  const days = new Set(opts.daysUtc.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  if (slots.length === 0 || days.size === 0) return null

  const claimed = new Set(taken.map((d) => d.getTime()))
  const horizon = opts.horizonDays ?? PUBLISH_HORIZON_DAYS

  for (let dayOffset = 0; dayOffset <= horizon; dayOffset++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset))
    if (!days.has(day.getUTCDay())) continue
    for (const hour of slots) {
      const slot = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour))
      if (slot.getTime() <= now.getTime()) continue // today's earlier slots are gone
      if (claimed.has(slot.getTime())) continue
      return slot
    }
  }
  return null
}
