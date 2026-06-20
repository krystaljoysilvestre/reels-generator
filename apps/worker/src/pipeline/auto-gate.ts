import { eq } from 'drizzle-orm'
import { getDb, reels, channels, stories } from '@reels/db'
import { enqueueStep } from '@reels/queue'
import { listVoices } from '@reels/providers'
import type { ChannelVoice } from '@reels/core'
import { setReelStatus } from './harness.js'

// The three steps where the pipeline normally STOPS for human review (resolveNextStep returns null):
// generate_story → story_review, generate_images → storyboard, render_qa → spot_check.
const GATE_STEPS = new Set(['generate_story', 'generate_images', 'render_qa'])

// In 'auto' generation mode, cross a human gate automatically — mirroring the approve-story /
// trigger-render / approve-spot-check routes — so the reel runs end-to-end to a finished render with no
// stops. No-op unless the reel's channel is 'auto'. Publishing stays manual: we stop at 'approved'.
// Status guards make it idempotent (a BullMQ retry of the gate step won't cross twice).
export async function autoCrossGate(stepName: string, reelId: string): Promise<void> {
  if (!GATE_STEPS.has(stepName)) return

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (channel?.generationMode !== 'auto') return // only auto-mode channels self-advance

  if (stepName === 'generate_story') {
    if (reel.status !== 'story_review') return // already crossed
    // = approve-story: story_review → storyboard, run scene breakdown + image generation.
    await setReelStatus(reelId, 'storyboard')
    await enqueueStep({ reelId, stepName: 'breakdown_scenes' })
    console.log(`[auto] ${reelId.slice(0, 8)} story → storyboard`)
  } else if (stepName === 'generate_images') {
    if (reel.status !== 'storyboard') return
    // = trigger-render: pick a narrator voice, storyboard → rendering, run the render chain.
    const voiceId = await pickAutoVoice(reel.language, channel.voicePool, channel.voiceSearchKeyword)
    if (!voiceId) {
      console.warn(`[auto] ${reelId.slice(0, 8)} no voice to auto-select — left at storyboard for manual render`)
      return
    }
    await db.update(reels).set({ status: 'rendering', voiceId, updatedAt: new Date() }).where(eq(reels.id, reelId))
    await enqueueStep({ reelId, stepName: 'generate_tts' })
    console.log(`[auto] ${reelId.slice(0, 8)} storyboard → rendering (voice=${voiceId})`)
  } else if (stepName === 'render_qa') {
    if (reel.status !== 'spot_check') return
    // = approve-spot-check: spot_check → approved, and compound the channel's voice DNA.
    await setReelStatus(reelId, 'approved')
    if (reel.storyId) await db.update(stories).set({ isReference: true }).where(eq(stories.id, reel.storyId))
    console.log(`[auto] ${reelId.slice(0, 8)} spot-check → approved`)
  }
}

// Auto-mode voice: single-voice channels use their pool; per_story (empty pool) picks the top match
// from the same source the wizard recommends from. Returns null if none can be found.
async function pickAutoVoice(language: string, voicePool: unknown, searchKeyword: string | null): Promise<string | null> {
  const pool = (voicePool ?? []) as ChannelVoice[]
  if (pool[0]?.providerId) return pool[0].providerId
  const voices = await listVoices(language, searchKeyword ? { search: searchKeyword } : undefined)
  return voices[0]?.id ?? null
}
