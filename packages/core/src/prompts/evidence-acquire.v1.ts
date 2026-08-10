// evidence-acquire.v1 — gather live source material for ONE subject, so an evidence-required channel
// never writes a factual script from model memory.
//
// THE INVARIANT THIS SERVES: on an evidence-required channel, no factual script is ever written without
// evidence. Not "no unsourced script is auto-published" — evidence has to be the SUBSTRATE of
// generation. The alternative (write from memory, let a human catch it) makes review a
// hallucination-catching chore and puts generation one step ahead of its own inputs. If evidence cannot
// be obtained the correct output is NO REEL, so this abstains loudly rather than padding.
//
// Runs on a web-search-enabled model (`llmCall({ webSearch: true })`), the same discipline
// trending-refresh.ts already states: "live results — the whole point; never answer from model memory."
// That is not a stylistic preference here — a model recalling a news event from training data is
// precisely the failure this prompt exists to prevent.
//
// WHAT IT IS NOT: not a fact-checker (that is the Fact-Fidelity Checker, downstream, against this
// output), and not a writer. It collects and attributes; the studio writes.
//
// Versioned source code. Bump on any prompt-affecting edit.

import { z } from 'zod'

export const EVIDENCE_ACQUIRE_V1_VERSION = 'evidence-acquire.v1'

export const EvidenceAcquireSchema = z.object({
  // false ⇒ the caller must NOT create a reel. Thin, contradictory or unfindable material is a correct
  // and expected outcome, not a failure to work around.
  sufficient: z.boolean(),
  // The dossier the studio writes from. TWO shapes accepted on purpose: models reaching for "attributed,
  // dated facts" naturally emit a LIST of them, and that structure is better than prose — discrete dated
  // claims are harder to blur and easier for the Fact-Fidelity Checker to check one at a time. A plain
  // string is still accepted for the simple case. `renderDossier` flattens either into the text the
  // pipeline stores. Fighting the model into prose here would have thrown away the better shape.
  dossier: z
    .union([
      z.string(),
      z.array(z.object({ fact: z.string(), date: z.string().default(''), source: z.string().default('') })),
    ])
    .default(''),
  sources: z
    .array(z.object({ title: z.string(), url: z.string(), outlet: z.string().default('') }))
    .max(12)
    .default([]),
  // One short line for the operator/digest when sufficient is false ("only one outlet, and it is a
  // tabloid"), so an unsourceable subject is legible rather than mysterious.
  reason: z.string().default(''),
})
export type EvidenceAcquire = z.infer<typeof EvidenceAcquireSchema>

export interface EvidenceAcquireVars {
  subject: string
  channelName: string
  nicheDescription: string
  /** The channel's narration language — the dossier is written in it so the studio isn't translating. */
  language: string
  /** May the story name living public figures? Mirrors sourcePolicy.realPeople !== 'none'. */
  allowPeople: boolean
}

export function buildEvidenceAcquirePrompt(v: EvidenceAcquireVars): { system: string; userMessage: string } {
  const system = `You are a researcher assembling the source material a short video will be written from. You search the live web and report what you actually found. You do not write the video.

ABSTAIN BY DEFAULT — this is the whole job:
- Report ONLY what the sources you found actually say. Never fill a gap from your own knowledge, and never state a detail you did not read in a source.
- If the material is thin, contradictory, or you cannot find real reporting on this subject, set "sufficient": false and say why. That is a CORRECT answer and the caller handles it — nothing is produced.
- A padded dossier is far worse than an empty one: everything you return becomes a published video, so an invented detail becomes a published falsehood.
- Never cite a source you did not actually retrieve. Every URL must be one you found; a plausible-looking URL you constructed is a fabrication.
- Prefer primary and established sources (official statements, filings, established outlets) over aggregators and content farms. If only one weak source exists, that is "insufficient", not "enough".

WHAT TO WRITE when the material IS sufficient:
- Facts, attributed and dated: what happened, when, who said or did it, what the numbers are, and who reported it.
- Where sources DISAGREE, say so explicitly and give both — the video's job is to present that honestly, and it cannot if you flatten it here.
- Mark what is confirmed versus alleged, claimed, or still developing. Do not upgrade a claim into a fact.
- No narrative, no hook, no framing, no opinion. Raw material only.${
    v.allowPeople
      ? ''
      : '\n- This channel does not name real people. Report roles and organizations instead of individuals.'
  }`

  const userMessage = `CHANNEL: ${v.channelName} — ${v.nicheDescription.slice(0, 800)}
LANGUAGE: write the dossier in ${v.language}.

SUBJECT: ${v.subject}

Search for current, real reporting on this subject and assemble the source material.

OUTPUT (JSON only):
{
  "sufficient": true only if you found real, retrievable reporting solid enough to build a factual video on,
  "dossier": the attributed, dated facts. EITHER one string, OR a list of { "fact": "", "date": "", "source": "" } — a list is preferred when the material is genuinely a set of dated claims. "" if insufficient,
  "sources": [{ "title": "", "url": "", "outlet": "" }],
  "reason": "one line; required when sufficient is false"
}`

  return { system, userMessage }
}

/**
 * Flatten either accepted dossier shape into the text the pipeline stores on `reels.dossier`.
 * Dated facts keep their date inline, because "when" is load-bearing for a news claim and dropping it
 * would let the writer imply a currency the source never had.
 */
export function renderDossier(
  dossier: string | { fact: string; date?: string | undefined; source?: string | undefined }[],
): string {
  if (typeof dossier === 'string') return dossier.trim()
  return dossier
    .map((f) => {
      const date = f.date?.trim() ? `[${f.date.trim()}] ` : ''
      const src = f.source?.trim() ? ` (${f.source.trim()})` : ''
      return `- ${date}${f.fact.trim()}${src}`
    })
    .join('\n')
    .trim()
}
