import { eq } from 'drizzle-orm'
import { getDb, reels, stories, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import {
  buildEbnExtractorPrompt, STORY_EBN_EXTRACTOR_V1_VERSION, EvidenceBibleSchema,
  buildEbnFidelityPrompt, STORY_EBN_FIDELITY_V1_VERSION, EbnFidelitySchema,
} from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// fact_check — the STANDALONE fact gate (channels.factCheck; decoupled from storyMode='ebn').
//
// Runs AFTER generate_story (only when the channel opted in AND the reel carries source material in
// reels.dossier). It reuses the EBN Evidence Extractor + Fact-Fidelity Checker — probe-validated,
// source-grounded — against the story that was already written FREELY (any language, persona, look):
// extract the sources into an atomic-fact table, then check the narration against it. The result is an
// ADVISORY punch-list (reels.factCheckReport) surfaced at the story_review gate — it NEVER auto-blocks or
// regenerates (matches the minimal-review-gate policy: gates stay advisory until pass-rate evidence earns
// teeth). Fail-soft: any error records a failed report and lets the reel proceed to review — a fact-check
// failure must never strand the reel.
export async function factCheckStep(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId || !reel.dossier?.trim()) return // no story or no sources → nothing to check
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.factCheck) return // opted out (defensive — resolveNextStep already gates this)
  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story?.body?.trim()) return

  const dossier = reel.dossier
  const narration = story.body
  const inputHash = buildInputHash('fact_check.v1', {
    dossier,
    narration,
    extractor: STORY_EBN_EXTRACTOR_V1_VERSION,
    fidelity: STORY_EBN_FIDELITY_V1_VERSION,
  })

  try {
    const res = await runStep(
      { reelId, stepName: 'fact_check', inputHash },
      async (cost) => {
        // 1. Extractor: freeze the sources into an atomic-fact table.
        const ex = buildEbnExtractorPrompt({ dossier })
        const exRes = await llmCall({
          templateVersion: STORY_EBN_EXTRACTOR_V1_VERSION,
          schema: EvidenceBibleSchema,
          system: ex.system,
          messages: [{ role: 'user', content: ex.userMessage }],
          provider: 'anthropic',
          maxTokens: 4096,
        })
        cost.add(exRes.costCents)
        const facts = exRes.data.facts

        // 2. Fact-Fidelity Checker: compare the narration against the fact table (factual axes only).
        const criticalIds = facts.filter((f) => f.weight === 'Critical').map((f) => f.id)
        const ff = buildEbnFidelityPrompt({
          facts: facts.map((f) => ({ id: f.id, stance: f.stance, weight: f.weight, value: f.value, attributed_to: f.attributed_to })),
          criticalIds,
          narration,
        })
        const ffRes = await llmCall({
          templateVersion: STORY_EBN_FIDELITY_V1_VERSION,
          schema: EbnFidelitySchema,
          system: ff.system,
          messages: [{ role: 'user', content: ff.userMessage }],
          provider: 'anthropic',
          maxTokens: 2048,
        })
        cost.add(ffRes.costCents)

        return {
          output: { status: 'ok' as const, factCount: facts.length, issues: ffRes.data.issues, summary: ffRes.data.summary },
          costCents: exRes.costCents + ffRes.costCents,
        }
      },
    )

    await db.update(reels).set({
      factCheckReport: { ...res.output, checkedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(reels.id, reelId))

    const n = res.output.issues.length
    console.log(`[fact_check] ${reelId.slice(0, 8)} ${n === 0 ? 'PASS — no fidelity issues' : `${n} fidelity issue(s) flagged (advisory)`}`)
  } catch (err) {
    // Advisory + non-blocking: never strand the reel. Record the failure and let it reach story_review.
    console.warn(`[fact_check] ${reelId.slice(0, 8)} failed (advisory, non-blocking): ${err instanceof Error ? err.message : String(err)}`)
    await db.update(reels).set({
      factCheckReport: { status: 'failed', error: String(err), checkedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(reels.id, reelId))
  }
}
