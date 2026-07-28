import { describe, it, expect } from 'vitest'
import { nextPublishSlot } from './publish-schedule.js'
import { PostingRulesSchema, resolvePublishSlots, resolvePublishDays } from '../types/channel.js'

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
// Wednesday 2026-07-29, 10:00 UTC.
const WED_10 = new Date('2026-07-29T10:00:00.000Z')

describe('nextPublishSlot', () => {
  it('picks today’s next slot when one is still ahead', () => {
    const slot = nextPublishSlot({ now: WED_10, slotsUtc: [13], daysUtc: ALL_DAYS, taken: [] })
    expect(slot?.toISOString()).toBe('2026-07-29T13:00:00.000Z')
  })

  it('rolls to tomorrow once today’s slots have passed', () => {
    const slot = nextPublishSlot({ now: WED_10, slotsUtc: [1, 9], daysUtc: ALL_DAYS, taken: [] })
    expect(slot?.toISOString()).toBe('2026-07-30T01:00:00.000Z')
  })

  it('treats a slot exactly at now as gone (never books the past)', () => {
    const slot = nextPublishSlot({ now: WED_10, slotsUtc: [10], daysUtc: ALL_DAYS, taken: [] })
    expect(slot?.toISOString()).toBe('2026-07-30T10:00:00.000Z')
  })

  it('spreads reels across slots instead of stacking them', () => {
    const taken: Date[] = []
    for (let i = 0; i < 3; i++) {
      const slot = nextPublishSlot({ now: WED_10, slotsUtc: [13, 20], daysUtc: ALL_DAYS, taken })
      expect(slot).not.toBeNull()
      taken.push(slot!)
    }
    expect(taken.map((d) => d.toISOString())).toEqual([
      '2026-07-29T13:00:00.000Z',
      '2026-07-29T20:00:00.000Z',
      '2026-07-30T13:00:00.000Z',
    ])
  })

  it('honours the posting days', () => {
    // Weekdays only (Mon–Fri): Friday's slot is gone, so the next one is Monday.
    const friday2200 = new Date('2026-07-31T22:00:00.000Z')
    const slot = nextPublishSlot({ now: friday2200, slotsUtc: [13], daysUtc: [1, 2, 3, 4, 5], taken: [] })
    expect(slot?.toISOString()).toBe('2026-08-03T13:00:00.000Z')
  })

  it('crosses month boundaries', () => {
    const slot = nextPublishSlot({ now: new Date('2026-07-31T18:00:00.000Z'), slotsUtc: [13], daysUtc: ALL_DAYS, taken: [] })
    expect(slot?.toISOString()).toBe('2026-08-01T13:00:00.000Z')
  })

  it('returns null when the schedule can never fire', () => {
    expect(nextPublishSlot({ now: WED_10, slotsUtc: [], daysUtc: ALL_DAYS, taken: [] })).toBeNull()
    expect(nextPublishSlot({ now: WED_10, slotsUtc: [13], daysUtc: [], taken: [] })).toBeNull()
  })

  it('returns null when every slot inside the horizon is claimed', () => {
    // One slot a day, every day inside the horizon (today through today+5) already claimed.
    const taken = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(2026, 6, 29 + i, 13)))
    const slot = nextPublishSlot({ now: WED_10, slotsUtc: [13], daysUtc: ALL_DAYS, taken, horizonDays: 5 })
    expect(slot).toBeNull()
  })

  it('ignores out-of-range slots and days', () => {
    const slot = nextPublishSlot({ now: WED_10, slotsUtc: [99, 13], daysUtc: [...ALL_DAYS, 9], taken: [] })
    expect(slot?.toISOString()).toBe('2026-07-29T13:00:00.000Z')
  })
})

describe('posting-rule defaults', () => {
  it('leaves existing channels on immediate publishing', () => {
    const rules = PostingRulesSchema.parse({ platforms: ['fb', 'yt'], scheduleUtcHour: 13, qualityThreshold: 0 })
    expect(rules.publish.mode).toBe('immediate')
  })

  it('falls back to the channel’s single posting hour when no slots are set', () => {
    const rules = PostingRulesSchema.parse({ scheduleUtcHour: 13, publish: { mode: 'slots' } })
    expect(resolvePublishSlots(rules)).toEqual([13])
    expect(resolvePublishDays(rules)).toEqual(ALL_DAYS)
  })

  it('sorts and de-duplicates configured slots', () => {
    const rules = PostingRulesSchema.parse({ publish: { mode: 'slots', slotsUtc: [20, 6, 20], daysUtc: [5, 1, 1] } })
    expect(resolvePublishSlots(rules)).toEqual([6, 20])
    expect(resolvePublishDays(rules)).toEqual([1, 5])
  })
})
