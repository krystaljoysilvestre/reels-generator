# Story generation contract

Status: implemented locally and verified 2026-09-13; founder-authorized repairs. Evidence: [story generation audit](../research/findings/story-generation-audit-2026-09-13.md). Evaluation procedure: [story generation evaluation](../research/evals/story-generation.md).

## Problem and decision

The audit found a recoverable verdict/artifact mismatch, lost source and language requirements, inconsistent series inheritance, and creative rules that contradicted supported forms. The founder authorized repairs and requested coverage beyond the ten existing genre modules.

Genre is open-ended creator intent. Preserve the creator's trimmed label, including hybrids and non-English names, in the existing text columns and freeze it on every new reel. The ten existing modules remain optional craft/default libraries. An explicit unfamiliar writing genre uses general craft while retaining its exact label and niche; only missing legacy genre values use keyword inference. Media and numeric execution use known defaults independently and never use arbitrary labels as asset paths or unchecked object keys.

## Contracts

- One concise creative context carries genre, niche, language, audience, duration, selected style/voice and influence, editorial principles, and source policy to existing authoring, refinement, and judging stages. Source constraints remain binding. Creator intent takes precedence over default creative guidance. Explicit operator rubrics are labelled as binding; built-in rubrics are labelled as defaults. Objective correctness and earned storytelling remain the quality bar; surprise, confession, moral, temperature, and sentence shape are choices.
- Resolve series policy before deciding whether sources are required. Persist the same resolved policy and genre that acquisition and generation read. A lost topic claim must not retain a different series' policy or dossier.
- A completed generation identifies its exact winning story. Cache recovery materializes/relinks that winner idempotently; a mere non-null story link is insufficient. Preserve user edits on the correctly identified story. Ambiguous old cached artifacts hold for recovery rather than overwriting an uncertain story.
- Standard and fallback writers receive the same source policy and creator brief. A planner failure uses the supported writer directly, with the seed and gate feedback intact.
- Evidence planning/writing receives explicit language. Framing and narration are both fact-checked; missing-critical-fact checks apply to narration, not to every summary surface. Facts, claims, and sentence citations have deterministic reference-integrity validation.
- Evidence scripts have feasible total-word budgets. Sentence length and count follow the language and telling; claim ceilings scale with requested duration. Length correction expands or compresses toward the same actual production target.
- Every paid completion contributes its cost exactly once, including errors consumed by fallback/refinement. Cache recovery incurs no new generation cost.

## Validation and boundaries

Provider-free regressions exercise actual generation orchestration, crash recovery, source-policy inheritance, fallback feedback, framing, malformed citations, length correction, and consumed-error spend. Prompt-contract checks cover known genres and unfamiliar/mixed forms, including non-English labels. All changed prompts are versioned.

The genre lab must identify the route and configuration it actually exercises and use production judgment normalization. A maintained regression matrix supplies broader genre cases; a finite sample cannot prove quality for every possible genre. Fresh model-output quality and human preference remain separately measured evidence.

No new LLM stage, database taxonomy migration, or change to the constitution is needed. This is a correction to existing stage contracts, extracted from the audited failures. Deployment, publishing, and commits remain separate owner actions.

## Verified implementation

- Setup and Settings accept freeform genres, with all ten familiar modules offered as suggestions. Derivation, custom series, manual/pasted/library creation, scheduling, and scene planning preserve the same declared label. Numeric and asset defaults use safe known-key lookups. Topic deduplication retains Unicode letters, marks, and numbers, including canonically equivalent text.
- Source-required setup previews accept a supplied source and reject missing evidence before a paid call. The source-based preview is identified as a draft needing review.
- The production generation regression suite covers exact-winner recovery, creator edits, ownership conflicts, standard and source-required routing, optional stages, custom genres, language, style influence, paid failures, citation holds, framing checks, and both length-correction directions.
- `pnpm test`: **893 passed, 12 skipped** (external-service/integration prerequisites absent). `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Existing lint warnings remain. The changed worker evaluation scripts also pass a separate strict TypeScript check because normal worker checks include only `src`.
- Main integration on 2026-09-14, based on `d8f2fa0`: **875 passed, 12 skipped**; lint, type checks, and story-probe type checks passed. The smaller total excludes unrelated visual-source tests present in the original audit checkout.

Editorial and technical reviews reconciled the contract changes without adding a creative stage. This verification establishes implementation behavior. No fresh paid model-quality sample, live database recovery test, browser usability evaluation, deployment, or publication was performed. Keep historical quality claims separate from this implementation evidence.
