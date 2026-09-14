# Story generation evaluation

The pipeline accepts any trimmed genre label up to 120 characters. A genre does not need an entry in a catalog before it can be generated. The ten built-in modules are optional defaults; custom and mixed forms retain their own intent and use general craft. This evaluation set is a rotating sample, not a list of supported genres.

## What the automated checks establish

Provider-free regressions cover known and unfamiliar labels, non-Latin text, explicit style/voice and influence, source permissions, manual/series/scheduled entry points, exact-winner recovery, evidence integrity, and paid-error accounting. They verify what the pipeline preserves and enforces. They do not establish that a model produces excellent stories in every form or language.

Run `pnpm test`, `pnpm lint`, and `pnpm typecheck` for application verification. Run `pnpm --filter worker typecheck:story-probes` for these evaluation entrypoints and their touched EBN experiments; the normal worker TypeScript configuration includes only application source.

## Routes and artifacts

`apps/worker/scripts/story-studio-check.ts` calls the actual production `generateStory` entrypoint on an existing channel. It creates one real, cost-accounted reel and stops before downstream scenes, audio, or publishing. It follows that channel's story mode and enabled optional stages. Source-required channels/series need a dossier. Its JSON artifact includes the configuration, model defaults, prompt/version-bearing production output, final story, fact checks, and cost. A failed readiness verdict exits 2 and still saves the output for review.

```sh
pnpm --filter worker exec tsx scripts/story-studio-check.ts CHANNEL_UUID \
  --genre "cozy mystery" --seed "A missing library key" \
  --out /absolute/path/to/new-result.json
```

Use `--series SERIES_UUID` to exercise a series contract, or `--dossier /absolute/path/to/sources.txt` for factual work. These are paid runs against the selected channel. Explicit output paths are reserved before generation, and existing artifacts are never overwritten.

`apps/worker/scripts/probe-genre-lab.ts` is a standard-chain diagnostic using current prompts and normalized gate judgments. It does not exercise production persistence, optional stages, or EBN routing. Its fictionalized and source-brief experiments must be reported under that route, separately from production results. The default writer uses the production provider; an explicit alternative remains an experiment. Saved artifacts retain intermediate attempts and refinements for attribution.

```sh
PROBE_DRY_RUN=1 pnpm --filter worker exec tsx scripts/probe-genre-lab.ts "romantic science fiction"
PROBE_OUTPUT=/absolute/path/to/new-lab.json PROBE_NICHE="A gentle mystery for families" \
  pnpm --filter worker exec tsx scripts/probe-genre-lab.ts "cozy mystery"
```

The first command prints configuration without paid calls or database writes. The second performs paid generations. Historical `probe-ebn-*` scripts test particular hypotheses; their results are not a current production-wide pass rate.

## Rotating quality sample

Start with the ten default modules for continuity, then add unfamiliar forms and conflicting combinations. Replace or expand these examples whenever creator usage or a failure supplies a better case. A new genre should add evidence, not require production branching.

| Form or combination | Contract to inspect in the finished story |
| --- | --- |
| Cozy mystery / police procedural | Appropriate stakes, intelligible clues, supported resolution; no forced horror register |
| Romance / romantic science fiction | Relationship promise and speculative premise both survive refinement |
| Epic fantasy / science fiction / alternate history | Coherent invented world; source policy distinguishes invention from documented history |
| Adventure / action / western | Spatial and causal clarity; pacing fits the requested duration |
| Satire / absurdism / dark comedy | The chosen comic mechanism survives; no compulsory wholesome lesson or confession |
| Slice of life / contemplative fiction | Observation or endurance can earn a payoff without an imposed twist |
| Personal essay / memoir-style fiction | Explicit reflection can work when selected; invented experience is not presented as verified testimony |
| Children's bedtime tale / fable / folklore | Audience, repetition, reassurance, and a requested moral remain compatible choices |
| Documentary / biography / true crime | Narration, title, logline, and citations agree with supplied evidence and permissions |
| Historical romance / documentary comedy | Mixed factual and creative constraints stay explicit across every pass |
| Epistolary / oral history / lyrical narrative | The requested form and voice survive the editor, naturalizer, and gate |
| Creator-provided non-English or novel label | Exact intent survives setup, persistence, prompts, and downstream defaults |

Cross these cases with short and long durations, selected first/third-person voices, light/full style influence, and operator-written rubrics. Use factual policy only where the brief calls for it. Include at least one unfamiliar label without any recognized genre keyword and one whose niche contains a conflicting keyword.

For fresh quality evidence, retain failures as well as passes. Blind the narration's pipeline/version label before human review. Record separately: creator-intent fidelity, intelligibility, emotional payoff, factual correctness where applicable, and human preference between versions. A model's gate verdict is a separate column, never a substitute for preference. Investigate false passes and false failures before strengthening a shared taste rule. Report counts by route, language, duration, genre/form, and first attempt versus repaired result; do not pool historical model experiments into a current success rate.

No fresh paid quality sample was run as part of the September 13 implementation. The implementation evidence is automated contract and orchestration verification plus a production build.
