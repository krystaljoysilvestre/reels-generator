// The ending repair — the pipeline's FIRST BOUNDED EDIT (2026-08-06).
//
//   critic (locate) → surgeon (generate) → verifier (reject only) → splice → re-index
//
// No model in this pass ever returns the narration. The critic answers with two integers, the surgeon
// with only the replacement lines, the verifier with a boolean. The prefix survives because nothing was
// ever given the chance to change it — see packages/core/src/editing/bounded-edit.ts for the law.
//
// It lives in its own module (rather than inside generate-story) for one reason: the probe that validates
// it must exercise THE SAME CODE THAT SHIPS. A probe with its own copy of the orchestration proves
// nothing about production the moment either drifts.
//
// FAIL CLOSED, ALWAYS. An invalid region, a quote that disagrees with its own indices, a verifier
// rejection, a tripped guard, a thrown error — all of them keep the ORIGINAL ending and record why.
// Repair is optional; an incorrect repair is expensive.
import { llmCall } from '@reels/providers'
import {
  splitNumberedSentences,
  spliceSentences,
  reindex,
  validateRegion,
  quoteMatchesRegion,
  asModelText,
} from '@reels/core'
import {
  buildStoryEndingCriticPrompt,
  STORY_ENDING_CRITIC_V1_VERSION,
  EndingCriticSchema,
  buildStoryEndingSurgeonPrompt,
  STORY_ENDING_SURGEON_V1_VERSION,
  EndingSurgeonSchema,
  buildStoryEditVerifierPrompt,
  STORY_EDIT_VERIFIER_V1_VERSION,
  EditVerifierSchema,
} from '../../prompts-bridge.js'

export const ENDING_REPAIR_MAX_ATTEMPTS = 2

/** One bounded edit, start to finish. `applied` is the only field that says the artifact changed. */
export interface EndingRepairAttempt {
  landed: boolean
  landingKind: string
  problem: string
  region?: { start: number; end: number } // 0-based, as the primitive sees it
  removed?: string
  replacement?: string
  violations?: string[]
  applied: boolean
  /** Which guard refused the edit, when one did — the fail-closed reason, verbatim. */
  skipped?: string
}

export type EndingRepairAudit =
  | {
      status: 'ok'
      criticVersion: string
      surgeonVersion: string
      verifierVersion: string
      attempts: EndingRepairAttempt[]
      applied: boolean
    }
  | { status: 'failed'; error: string }

export interface EndingRepairInput {
  title: string
  narration: string
  /** Untouchable: drives music timing and earns its own scene. A region containing it is skipped. */
  peakMoment: string
  genreCategory: string | null | undefined
  /** Retained for callers and for a future revival of per-genre closing craft; unused while dormant. */
  nicheDescription: string
  language: string
  audienceDescriptor: string
  /** From the plan (planner.v1.7): the check the close has to cash. */
  hookPromise?: string | undefined
  viewerTransformation?: { before: string; after: string } | undefined
  /** Cost sink — the caller decides where the cents land (runStep's accumulator, or a probe tally). */
  onCost?: (cents: number) => void
  /** Peak resolution, injected so this module doesn't import back into generate-story. */
  resolvePeak: (narration: string, candidates: Array<string | undefined>) => string
  /** Same knob the pipeline uses; the probe overrides it to 1 for cheaper arms. */
  maxAttempts?: number
}

export async function runEndingRepair(
  input: EndingRepairInput,
): Promise<{ narration: string; audit: EndingRepairAudit }> {
  const {
    title,
    narration,
    peakMoment,
    genreCategory,
    language,
    audienceDescriptor,
    hookPromise,
    viewerTransformation,
    resolvePeak,
  } = input
  const addCost = input.onCost ?? (() => {})
  const maxAttempts = input.maxAttempts ?? ENDING_REPAIR_MAX_ATTEMPTS

  // `WriterIdentity.closingCraft` was reverted out on 2026-08-06 (decision-log 2026-08-06-003) along with
  // the rest of the ending TEXT layer, so there is no per-genre closing craft to hand the critic or the
  // surgeon any more. Left as undefined rather than reinstating the field: this pass is dormant, and the
  // standard it would have judged against is the one a blind read could not detect.
  const closingCraft: string | undefined = undefined
  const genre = genreCategory ?? 'general'
  const attempts: EndingRepairAttempt[] = []
  let current = narration

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const split = splitNumberedSentences(current)
      if (split.raw.length < 2) {
        attempts.push({
          landed: true,
          landingKind: 'other',
          problem: '',
          applied: false,
          skipped: 'narration too short to bound a region',
        })
        break
      }

      // ── Locate: two integers, never prose ──
      const cp = buildStoryEndingCriticPrompt({
        genreCategory: genre,
        language,
        closingCraft,
        hookPromise,
        title,
        numberedNarration: split.numbered,
        sentenceCount: split.raw.length,
      })
      const cres = await llmCall({
        templateVersion: STORY_ENDING_CRITIC_V1_VERSION,
        schema: EndingCriticSchema,
        system: cp.system,
        messages: [{ role: 'user', content: cp.userMessage }],
        provider: 'anthropic',
        maxTokens: 700,
      })
      addCost(cres.costCents)
      const verdict = cres.data
      if (verdict.landed) {
        attempts.push({ landed: true, landingKind: verdict.landingKind, problem: '', applied: false })
        break
      }

      // The critic answers in the 1-BASED numbering it was shown; the primitive is 0-based.
      const region = { start: verdict.sentenceStart - 1, end: verdict.sentenceEnd - 1 }
      const base: EndingRepairAttempt = {
        landed: false,
        landingKind: verdict.landingKind,
        problem: verdict.problem,
        region,
        applied: false,
      }

      // ── Guards, before spending anything on a surgeon ──
      const check = validateRegion(current, region, null, { protect: [peakMoment] })
      if (!check.ok) {
        attempts.push({ ...base, skipped: check.reason })
        break
      }
      const quoted = asModelText(verdict.closingLines)
      if (!quoteMatchesRegion(current, region, quoted)) {
        attempts.push({
          ...base,
          skipped: `critic quote does not match its own indices (quoted "${quoted.slice(0, 60)}")`,
        })
        break
      }

      const removed = split.raw.slice(region.start, region.end + 1).join('')
      const immutablePrefix = split.raw.slice(0, region.start).join('').trimEnd()

      // ── Generate: ONLY the replacement lines, against an asymmetric context ──
      const sp = buildStoryEndingSurgeonPrompt({
        genreCategory: genre,
        language,
        audienceDescriptor,
        immutablePrefix,
        mutableClose: removed.trim(),
        problem: verdict.problem,
        closingCraft,
        hookPromise,
        viewerTransformation,
        peakMoment,
      })
      const sres = await llmCall({
        templateVersion: STORY_ENDING_SURGEON_V1_VERSION,
        schema: EndingSurgeonSchema,
        system: sp.system,
        messages: [{ role: 'user', content: sp.userMessage }],
        provider: 'anthropic',
        temperature: 0.7,
        maxTokens: 600,
      })
      addCost(sres.costCents)
      const replacement = asModelText(sres.data.closingLines).trim()
      base.removed = removed.trim()
      base.replacement = replacement

      const sized = validateRegion(current, region, replacement, { protect: [peakMoment] })
      if (!sized.ok) {
        attempts.push({ ...base, skipped: sized.reason })
        break
      }

      // ── Verify: generates nothing, can only reject ──
      const vp = buildStoryEditVerifierPrompt({
        language,
        immutableContext: immutablePrefix,
        removed: removed.trim(),
        replacement,
      })
      const vres = await llmCall({
        templateVersion: STORY_EDIT_VERIFIER_V1_VERSION,
        schema: EditVerifierSchema,
        system: vp.system,
        messages: [{ role: 'user', content: vp.userMessage }],
        provider: 'anthropic',
        maxTokens: 500,
      })
      addCost(vres.costCents)
      base.violations = vres.data.violations
      if (!vres.data.ok) {
        attempts.push({
          ...base,
          skipped: `verifier rejected: ${vres.data.violations.join('; ') || 'unspecified'}`,
        })
        break
      }

      // ── Splice (pure code), then RE-INDEX: the artifact changes here, exactly once ──
      const spliced = spliceSentences(current, region, replacement)
      const next = reindex(spliced.narration).narration
      // Last guard: the peak must remain resolvable, since music timing and scene tiling depend on it.
      if (peakMoment && !resolvePeak(next, [peakMoment])) {
        attempts.push({ ...base, skipped: 'peak no longer resolves in the repaired narration' })
        break
      }
      current = next
      attempts.push({ ...base, applied: true })
      // Loop re-judges the repaired close; a landed verdict ends it.
    }

    const applied = attempts.some((a) => a.applied)
    if (applied) {
      console.log(`[ending_repair] applied ${attempts.filter((a) => a.applied).length} edit(s)`)
    } else {
      const why = attempts.find((a) => a.skipped)?.skipped
      if (why) console.log(`[ending_repair] skipped — ${why}`)
    }
    return {
      narration: current,
      audit: {
        status: 'ok',
        criticVersion: STORY_ENDING_CRITIC_V1_VERSION,
        surgeonVersion: STORY_ENDING_SURGEON_V1_VERSION,
        verifierVersion: STORY_EDIT_VERIFIER_V1_VERSION,
        attempts,
        applied,
      },
    }
  } catch (err) {
    console.warn(`[ending_repair] failed, keeping the original ending: ${String(err)}`)
    return { narration, audit: { status: 'failed', error: String(err) } }
  }
}
