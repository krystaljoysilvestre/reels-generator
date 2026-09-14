# Story generation audit — 13 September 2026

**Implementation follow-up:** The founder subsequently authorized these repairs and requested open-ended genre support. The fixes are now implemented locally; see the [verified story generation contract](../../specs/story-generation-contract.md) and [broader evaluation procedure](../evals/story-generation.md). Findings and line references below describe the pre-fix checkout, preserved as the audit record. They are not a current outstanding-bug list.

**Assessment:** Kendrix has ten implemented genre modules and useful editorial/evidence safeguards. It does not yet have current evidence demonstrating reliable story quality across all ten. The highest-priority repairs concern preserving the creator's brief and keeping the judged story identical to the story sent into production. Several shared creative rules also conflict with forms the product explicitly offers.

**Scope and evidence.** Local checkout 7a92e63; standard and evidence-constrained story generation, entry points, refinement, approval, retry recovery, prompts, genre/style/voice catalogs, tests, and retained experiments. Editorial Director and Technical Advisor reviewed independently; an Explorer audited evaluation evidence. Applied unbiased-design and the Orchestrator protocol. This is an implementation audit with historical output review, not a fresh model benchmark or verification of the deployed build. No paid generations or production changes were made.

Confidence is separated below: **confirmed implementation defects**, **confirmed prompt conflicts with unmeasured output impact**, and **historical observations**. Severity reflects consequence when triggered, not estimated frequency.

**Current flow**

- Standard: Planner → genre Writer → Editor → Naturalizer → editorial gate; one prose rewrite when the judge says a rewrite can fix the failure.
- Evidence-required, including channels using standard visuals: dossier → Evidence Bible → cited claims → cited Writer → bounded length correction → factual checker + editorial gate + duration readiness.
- Plan review, finishing review, and ending repair are environment-controlled opt-ins. Their presence in source does not establish they are enabled in production.
- Auto mode correctly holds missing, errored, or failed final story verdicts. Human review remains a deliberate override. The recovery defect below is a separate mismatch between artifact and verdict.

Sources: [apps/worker/src/pipeline/steps/generate-story.ts:562](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:562), [apps/worker/src/pipeline/steps/generate-story.ts:114](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:114), [apps/worker/src/pipeline/auto-gate.ts:23](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/auto-gate.ts:23).

**Fix first: confirmed implementation defects**

**1. P1 — Regeneration recovery can pair an old story with a new passing verdict.** The step output is committed before the winner is inserted and linked to the reel. On regeneration, an old story is already linked. A process crash between these commits leaves a completed new verdict and an old story link. Redelivery accepts any existing storyId as proof that the cached winner was persisted. Auto review can consequently advance the previously rejected narration under the replacement's verdict.

Evidence: [apps/worker/src/pipeline/harness.ts:126](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/harness.ts:126), [apps/worker/src/pipeline/steps/generate-story.ts:376](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:376), [apps/worker/src/pipeline/steps/generate-story.ts:455](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:455), [apps/worker/src/pipeline/steps/generate-story.ts:484](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:484).

Fix: persist and reconcile an explicit winner identity/revision, or commit winner, linkage, and completed verdict together. Check the exact artifact before crossing review. Regression: crash after completed generation but before relinking an already-linked reel; retry must use the newly judged narration without new model calls. Affects every genre and both story paths.

**2. P1 — Standard generation loses the creator's source policy.** The visible “Real places and real history” option allows accurate named subjects with constrained invention but does not require a dossier. It therefore uses the standard chain. The runtime omits sourcePolicy when building its planner prompt, which defaults to fictional-only constraints. The writer independently orders fictionalization of specific places and forbids identifiable people.

Evidence: [packages/core/src/types/source-policy.ts:158](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/types/source-policy.ts:158), [apps/worker/src/pipeline/steps/generate-story.ts:589](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:589), [packages/core/src/prompts/story-planner.v1.ts:149](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-planner.v1.ts:149), [packages/core/src/prompts/story.v2.ts:112](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story.v2.ts:112).

Fix: thread the frozen source policy through every authoring/rewrite path and its cache inputs; render consistent permissions. Regression: a permitted named-place seed such as Balete Drive must retain real-place permission through planner, writer, and fallback. Fiction-only controls must retain their restrictions. Particularly affects folklore, history, travel, and real-subject explainers.

**3. P1 — The evidence-based writer is never explicitly told the requested language.** Language enters the cache, final metadata, and editorial judge, but is absent from the editorial brief and writer arguments. English source material can therefore yield English prose labelled as the requested Tagalog or other language; rejection afterward cannot substitute for supplying the requirement before writing.

Evidence: [apps/worker/src/pipeline/steps/generate-story.ts:1098](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1098), [apps/worker/src/pipeline/steps/generate-story.ts:1208](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1208), [packages/core/src/prompts/story-ebn-writer.v1.ts:54](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-ebn-writer.v1.ts:54).

Fix: carry explicit language and audience/register into the existing evidence planner/writer; validate the resulting artifact. First test actual prompt assembly using one dossier and different requested languages, then a small multilingual output probe. Applies to every evidence-required genre, not just channels labelled EBN.

**4. P1 — Factual readiness does not cover titles/loglines or citation integrity.** The factual checker receives narration only. Title and logline are persisted without factual verification, so they can upgrade an attributed claim to a settled fact even when narration remains careful. Separately, unknown evidence IDs are silently filtered, and sentence citations allow arbitrary IDs or empty arrays. The factual checker never sees that mapping.

Evidence: [apps/worker/src/pipeline/steps/generate-story.ts:1200](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1200), [apps/worker/src/pipeline/steps/generate-story.ts:1252](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1252), [apps/worker/src/pipeline/steps/generate-story.ts:1262](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1262), [apps/worker/src/pipeline/steps/generate-story.ts:1281](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1281), [packages/core/src/prompts/story-ebn-writer.v1.ts:35](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-ebn-writer.v1.ts:35).

Fix: check factual framing as separate named surfaces; validate unique/known IDs, claim membership, nonempty support, and required coverage deterministically. Test clean narration with an unsupported title, plus empty/nonexistent citations. These must hold readiness without requiring another creative stage. Citation integrity is a P2 provenance defect independently of the P1 factual-framing gap.

**5. P2 — Genre and series policy do not resolve consistently at creation.**

- Manual creation only freezes genre when a series exists; scheduler does likewise. Pasted/library paths also omit genre. The resolver then follows the mutable channel genre. Local reproduction changed the same null-genre reel from horror to comedy after a channel edit.
- Manual creation checks evidence against channel policy before loading the selected series, then freezes series policy afterward. A stricter series can produce a reel that immediately fails for missing sources; a looser series can be rejected unnecessarily.
- Scheduled selection omits series sourcePolicy from SeriesPick and freezes channel policy. A series requiring evidence inside a fiction channel can therefore lose that requirement altogether.

Evidence: [apps/web/src/app/api/pipeline/create-reel/route.ts:35](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/web/src/app/api/pipeline/create-reel/route.ts:35), [apps/web/src/app/api/pipeline/create-reel/route.ts:79](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/web/src/app/api/pipeline/create-reel/route.ts:79), [apps/web/src/app/api/pipeline/provide-story/route.ts:84](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/web/src/app/api/pipeline/provide-story/route.ts:84), [apps/worker/src/scheduler.ts:99](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/scheduler.ts:99), [apps/worker/src/scheduler.ts:103](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/scheduler.ts:103), [apps/worker/src/series-queue.ts:36](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/series-queue.ts:36), [packages/core/src/assembly/genre-resolution.ts:43](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/assembly/genre-resolution.ts:43).

Fix: resolve the actual selected series first; use one resolved genre/policy for validation, evidence acquisition, persistence, and queueing. Freeze genre on every new reel. Keep fallback for genuinely legacy rows. Test strict-series/loose-channel and the inverse, series-free creation, channel edits, and a lost topic claim. Treat the scheduler's loss of an evidence requirement as P1 when that configuration is used.

**6. P2 — Planner failure drops the requested topic and retry direction.** The legacy fallback receives base variables and an angle, but loses the operator seed, frozen genre, chosen style/voice, and platform hook. Its retry does not forward the editorial gate's feedback.

Evidence: [apps/worker/src/pipeline/steps/generate-story.ts:780](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:780).

Fix: preserve the complete creator brief in a supported fallback; forward the rejection reason into the bounded rewrite. Test a failed planner for an explicitly requested topic and series genre, followed by an editorial rejection. Affects all genres under provider/schema failure.

**7. P2 — Consumed paid errors can disappear from story cost.** Providers attach spend to errors from paid malformed responses. Several planner/refinement/gate/fidelity catches consume those errors without adding their spend; the harness only sees errors that escape. The analyzer also risks losing earlier successful-call spend when later validation throws.

Evidence: [packages/providers/src/llm/client.ts:330](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/providers/src/llm/client.ts:330), [apps/worker/src/pipeline/steps/generate-story.ts:659](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:659), [apps/worker/src/pipeline/steps/generate-story.ts:866](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:866), [apps/worker/src/pipeline/steps/generate-story.ts:1273](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1273), [apps/worker/src/pipeline/harness.ts:158](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/harness.ts:158).

Fix: account for attached spend exactly once in every consuming catch; record successful analysis calls immediately through the cost sink. Test a cost-bearing failure followed by successful fallback, and successful analysis followed by validation failure. This is an accounting foundation, not a reason to remove quality stages.

**Repair the contract: confirmed prompt conflicts**

**8. P1 — Evidence-based length instructions can be impossible together.** Runtime caps claims at 14. The writer caps sentence count at 14 in that case and instructs each narration sentence to stay at or below 30 words. A locally built 750-word prompt demanded 675–825 words in at most 14 sentences: only 420 words fit if all instructions are obeyed. Targets whose 90% minimum exceeds 420 cannot satisfy both limits. The runtime's proportional length rewrite also calls an under-length draft a compression task.

Evidence: [apps/worker/src/pipeline/steps/generate-story.ts:1160](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1160), [packages/core/src/prompts/story-ebn-writer.v1.ts:77](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-ebn-writer.v1.ts:77), [packages/core/src/prompts/story-ebn-writer.v1.ts:87](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-ebn-writer.v1.ts:87), [apps/worker/src/pipeline/steps/generate-story.ts:1238](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/src/pipeline/steps/generate-story.ts:1238).

Fix: make narrative obligations and limits feasible for the requested duration; confine short-form compression advice to short-form. Use distinct expansion/compression instructions. Do not force denser sentences or merely add another editor. Check feasibility over all supported durations, then probe short and long factual scripts for intelligibility and fidelity.

**9. P2 — Selected genre, style, voice, and audience are not consistently respected by later stages.**

| Conflict | Concrete evidence | Minimal correction |
| --- | --- | --- |
| Personal essay builds toward its thesis; commentary gate requires a thesis early | [packages/core/src/prompts/story-styles.v1.ts:153](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-styles.v1.ts:153); [packages/core/src/prompts/story-critic.v2.ts:103](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-critic.v2.ts:103) | Judge the selected essay form; preserve early-claim guidance for matching forms |
| Observational comedy promises recognition; comedy gate requires surprise and a final punch word | [packages/core/src/prompts/story-styles.v1.ts:188](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-styles.v1.ts:188); [packages/core/src/prompts/story-critic.v2.ts:146](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-critic.v2.ts:146) | Judge whether its intended comic mechanism works |
| Children's identity/gate require a warm named takeaway; shared planner says never state meaning | [packages/core/src/prompts/writer-identities.v1.ts:525](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/writer-identities.v1.ts:525); [packages/core/src/prompts/story-planner.v1.ts:190](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-planner.v1.ts:190) | Distinguish earned child-appropriate meaning from unearned preaching |
| Children's warm welcome and fairy-tale refrains conflict with universal tension opening and anti-parallelism rules | [packages/core/src/prompts/story.v2.ts:120](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story.v2.ts:120); [packages/core/src/prompts/story-craft.v1.ts:20](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-craft.v1.ts:20) | Preserve intentional oral form and the selected audience experience |
| Reddit supports confession/discovery/creepy encounter, but its selection lens makes every idea a moral jury case | [packages/core/src/prompts/writer-identities.v1.ts:314](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/writer-identities.v1.ts:314); [packages/core/src/prompts/writer-identities.v1.ts:321](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/writer-identities.v1.ts:321) | Apply jury criteria only to the corresponding format |
| Documentary, diary, and campfire voices encounter a universal spontaneous-confession standard | [packages/core/src/prompts/story-voices.v1.ts:59](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-voices.v1.ts:59); [packages/core/src/prompts/story-craft.v1.ts:16](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/story-craft.v1.ts:16) | Give refinement and judgment the chosen voice and protect intentional performance |

The final gate lacks explicit selected style, voice, and audience inputs; the naturalizer must infer them. Existing protection for intentional craft is valuable, but it receives incomplete context. Pass the existing creative intent into these stages and reconcile defaults before judging. Do not add a new settings screen or another pipeline layer.

These conflicts are directly visible in source. Their frequency and effect on final stories are unmeasured. Validate with approved good examples and deliberately flawed controls before changing any founder-approved editorial default.

**Every implemented genre**

This is a coverage and risk matrix, not a measured quality ranking. Registry: [packages/core/src/prompts/scenes.v1.ts:15](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/packages/core/src/prompts/scenes.v1.ts:15).

| Genre | Preserve | Specific fix or targeted probe |
| --- | --- | --- |
| Horror | Concrete wrongness, earned fear, varied intensity | Test quiet, investigative, folk, and resolved horror against confession/contamination-only assumptions. Carry real-place policy correctly. Do not automatically remove documented defaults. |
| Drama | Specific relationships and earned emotion | Test earned messages/disclosures versus convenient message-as-resolution; selection bans a device that the element palette still offers. |
| Comedy | Comic timing and precision | Resolve observational-recognition versus surprise-punchline conflict; use human judgments of whether it is funny. |
| Confession / Reddit | Authenticity and form-aware endings | Keep confession, discovery, creepy encounter, revenge, and jury posts distinct through selection and review. |
| Commentary | Supported argument and earned conviction | Preserve personal essay, satire, and motivation rather than universally forcing an opening hot take. |
| Informational | Intelligibility, factual support, no fake witness | Repair source/language/framing/budget paths. Test explanations that teach without needing to overturn a misconception. |
| Lifestyle | Useful action, sensory specificity, honesty | Test how-to, travel, and day-in-life separately; avoid manufactured conflict and compulsory belief change. |
| Children's | Warmth, reassurance, child-sized agency | Reconcile opener/moral/refrain conflicts; judge actual channel age instead of always a five-year-old. |
| Fairy tale | Symbolic magic and oral storytelling | Protect refrain/rule of three; test whether universal restored-order/virtue rules fit the intended tradition. |
| General | Flexibility | Test forms without confession, persuasion, or a twist; shared rules should not silently turn this into another narrow genre. |

Children's and fairy tale are implemented and derivable, but absent from the shared UI genre-options list; their labels fall back to “A bit of everything.” Add both to an exhaustive typed label mapping. Evidence: [apps/web/src/lib/genre-labels.ts:3](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/web/src/lib/genre-labels.ts:3).

History, documentary, true crime, romance, mystery, and similar domains are not additional registered buckets. Audit them through their actual bucket, voice, style, audience, and source policy. Documentary/true crime need dedicated factual fixtures; a separate genre name is not automatically the fix. No independent coverage is established here for every conceivable subgenre.

**What the output evidence establishes**

The tracked 18 July investigation contains 64 stories: 40 baseline GPT-4o drafts, 16 Claude drafts, and eight stronger-consequence GPT-4o probes. The old baseline configurations passed 1/40; Claude passed 14/16 after bounded rewrite across four genres only (12/16 first attempt on transcript recount); the stronger-consequence probes passed 0/8. Conditions used Taglish at 75s/240s. Children's/fairy tale were absent. These are historical results, not today's pass rates. Source: [research/findings/production-consequence-investigation.md:18](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/research/findings/production-consequence-investigation.md:18).

Newer Crossroads releases show repeatable founder-approved factual production, with differing amounts of intervention. They do not establish all-genre quality. Current metrics explicitly say editorial pass rate is not systematically tracked: [dna/company/current-metrics.md:197](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/dna/company/current-metrics.md:197).

Prior ending repair is a warning against overconfident prompt fixes: the automated judge graded all six repaired endings as no longer weak, but the founder preferred the repairs in at most 2/6 blind pairs; a later blind read found all 12 originals acceptable. Blanket ending restrictions were reverted. Keep these as negative controls, not gold labels. Sources: [dna/company/decision-log.md:680](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/dna/company/decision-log.md:680), [dna/company/decision-log.md:718](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/dna/company/decision-log.md:718).

The recent cited-EBN-editor experiment also failed: 1/9 mechanically valid editor outputs versus 0/9 matched writer outputs. Several richer ending/planning instructions worsened fidelity or duration. The proposal was retired. This audit supports fixing concrete contracts and feasible budgets; it does not revive that editor. Source: [hypotheses/ebn-cited-editor.md:15](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/hypotheses/ebn-cited-editor.md:15).

**Verification performed and evaluation gaps**

91 targeted tests passed across 11 files: 80 core prompt/catalog/bible/genre tests and 11 worker generation/peak tests. These are predominantly schema/helper checks, not end-to-end quality evidence.

A no-API local reproduction additionally confirmed:

- 750 requested EBN words → 675–825 allowed words, maximum 14 sentences, 30-word instruction → maximum 420 words.
- An unfrozen reel changed from horror to comedy when its channel changed.
- Channel-only evidence resolution returned false where the selected series resolved to true.

The genre lab is not currently production-equivalent: it defaults differently for the writer, omits production's essence enforcement, and omits the long-form platform hint. It does not exercise real EBN routing or recovery. Evidence: [apps/worker/scripts/probe-genre-lab.ts:388](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/scripts/probe-genre-lab.ts:388), [apps/worker/scripts/probe-genre-lab.ts:508](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/scripts/probe-genre-lab.ts:508), [apps/worker/scripts/probe-genre-lab.ts:602](/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator/apps/worker/scripts/probe-genre-lab.ts:602). Fix or clearly label this harness before quoting a new all-genre pass rate.

**Recommended sequence and trade-offs**

1. Repair artifact/verdict recovery, source-policy routing, EBN language, framing/provenance, and feasible budgets. Add provider-free regressions at the production orchestration boundary.
2. Make the existing lab exercise production behavior and record model IDs, prompt versions, flags, resolved creative/source contract, and input hashes. Use a small shared test seam only where these observed mismatches justify it.
3. Calibrate judgment with 20 human-labelled controls: one valid and one flawed example for each genre. Include valid open endings, warm children's morals, observational comedy, and factual explanation without an invented protagonist.
4. Run a proposed story-only diagnostic screen: 10 genres × English/Taglish × 75s/240s = 40 samples. This is a breadth screen, not a success-rate estimate. Investigate failures with repeated matched samples. Add fixed-dossier EBN/standard-factual cases and 600s/1200s boundary cases separately.
5. Track first-attempt and final pass separately; measure false approval/rejection, creator-intent preservation, factual issues, length, repeated devices, stage-induced damage, and actual cost. Archive curated fixtures/results durably. Do not blindly commit sensitive production dossiers.

The technical corrections remove objectively inconsistent behavior. Creative-rule changes have a greater risk of removing useful taste and should earn their place through blind preference. Expected benefits are fewer wrong-topic/wrong-language outputs, fewer unnecessary rewrites, reliable recovery, stronger provenance, and better genre fidelity; no numerical lift is established.

**Decision and follow-up.** These are proposed fixes, not accepted policy changes or roadmap reprioritization. Prioritize the confirmed contract/recovery defects within reliability work. Founder judgment is needed to change intentional editorial defaults or approve a broader paid creative experiment. No constitution amendment, new creative stage, or automatic genre expansion is recommended. After corrections, update stale roadmap claims about the EBN brief and scheduler, and record accepted decisions with the evidence that supports them.
