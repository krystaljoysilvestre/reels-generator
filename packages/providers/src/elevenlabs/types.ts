import { z } from 'zod'

// TtsProvider interface — ElevenLabs implements this; WhisperX-backed aligner
// would implement Aligner (docs/08 §2). Keeping the seam so a swap is config, not code. [B2]

export const WordTimestampSchema = z.object({
  word: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})
export type WordTimestamp = z.infer<typeof WordTimestampSchema>

// AlignedChar — the normalized unit compute_timings works in (docs/08 §2)
export const AlignedCharSchema = z.object({
  ch: z.string(),     // exactly one code point
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})
export type AlignedChar = z.infer<typeof AlignedCharSchema>

export const TtsResultSchema = z.object({
  audioStorageKey: z.string(),
  durationMs: z.number().int().positive(),
  // character-level timestamps, 1:1 with Array.from(narration) (docs/08 §1 invariant)
  alignment: z.array(AlignedCharSchema),
  costCents: z.number().int().nonnegative(),
  providerJobId: z.string().optional(),
})
export type TtsResult = z.infer<typeof TtsResultSchema>

export const SfxResultSchema = z.object({
  audioStorageKey: z.string(),
  durationMs: z.number().int().positive(),
  costCents: z.number().int().nonnegative(),
})
export type SfxResult = z.infer<typeof SfxResultSchema>

// The seam. Phase 1 = ElevenLabsTtsProvider only.
export interface TtsProvider {
  synthesize(params: {
    narration: string
    voiceId: string
    reelId: string
  }): Promise<TtsResult>
}
