# Roadmap

Living backlog for the operator app. Vision: an AI pipeline that turns a niche
description into publish-ready videos; we run it ourselves first on **Crossroads**
(Shorts/Reels for reach, long-form YouTube for deeper viewing and RPM), and
productize as SaaS only after the channel proves traction.

Model today: **one operator, multiple channels.** Dashboard = the operator's
channel portfolio.

This file is the **execution backlog**. The strategy layer — why work is
sequenced this way — lives in `dna/company/roadmap.md` (company DNA starts at
`dna/START-HERE.md`).

---

## Current handoff — 2026-11-24

**Roles:** Tala owns this roadmap and acceptance review; the implementation session owns code; the founder
approves releases. Both Claude Code sessions read this section from the shared Git ref named in the handoff
message, not from a local working tree. Nothing below authorizes paid generation, deployment or live
configuration changes.

**Live (verified in production)**

- Web runs `22dfb12`: `https://app.kendrix.io/api/health` returned
  `{"ok":true,"build":"22dfb12","buildSource":"stamp"}` at 2026-11-24 03:56 UTC.
- Worker ran `22dfb12` at the 2026-11-03 recovery (Railway deployment record and boot stamp,
  `specs/recovery-2026-11-03.md`). It cannot be re-read today, so the worker build is **unknown** as of this handoff.
- `main` is still `ac7a481`. Production runs commits that are not on `main`; they are in PR #40.
- Studio signup is `approval` (2026-11-03 configuration inspection). The marketing site at `kendrix.io` responds,
  but its deployed commit is not recorded.

**Passed local or CI checks only (not live)**

- [PR #40](https://github.com/krystaljoysilvestre/reels-generator/pull/40) (`codex/creator-journey-followthrough`,
  tip `22dfb12`): CI green, mergeable, unmerged. This is the code already deployed; merging it aligns `main` with production.
- [PR #41](https://github.com/krystaljoysilvestre/reels-generator/pull/41) (`claude/project-thread-8zned8`,
  `d5783f7`): CI green, mergeable, unmerged, not deployed. Worker build reporting in `/api/health` plus a read-only
  "Deployed builds" workflow that needs a `RAILWAY_PRODUCTION_TOKEN` secret. #40 and #41 are release-baseline work,
  not the signup preview.
- KDX-002/003 open-signup, sample-only Studio preview: the last candidate reportedly passed local checks and was not
  deployed. Its patch is not on any branch, PR, stash or worktree in this repository (searched 2026-11-24).

**Blocked**

- [#26](https://github.com/krystaljoysilvestre/reels-generator/issues/26) release baseline: the worker build is unknown,
  which #26 treats as a blocker. It clears after #41 merges and the worker redeploys, or after a direct Railway read.
  Both need founder approval.
- KDX-002/003: blocked until the founder supplies the existing patch. Do not rebuild it.
- Opening signup: the fresh non-admin journey through export
  ([#30](https://github.com/krystaljoysilvestre/reels-generator/issues/30)) and live account email (Resend not
  configured) are still unverified.

**Priorities and session ownership**

1. **KDX-001**: review the homepage on desktop and phone, make the demo ("The cut") easy to find, and make the primary
   button match what visitors can actually do. Implementation session; mocks only. No GitHub issue yet.
2. **KDX-002/003**: open-signup, sample-only Studio preview. Verify real sign-in in isolated staging, block paid
   generation, retries and background jobs for free accounts, and prove signup and verification-email limits hold
   without Redis. Pricing and subscriptions are separate work. Waiting on the patch.
3. **#26**: release baseline through #40 and #41. Kept separate from KDX work. Recheck PR state and verify deployed web
   and worker builds before calling the baseline settled.

Other open issues are not in the current priorities:
[#27](https://github.com/krystaljoysilvestre/reels-generator/issues/27)–[#29](https://github.com/krystaljoysilvestre/reels-generator/issues/29)
(production safety) and [#31](https://github.com/krystaljoysilvestre/reels-generator/issues/31)–[#39](https://github.com/krystaljoysilvestre/reels-generator/issues/39)
(drama mode, publishing copy, News Today PH pilot).

The September plan below is kept as history. Where it conflicts with this handoff or the 2026-11-03 recovery record,
the newer entry wins.

## Hosting recovery verified — 2026-11-03

Railway billing is active again and all four services are restored. Web and worker now run the reviewed,
pushed `22dfb12` release; migrations 0067 and 0068 are applied. The public health check, existing-admin
Google sign-in, four-channel dashboard, authenticated media loading and an existing approved reel's
post-package download passed. The export's ZIP integrity passed and the reel's spend stayed at $7.86.
The worker's startup trending refresh recorded 2¢. The $30 hosting alert and $50 cap remain in place.

Signup remains approval-based. A fresh non-admin production-to-export lap and real account-email
acceptance still remain before opening access; this recovery does not close those gates. See
`specs/recovery-2026-11-03.md` for deployment, data, queue and verification evidence. The September
deployment-blocked statements below are historical and superseded by this recovery record.

## September plan (history) — complete the free early-access journey (2026-09-24)

**Founder direction:** finish the journey for future subscribers so signup can open, then return to story,
visual and audio polish. The founder selected **free early access first**, without checkout or a paid plan.
This is the active implementation priority. The historical Phase 0 evidence below remains relevant to the
required deployed production lap; this change does not assert that its missing proof has passed.

- Merged to `main`: verified self-service signup behind `SIGNUP_MODE=open`, safe Google sign-in,
  verification/password recovery and session revocation, existing-account invite acceptance, account/profile
  and usage, first-reel guide, draft ownership enforcement, capped-but-downloadable exports, and suspended-owner
  spending protection. The marketing site's open mode links to the studio signup instead of the waitlist.
- Existing default remains approval-based access. The reviewed release is merged, but Railway billing
  blocked deployment. Free-access limits were staged without restarting services; the founder deferred
  deployment until billing is resolved. See `specs/early-access-rollout-2026-09-24.md`.
- Local follow-through now releases creator production slots after approval, makes publication confirmation
  safe to retry, and gives accurate recovery guidance when account email is unavailable. Evidence and
  remaining boundaries: `specs/creator-journey-followthrough.md`.
- The verified local slice completes the posting handoff: Instagram, separate destination records and post
  links, direct downloads, captions with image credits and optional browser file sharing. No new social API
  review is needed for creators posting through the platforms themselves. See `specs/publishing-handoff.md`.
- Ayrshare remains deferred. The founder later approved a bounded Post for Me own-account pilot, then
  prioritized a creator walkthrough before further integration. No subscription or real provider posting has
  been verified. Free early access keeps the manual handoff and optional YouTube integration; broader automatic
  publishing and scheduling remain outside launch scope. See `specs/post-for-me-pilot.md`.
- The local creator walkthrough found conflicting caption editors at the final posting step. One editor now
  preserves the current draft, copies it accurately and keeps saved previews/exports consistent. Draft-resume,
  failed-save recovery and desktop/phone checks are recorded in `specs/creator-walkthrough-2026-09-24.md`.
  Review of one existing approved reel supports a publishing-copy refinement, not a production rewrite.
- Acceptance and remaining configuration: `specs/early-access-journey.md` and `specs/early-access-launch.md`.
- A separate, founder-authorized $10 commercial experiment has spent $0.14 across rejected text planning
  and a grounded five-image storyboard. Real assets are bound; a silent 30-second preview is available.
  Narration is blocked by ElevenLabs `payment_issue`; no completed commercial or revision was produced.
  Captured pricing copy and mixed example stories also block public release. This does not establish
  commercial support or justify priced allowances. See `research/evals/commercial-pilot.md` and
  `hypotheses/commercial-asset-grounding.md`.
- Before opening: deploy the reviewed build and migration, configure/verify account email and Google,
  align both signup switches, apply the staged free-access spend ceilings and verify the support procedure, then complete
  one fresh non-admin journey through export on the deployed app.

## Previous acceptance sprint — exit Phase 0 through the product (2026-09-01, updated 2026-09-04)

Historical acceptance evidence and remaining production proof follow; the active priority is above.

**Founder decision 2026-09-01:** Crossroads reel #5 is frozen. Run a **ten-working-day Phase 0 exit sprint**.
Four retained publishes are enough to establish repeated creative production provisionally; the unresolved blocker
is that the latest lap still needed scripts, queue inspection and engineering salvage. Existing reels stay live and
keep collecting metrics, but a fifth reel is not the roadmap.

### Phase 0 exit gate

One fresh standard short-form reel must complete through the **deployed product**:

1. invite/sign-in → channel → story → storyboard → production → review → export;
2. no terminal commands, direct SQL, one-off scripts or manual infrastructure salvage;
3. a forced recoverable provider or queue failure is visible in-product and one-click retry reuses durable work;
4. retry does not repeat paid provider calls or add the same cost twice;
5. automated checks prove foreign tenant IDs return 404, suspended users are blocked, storage ownership holds,
   and reel/user/global spend boundaries are enforced; and
6. lint, typecheck, unit/integration tests and production build are green on the acceptance build.

**Engineering evidence landed 2026-09-01:** item 5 now has an explicit shared-key allowlist,
channel/reel/compilation ownership for every private key, DB ownership records for channel uploads, and real
Postgres acceptance suites proving owner access, foreign denial, ambiguous legacy-key denial, foreign resource
IDs returning 404, suspended/pending sessions blocked, and reel/user/global spend gates halting before a paid
step starts. The spend lap also closed an exact-boundary defect: a reel already at its cap can no longer begin
one more provider call, while deterministic provider-free timing/mix/render/QA work remains allowed so the cap
cannot strand already-paid work. CI provisions and migrates Postgres before running these checks. The forced retry lap and
the fresh product-only reel still remain. The render path now commits `visual.mp4` as an indexed reel-owned
checkpoint immediately after upload, so the forced lap can lose its queue/render step after that boundary and
prove one-click Retry skips the already-finished frame pass without R2 inspection or manual salvage.

**Sprint status — 2026-09-10, day 8 of 10 working days; the window closes 2026-09-14:**

| # | Criterion | State |
| - | --------- | ----- |
| 1–2 | Fresh reel completes invite/sign-in → export in the deployed product, no terminal/SQL/scripts | **Artifact complete; strict proof still open.** Reel `b2ce55d3` completed sign-in → production → review → approval → export at $7.86, but engineering fixes, deploys and log inspection occurred between its visual failures. One clean replay remains before calling the builder absent |
| 3 | Forced failure visible in-product; one-click Retry reuses durable work | **Pass live 2026-09-10.** The product surfaced the injected finishing failure; one Retry reused `visual.mp4` and completed render in 12.5s rather than repeating the 269.7s frame pass |
| 4 | Retry repeats no paid provider call and no cost | **Pass live 2026-09-10.** Spend was 786¢ at failure and 786¢ after final QA; recovery logged cached-visual reuse and no paid provider step reran |
| 5 | Automated tenant / suspended-user / storage-ownership / spend-boundary checks | **Green** — `api-access.integration` (5 tests) and `spend-boundaries.integration` (5 tests) pass against real Postgres |
| 6 | Lint, typecheck, tests, production build green | **Green.** Real-Postgres CI proof remains on consolidated build `721a987` (696 passing / 1 Redis skip, all three integration suites present). The deployed visual-repair path through `7e0a6b1` passed full lint (0 errors, 9 existing warnings), typecheck, **711 local tests / 12 environment-gated skips**, and the full production build on 2026-09-11 |

**The forced failure is now configuration, not an intervention (2026-09-03).** `FORCE_STEP_FAILURE` names
boundaries to fail at; unset — the shipped state — is a no-op that does not even query. The one boundary that
exists, `render:after_visual`, fails immediately after the graded visual checkpoint commits and `render.mp4`
reaches R2 but before the render asset row is written: the exact shape of the 2026-09-01 lost-lock failure that
needed manual salvage. It fires only on a step's first attempt (read from that step's own durable row), so one
click of Retry clears it and an armed variable can never trap a reel in a loop, and it throws
`UnrecoverableError` so BullMQ cannot quietly succeed on its own second attempt instead of showing the creator a
failed phase. `forced-recovery.integration.test.ts` proves against real Postgres that the failure is recorded,
that the storyboard/retry predicate sees it, that a completed paid step re-enters as a cache hit with
`costCents: 0` and no provider call, and that the reel's ledger reads the same before the failure and after the
recovery. The runbook for the live lap — arm, produce one reel, watch it fail, click Retry, verify the ledger,
disarm — is `specs/phase0-forced-recovery-lap.md`, and it recommends running it **inside** the acceptance reel
rather than paying for a second one.

**The root `test` script now runs what CI runs (`6e9ff51`).** It recursed into `test` scripts, and both
`apps/web` and `@reels/providers` define only `test:unit` — so the convenient local command reported all-green
while running **neither** of criterion 5's suites. It is now `pnpm -r test:unit`, identical to
`.github/workflows/ci.yml`.

**Read the run by which suites appear, not by the exit code or a skip count.** `TEST_DATABASE_URL` must be set or
all three integration suites self-skip silently, so the assertion for the acceptance build is that
`api-access.integration` (5), `spend-boundaries.integration` (5) and `forced-recovery.integration` (3) are each
present with those counts. A global "0 skipped" is the wrong rule: `redis-limiter.test.ts` skips without
`REDIS_URL`, and CI provisions no Redis, so a correct CI run reads 696 passing / 1 skipped. **That suite has
therefore never run in CI** — a small real gap, not a reason to loosen the rule.

**Consolidated onto one acceptance build 2026-09-04 (`721a987`).** The tenancy and spend suites had reached
`main` as PR #23 (`ddce1c9`) while the nine deployment and reliability commits from 09-02/09-03 sat only on
`codex/verified-visual-identity`. `main` now carries both plus the forced-recovery lap, both refs point at the
same commit, and the four CI steps were re-run against real Postgres on it. It is **pushed**: `origin/main` and
`origin/codex/verified-visual-identity` both stop at `e3f8c9b`, and GitHub CI passed independently on `main` in
4m54s (run 33852453636).

**Deployment cut over 2026-09-02:** `https://app.kendrix.io` now answers from the Railway Hobby stack in
Singapore — one public web service, one private all-role worker, private Postgres and Redis, and the existing R2
assets (`specs/phase0-deployment.md`). An external probe on 2026-09-03 returned `/api/health` 200 with Railway edge
headers, so the origin no longer depends on the founder's Mac being awake. **All five canary rows now carry hosted
evidence** in `specs/phase0-deployment.md`: health, migrated-data parity and anonymous denial passed first; the
2026-09-10 acceptance artifact then completed operator Google sign-in, authenticated R2 reads/writes, durable
recovery across a worker restart and product export. The Cloudflare Tunnel route remains rollback until the clean
product-only replay clears the gate. Scheduled production stays off until that decision.

**The first live acceptance attempt stopped on a real pre-render blocker on 2026-09-09.** Reel `b2ce55d3`
reached Visuals at $2.16, then the verified-identity gate could not reconcile a sourced intact B-52 with the
story-time state `broken-apart`: every candidate that satisfied the destructive state was rejected for not
preserving intact physical structure. The product surfaced the failure and preserved work; one Retry repeated no
paid work and left spend at $2.16, but it could not repair the stored binding. The injected render boundary was
never reached, so criteria 3 and 4 were still open at that point. Evidence and the rerun condition are recorded in
`specs/phase0-forced-recovery-lap.md`.

**The same artifact completed the hosted recovery path on 2026-09-10.** After the destructive-state, exact-source
and source-grounded image-QA repairs were deployed, scene 3 passed with a state-adapted, source-shaped Mark 39
under its parachute. Production finished at **$7.86**. `render:after_visual` then failed as configured; the UI
showed the preserved-work recovery message, one Retry reused the durable visual, and the ledger stayed at 786¢
through final QA. The 86.3-second reel was spot-checked, approved and exported, and remains unpublished. This
closes the live forced-recovery and duplicate-cost criteria. It does **not** close the stricter product-only
criterion: the builder repaired and deployed code during this reel, so one clean replay is still required.

**Migration parity passed 2026-09-09.** A read-only hosted query found 1 user, 4 channels, 14 reels and the exact
five migrated YouTube publications with their dates, status and disclosure flags intact. The append-only spend
ledger exactly matches the local baseline at 163 rows / 225¢. Production has one expected extra hosted reel,
`a0b521b1`, at 712¢. The remaining 28¢ difference from the later local reel-cost snapshot belongs to
`38f08fcf`: production's 655¢ value was last updated on 2026-08-24, before migration, while the local snapshot
later read 683¢. That is local-only post-split spend, not an import loss.

**The hosted stack drifted, and was caught and closed on 2026-09-04.** Railway has no GitHub auto-deploy, so
pushing changed nothing hosted: `web` sat on `fb53e7d` and `worker` on `fa156da`, meaning **the worker lacked
`6e9ff51` entirely**. Arming `FORCE_STEP_FAILURE` against it would have read nothing and handed back a clean reel
that proved neither criterion 3 nor criterion 4 — the same silent-no-op shape as the dead metrics poller and the
test suite that skipped while exiting 0. It also lacked `2096af3`, the in-product Retry restore criterion 3
depends on. `scripts/deploy-railway.sh all` then put `d0a0c59` on both services (web 17:31 +08, worker 17:34
+08), and both now report it themselves. **The hosted lap is unblocked.**

**The running build is now readable rather than remembered (2026-09-04).** `/api/health` reports `build` and
`buildSource`, the worker logs its commit on every boot, and the new deploy script refuses a dirty or unpushed
tree, stamps the commit into the upload context, and polls until the service reports the commit it just deployed.
It never infers a SHA: an unstamped process says `unknown`. **Verified hosted the same day:** health returns
`{"ok":true,"build":"d0a0c59","buildSource":"stamp"}` and the worker logs `[worker] build=d0a0c59 (source=stamp)`.
`buildSource: stamp` matters — Railway injected no git metadata, as expected for a `railway up` deploy, so without
the stamp both services would have reported `unknown`.

Creative review remains allowed and expected. Direct YouTube/TikTok/Facebook publishing, billing, teams,
long-form, public-launch polish and new creative architecture do **not** block this gate. Direct YouTube may be
exercised for the founder's connected test channel, but export is the required product boundary.

When the gate clears, the founder makes an explicit Phase 0 → Phase 1 decision. Crossroads then becomes a release
canary or bounded every-two-to-four-week product check—not the default work queue.

**Stories Published is 4.** Crossroads' *The Urinal Rejected but Immortalized* went live on YouTube on
2026-08-24 (`6gcyx9bK2mE`); *Apollo 11's One Chance to Leave the Moon* followed on 2026-08-26
(`DTi3ZhEuPpk`); *Could Binoculars Have Saved the Titanic?* followed on 2026-08-29 (`xIeZIn46B_o`); and
*The 31 Million Bottle Decision* followed on 2026-09-01 (`WCRkYws2Kho`). All four are intended to stay up,
and YouTube's Data API confirmed each public video after upload. *Edge of
Everything* remains correctly classified as the earlier OAuth proving run that was taken down (decision-log
2026-08-22-001).

### 1. Publish one Crossroads reel that stays up — complete, observation open

**Crossroads is the sole Customer Zero channel for this lap.** Other channels do not count toward current
roadmap progress, even if their old artifacts remain useful as historical test cases.
The 2026-08-24 lap completed all three steps:

1. **Fresh render produced.** The current factual/visual-truth path cleared its blockers; render QA passed.
2. **Watched and decided.** Editorial, visual and sound review independently returned **publish as-is**;
   no disqualifying issue was found. The founder delegated the final call and the reel was approved.
3. **Crossroads posted.** The channel-owned YouTube grant published `6gcyx9bK2mE`; the public API confirmed
   liveness. TikTok and Facebook Reels remain manual destinations and do not block the first retained proof.

Do not call weekly consistency or audience value proven. Four retained publishes establish a repeatable creative
production path; those audience questions continue in observation while product-only completion is the active
bottleneck.

### 2. The first audience signal — automated write verified, observation open

Reel #2's 24-hour read landed on 2026-08-27: **112 views / 4 likes / 0 comments** at ~22.5 hours. Reel #1
reads **88 / 0 / 0** on day three. Nine snapshots now exist across the two publications, all written by the
scheduled poll through `YOUTUBE_API_KEY`, so the automated write is proven end to end. Reel #2 is ahead of
reel #1 at every comparable point and carries the first likes any Kendrix reel has drawn — a change from zero,
not a pattern. The next useful reads are the seven-day snapshots. Do not tune hook, visuals, sound or packaging
from two reels.

**The poll only runs while the worker runs.** `registerMetricsPollSchedule` is a repeatable BullMQ job
(`0 */6 * * *`) inside the worker process; a laptop with no worker on it collects nothing, and BullMQ does not
backfill the missed hours. `trending_refresh` already has a catch-up call on boot for exactly this reason and
`metrics_poll` does not — the cheapest possible fix if the gap recurs. Verified 2026-08-27: all five schedules
registered, next metrics poll 10:00 UTC.

**The deleted proving run still reads as `published`.** `RRvU0b1TFAc` sits in `publications` with
`status=published` and zero snapshots; every poll asks YouTube for a video that no longer exists and gets
nothing back, silently. This is decision-log 2026-08-22-001's event-versus-state defect still present in the
data, and it is the same silent-return shape as the ten-day poller outage.

### 3. Crossroads reel #2 published — observation open

The early number says only that reel #1 is reachable. It did not justify tuning the hook, visuals, sound or
packaging. Reel #2, *Apollo 11's One Chance to Leave the Moon* (`869103c8`), cleared factual fidelity and
visual truth, but founder playback reopened two endings that passed technical review. The first went silent
because sidechain compression ended the music with its shorter narration input; the next carried the bed
correctly but exposed the deeper defect: the story rushed its successful outcome, ended on “Three men came
home,” then reopened as an archival afterthought. A 61.8-second hard-payoff revision overcorrected in the
other direction: it stopped cleanly but left the story's counterfactual memo without a meaning-bearing
resolution. The **65.7-second** creator cut now uses fast causal beats for ignition → lift → orbit → docking,
then shifts to a slower, warmer coda: “The disaster speech stayed on the page. Three men came home.” The
final payoff alone receives an additional 12.5% slowdown. The memo is the hinge, Earth/Eagle is the final
image, and the established bed decays continuously across a three-second release while picture and captions
fade to black over the final 1.5 seconds. The cut passed render QA and independent creator, visual and sound
**PUBLISH** review. Founder playback then cleared this exact artifact after the final payoff alone was slowed.
The channel-owned grant published it to YouTube as `DTi3ZhEuPpk`; the public Data API confirmed liveness and
the disclosure flag is recorded. Kendrix keeps the reel itself at `approved` because TikTok and Facebook remain
manual destinations, while the YouTube `publication` is correctly `published`. Measured reel cost is **$5.21**
and the YouTube upload cost **$0** (quota-metered, not billed).

The lap cost **$5.33 end to end**: $0.02 evidence acquisition before a reel existed, $0.10 for a rejected
first candidate whose thin two-source dossier led to unsupported death claims, and $5.21 for the current
replacement. The revisions added $0.29 across four bounded voice passes; memo crops, SFX/music
rebalancing, cached-visual re-muxes and QA were provider-free. The story gate caught the false claims before visuals. The visual-truth gate then rejected
invented historical staging before image spend; Gate 2 later replaced ambiguous generated diagrams with
verified public-domain Apollo media instead of brute-force re-rolling. Those are production observations,
not yet mandates for new machinery.

One compatibility repair was necessary: OpenAI had retired `gpt-4o-mini-search-preview`, so evidence search
was moved to the Responses API's `web_search` tool on `gpt-4.1-mini`, with its 8,000-token billing floor and
per-search fee included in exact cost accounting. The creative settings stayed unchanged.

### 4. Crossroads reel #3 published — observation open

*Could Binoculars Have Saved the Titanic?* (`d5bec144`) passed factual, visual and technical gates, then
improved through founder playback: the first mix let effects overpower the opening voice and used arbitrary
red-word emphasis; the next overcorrected the effects and dropped meaningful emphasis while exposing stray
top labels. The approved cut keeps seven audible, ducked effects, six semantic red words, and no top labels.
Its ending resolves the counterfactual without pretending one missing key caused the disaster: the final
meaningful beat returns to the official finding that **22 knots in known proximity to ice** was the cause.
No local narration-delivery change was needed; the audio uses a resolving release. Founder corrections were
provider-free local remix/render work. Measured reel cost is **$6.70**, plus **$0.02** evidence acquisition;
the YouTube upload cost **$0** (quota-metered, not billed). The channel-owned grant published it as
`xIeZIn46B_o` on 2026-08-29, and the public Data API confirmed liveness. YouTube rejected the custom Shorts
thumbnail, so its automatically selected frame remains. Kendrix keeps the reel at `approved` while TikTok and
Facebook remain manual destinations; its YouTube publication is correctly `published` with disclosure recorded.

### 5. Crossroads reel #4 published — observation open

*The 31 Million Bottle Decision* (`91ebdcf9`) passed render QA after bounded operator recovery preserved
already-paid work: two failed motion beats degraded to approved stills, and a durable graded visual was salvaged
after a queue-lock failure rather than rendered again. Manual storyboard review replaced six fabricated product
labels and document text that automated visual-truth QA had missed. Founder first playback liked the cut and
supplied one forward note—future endings should hold longer after the final word—so the future `resolve` tail is
now 2.6 seconds instead of 1.8 seconds. The watched artifact itself was approved without semantic or delivery
repair. Its measured cost is **$9.32** against an $11.20 cap, including a conservative $5.60 estimate for eight
timed-out submitted motion calls. The YouTube upload cost **$0**. After the seven-day testing-mode OAuth grant
expired, the founder renewed the Crossroads connection and the guarded uploader published `WCRkYws2Kho` on
2026-09-01. The public Data API confirmed liveness and the metrics poll recorded the zero baseline. YouTube
rejected the custom Shorts thumbnail on account eligibility and retained an automatic frame. TikTok and Facebook
remain manual destinations, so the reel stays `approved` while its YouTube publication is correctly `published`.

**Next action:** leave all four retained publishes up and observe their scheduled metrics while the Phase 0 exit
sprint runs. Do not start Reel #5 until the exit gate has cleared and the founder deliberately resumes the ending
experiment.

For the next **three materially different Crossroads reels**, record the ending's intended function, its final
meaningful beat, whether the final narration needed a local delivery shift, the selected audio release
(`button` / `resolve` / `ring_out`), founder first-playback verdict, and revision cost. Genre and channel DNA
are context; neither assigns the answer. If at least two of the three again need manual repair to ending meaning
or final-line delivery, graduate the smallest semantic handoff from the story's existing plan into narration and
sound direction. If they land without it, add no new architecture. Automated QA continues to verify timing,
continuity, intelligibility, and fades—not whether a lesson, redemption, or unresolved ending was creatively right.

**The ending ledger — 2 of 3 recorded, paused by the 2026-09-01 pivot.** Reel #2 is the motivating case, not
one of the three. Pausing preserves the preregistered threshold; it does not count as a third result.

| # | Subject | Intended ending function | Final meaningful beat | Delivery shift? | Release | Founder first playback | Revision cost |
| - | ------- | ------------------------ | --------------------- | --------------- | ------- | ---------------------- | ------------- |
| 3 | Titanic's missing binoculars — the locked cabinet and the ice warning that never reached the bridge (founder-selected 2026-08-27) | Resolve the counterfactual by separating a documented missed possibility from a single-cause myth | The official finding: 22 knots in known proximity to ice was the cause | No | `resolve` | Revise — effects overpowered the opening voice and emphasis felt arbitrary; approved after local mix/caption repair | $0 provider cost for founder corrections; $6.70 reel + $0.02 evidence |
| 4 | The 1982 Tylenol crisis — the nationwide withdrawal while the poisoner remained unknown | Resolve the decision by joining the corporate withdrawal and later federal rules without claiming either solved the crime | Two separate decisions answered the same crisis: when certainty was impossible, what risk should remain on the shelf? | No | `resolve` | Like — no repair to ending meaning or delivery; future reels should hold longer after the final word | $0 provider cost for founder correction; $9.32 reel, including conservative timeout cost |
| 5 | *paused — select only after Phase 0 exit* | — | — | — | — | — | — |

Fill each row from the actual lap, not from the plan. A row becomes evidence only once the founder has watched
the artifact.

### What was fixed to get here (2026-08-21)

The performance poller was **dead at its own first line for ten days**. `runMetricsPoll` gated on
`isYouTubeConfigured()`, which required an installation-wide `YOUTUBE_REFRESH_TOKEN` — the exact
credential the 08-11 per-channel migration replaced. `metrics` held zero rows and nothing said so.

Every call site now resolves the channel's own grant through one function, `resolveYouTubeAuth` in
`@reels/db`, and the operator-wide path is **removed** rather than left as a fallback. Two siblings were
stranded the same way and are fixed with it: the worker's auto-publish (gated on the dead check, and
calling `uploadToYouTube` with no per-channel auth at all — an env token would have uploaded to whichever
account minted it) and the Settings gate (which hid auto-publish on connected channels and offered it on
unconnected ones). Public view counts now read via `YOUTUBE_API_KEY` with no grant at all; watch-time and
retention still need the OAuth grant (YouTube Analytics API, `yt-analytics.readonly`) and remain a
deliberate later step. See decision-log 2026-08-21-002.

**Scope correction — 2026-08-24:** the founder designated **Crossroads** as the channel that counts.
Earlier documents grouped it with Lihim ng Nayon as an engineering fixture and pointed the publish lap at
another channel; that operating assumption is retired. The Crossroads work on depictive fidelity, verified
identity and sourced narrative is directly relevant foundation work, but it becomes roadmap evidence only
when a Crossroads reel stays live and produces an audience reading.

**What NOT to do:** turn the retained uploads into a platform-integration lap, split the active proof across
channels, or start Reel #5 while the product-only exit gate is open. Observe Crossroads passively; the next
production artifact is the acceptance lap, not a cadence commitment.

**Launch boundary — implemented is not generally available:**

- The Google OAuth app is in **Testing**. Listed test users can connect, but grants expire after seven
  days and arbitrary Kendrix users cannot use the path reliably.
- Before external users: deploy the production callback, publish homepage/privacy/terms on the verified
  domain, move the OAuth app to Production, submit scope justifications and an end-to-end demo, and pass
  Google verification for `youtube.upload`, `youtube.force-ssl`, and `youtube.readonly`.
- This verification is **not part of the Phase 0 export gate**. Promote it to Now when arbitrary creators need
  direct YouTube publishing; the acceptance lap may use manual export or the founder's test-user connection.

**Still worth knowing:**

- `STORY_PLAN_GATE` is on main and unset. Four published reels do not establish whether enabling it
  improves watched output.
- The watermark is off as of 2026-08-21. All four retained Crossroads reels were freshly rendered after removal;
  older artifacts still carry it and must not be republished without a free CPU-only re-render.
- TikTok and Facebook Reels remain honest manual destinations through the post package. Whatever converts
  them to direct publishing should convert **every** caller in the same commit — that omission is exactly
  what cost ten days of audience data here.

---

## Done

- **Depictive fidelity beyond places — objects, animals, real people (2026-08-12)** — real sourced
  photographs were gated to one line (`policy.realPlaces && kind === 'location'`), so a documentary about
  the Titanic, a Philippine eagle, or José Rizal invented all three. Now a subject classifier
  (`entity-source.v1`) routes each entity to one of three media modes, resolved once and read by every
  downstream gate: `generated`, `reference_plate` (a real image conditions the frame), or `archival_only`
  (a real image is presented as itself and never conditions anything). The human path is split by the
  depictive-ethics floor's own carve-outs — long-dead figures get a conditioning plate gated on a Wikidata
  `P570` death date ≥100 years, living people get genuine licensed archival photographs, and an identity we
  cannot verify is never sourced on either path. Four invariants are enforced in code with unit tests, the
  most important being that an `archival_only` person reaches a generated frame neither as a reference plate
  **nor as a name in the prompt** (the 2026-07-24 fabricated-press-photo failure). Also fixed: the burned
  media disclosure is now computed from what the reel actually contains, so a real archival photograph is no
  longer labelled an illustration. `hypotheses/real-places.md` graduated to `specs/depictive-fidelity.md`;
  migration 0061 adds `scenes.image_origin`. **Verified on a live paid reel** (Crossroads, Duchamp/*Fountain*),
  which found five defects now fixed with regression tests: the Commons licence guarantee was resting on a
  regex miss (a fair-use en-wiki upload was rejected by accident, not by rule); the identity anchor never
  checked it anchored a *person* (a query for Duchamp resolved onto his artwork's Wikidata item — now gated on
  `P31 = Q5`); asking Commons for 1600px served the full-resolution original, which the vision verifier
  rejects (now 1024px); archival fulfilment fired when the person was merely *present* rather than the
  subject; and vision QA graded identity-withheld scenes against the original brief, failing them for obeying
  the floor and burning a paid re-roll each time. Upstream lesson: a real subject only sources if its Story
  Bible id **identifies** it — `story-analyzer.v1.23` now requires a disambiguating id (`duchamp-fountain`,
  not `fountain`, which reads as plumbing).

  **Tagging became load-bearing (2026-08-17).** A sourced plate only reaches a shot that *references* the
  entity, so a mis-tag now costs depictive truth rather than a continuity wobble. Two guards: `scene-qa`
  Check C2 errors when a scene's PRIMARY entity is a character but the prose describes no person (the
  Crossroads reel tagged three object-only beats to Duchamp, who is in none of them), and invariant 2 no
  longer keys off tagging — a withheld person is withheld when *named* in the prose, not only when tagged,
  which closed a live path back to the 2026-07-24 failure. A third guard was **rejected on measurement**: a
  lexical "depicts an entity it doesn't tag" detector scored 1 true positive to 2–3 false on the real reel
  and would have stamped `R.MUTT 1917` onto shop-window plumbing. See specs/depictive-fidelity.md for why
  that failure is conceptual rather than a threshold to tune.

- **Per-channel YouTube authorization + direct publish (2026-08-11)** — selected channel destinations
  are acknowledged in Settings and Storyboard; Google OAuth uses signed expiring state + HTTP-only nonce;
  provider tokens are AES-256-GCM encrypted; disconnect revokes the grant best-effort; direct upload is
  idempotent at the publication boundary and preserves partial multi-platform completion. Migration 0060
  is applied locally. Live proof: one processed, publicly viewable YouTube upload. General-user availability
  remains gated by Google production verification, tracked under Now's launch boundary rather than called done.

- **UI redesign** — modern design system (Stripe/Linear/Apple/Notion peg);
  primitives in `apps/web/src/app/globals.css`, tokens in `tailwind.config.ts`.
- **Portfolio dashboard** — `/dashboard` lists channels (empty state +
  Create-channel button); per-channel reel/published counts.
- **Channel creation flow** — `/channel/new`, a 4-step wizard, AI-assisted:
  **(1) Describe** — name + niche + language + target platform → Claude derives the
  creative bible (tone, visual DNA, world bible, captions, `voiceSearchKeyword`).
  **(2) Sample script** *(optional)* — write/generate one short example narration.
  **(3) Narrator voice** — pick the channel's voice (recommended by niche + genre).
  **(4) Visual style** — pick a look → channel is created.
  (`channel.v1` prompt; `/api/channel/derive` + `/api/channel/create`.)
  - Optional **channel avatar** (R2 upload) and **preset niches** (curated
    trending short-form niches that seed the description) in step 1. Niche
    presets use colored, outlined icons.
  - **Genre-neutral, no horror bias**: tone is modeled as genre-agnostic axes —
    `intensity / warmth / energy / pacing / humor` (replacing the old horror-specific
    `suspense / dread / gore`), so a kids/finance/space channel scores meaningfully
    (e.g. high warmth + humor) instead of always-zero dread/gore. Step-1 placeholders
    and copy are neutral (no "Aswang Files" example) and the preset grid no longer
    leads with Horror. (`gore`/`violence` remain only as image **safety negatives**.)
  - **One language per channel**, picked from a fixed **dropdown** of
    pipeline-supported languages (`languages.ts`) — no free text. Want another
    language → make another channel. (Stored as a 1-element array.) Claude writes
    the language, ElevenLabs narrates it; ~30 languages offered.
  - **Sample script (step 2, optional)** — an editable narration the operator
    writes by hand (preferred) or seeds with a "Generate draft" (`channel-sample.v1`;
    `/api/channel/sample-script`). The draft is a **complete, coherent piece sized to
    the channel's reel length** with a **niche-adaptive arc** (narrative: hook→build→
    recontextualizing turn; informational: hook→points→payoff; persuasive: hook→idea→
    close), in spoken beat-per-line cadence, with Taglish code-switch — no forced horror
    twist. It drives the step-4 preview scene and is saved as the channel's **first
    reference story** (`is_reference=true`, `source` user/ai) so the few-shot selector
    has a seed example from day one.
  - **Per-channel reel length** — `channel.v1` derives `targetSeconds` (15–180) per
    niche (quick informational ~20–40s, atmospheric/narrative ~75–120s), applied
    automatically (no Step-2 control — the suggested length is used; a custom script of
    any length is handled as-is). Stored on the channel (`channels.target_seconds`) and
    **honored end-to-end**: the generated sample mirrors it, `generate-story` uses it
    instead of a hardcoded 75s, and scene breakdown scales (`~1 scene / 12s`, clamped
    3–16) so short and long reels both render sensibly. Shown on the detail page. The
    sample script has no tight character limit (a generous 20k server ceiling only).
  - **Target platform** (Step 1) — TikTok / YouTube Shorts / Facebook Reels / All,
    stored on the channel (`channels.target_platform`). A single `PLATFORM_PRESETS`
    table (in core) is the source of truth: per-platform aspect (all 9:16), **length
    cap**, sweet-spot, caption + hook hints, **caption safe-zone**, and **watermark**
    default. Today it feeds `channel.v1` (length + caption tailored to the platform) and
    **hard-caps length** on create/edit (e.g. Shorts ≤60s — verified: same niche →
    TikTok 90s, Shorts 55s, All 55s; a 150s Shorts channel is clamped to 60). Editable
    in Settings (length slider max tracks the platform) and shown on the detail page.
    **Caption safe-zone is deterministic now**: the platform's `safeZoneBottomPct` offsets
    the caption band so it clears each platform's UI — applied in the live `CaptionPreview`
    (verified: Reels sits higher than Shorts) and threaded through the Remotion renderer
    (`SubtitleOverlay`) for the video phase. **Aspect ratio is real now too**: the platform
    aspect (all 9:16) drives image generation — `generateImage` was hardcoded to 3:4
    (`portrait_4_3`), now maps the preset aspect → fal `image_size` (verified: previews
    generate 576×1024 = 9:16), the real reel's `generate-images` passes the channel's
    platform aspect, and **Step-4 style tiles render 9:16** so they match the actual frame.
    **Hook style is applied at Step 2 now**: the platform's `hookHint` shapes the sample/
    reference script's opening (verified — same niche yields a pattern-interrupt hook for
    TikTok, a curiosity-promise for Shorts, a relatable opener for Reels); it'll feed real
    story-gen from the same source when that's built. The Step-1 picker uses the platforms'
    **actual brand logos** (shared `PlatformPicker`, used by wizard + Settings). Still
    **captured-but-not-applied**: **watermark** (render) — lights up in the video phase.
    (Caption *preset* remains a soft AI hint, niche-dominated — not a hard platform rule.)
  - **Per-channel caption style** — competitive, *animated* burned-in captions (the kind
    that win on TikTok/Reels/Shorts), not plain subtitles. **16 expressive presets**, each
    with a signature motion: **pop** (word-by-word scale), **hype** (Hormozi highlight-box),
    **karaoke** (progressive fill), **neon** (glow), **whisper** (eerie typewriter+cursor),
    **impact** (oversized punch-in + tilt), **elegant** (wide-tracked italic serif fade),
    **clean** (refined white), **comic** (tilted playful pop), **terminal** (green monospace
    on a panel), **cinematic** (Netflix subtitle bar), **breaking** (solid news lower-third),
    **marker** (highlighter swipe), **script** (handwritten cursive), **retro** (chrome/
    synthwave gradient + glow), **glitch** (RGB-split datamosh) — plus `backplate`
    (translucent/solid panel) and `gradient` (clipped text fill) style fields.
    **Hybrid derivation:** `channel.v1` picks the preset **per
    niche energy** (horror→whisper, money→hype, gaming→neon, luxury→elegant, …) *and* nudges
    a few **safe, clamped knobs** on top — accent **highlight color**, **base text color**
    (near-white unless the niche calls for a tint), **placement** (bottom/center/top), and a
    bounded **font scale** (0.85–1.25). The preset's signature motion/font/stroke stay fixed
    so the look can't break; `resolveCaptionStyle()` merges the knobs and the zod schema
    clamps anything out of range. (Switching presets in the wizard keeps the channel's brand
    palette but resets motion/size/placement to that preset's identity.)
    The `CaptionStyle` spec (animation, font/weight/size, color/activeColor/highlight,
    stroke, shadow|glow, letter-spacing, uppercase/italic, rotation, position) is stored on
    the channel (`channels.caption_style`) and read by the **Remotion** `SubtitleOverlay`,
    which animates word-by-word from the per-word timings preserved through `compute-timings`.
    A shared **`CaptionPreview`** client component plays the style **live, looping, on a dark
    "video-frame" stage** — so the wizard Step-4 picker and the channel detail page show
    captions exactly as they'll appear in the reel. (Full per-field editing is deferred to
    Settings; the renderer path is typecheck-verified — the reel pipeline hasn't run E2E yet.)
  - Optional channel **description** (shown on card/header), **default gradient
    avatar** monogram when no image, custom animated **Dropdown** (language +
    voice gender), smooth animations + responsive widths.
  - **Visual style (step 4)** — `style-options.v1` proposes a content-safe scene + **4–5
    recognizable styles** from a known palette, **curated on merit** from niche + **mood**
    (no realism bias — horror surfaces creepy comic / manga / woodcut; a niche that suits
    photoreal can still get it), each tuned with a "why it fits". Previews **auto-render in
    parallel on flux/dev** (~8¢, ≈40¢/channel) and are **prefetched in the background when
    leaving Step 2**, so Step 4 is ready on arrival. Shown as a **compact grid** of tiles
    (image + label; selected ringed, first badged Recommended; the selected style's "why it
    fits" below) with a blur→sharp develop-in reveal, shimmer while rendering, and a graceful
    "couldn't preview" placeholder. No re-roll buttons (cost).
  - **Upload your own reference (step 4)** — the operator can upload **1–3 reference images**;
    a **vision pass** (`style-ref.v1`, `/api/channel/style-ref`) distills their shared *style*
    into the channel's DNA (medium/lighting/palette/texture/mood — not the subjects), added as a
    pickable **"Uploaded"** tile and auto-selected. The first image is kept as `styleImageKey`,
    the derived DNA as `stylePreset` — so it flows through the text-to-image pipeline with no
    downstream change. (True image-conditioned generation is a deferred upgrade.)
  - The chosen style's DNA is saved as `stylePreset` and its image as `styleImageKey`. A slim recap (avatar/name/language) sits atop steps 2–4; tone /
    world / positioning are still generated + stored, hidden at creation (editable
    later in Settings).
  - **Draft persistence**: the whole wizard (all 4 steps, incl. generated profile,
    sample script, voices, avatar, style proposals + selection + resolved previews)
    is saved to `localStorage` and rehydrated on reload; cleared on successful
    create. Survives reloads and leaving the page.
  - **Real voice picker (Step 3)** — **radio** choice: *one voice* vs *different voice per
    story*; the voice list stays hidden until "one voice" is picked. One-voice shows
    Claude-**recommended** voices for the niche/language/tone (`/api/voices/recommend`),
    read-only metadata + instant preview + "show all" fallback, top auto-selected. Per-story
    stores no voice (chosen per reel at render). Default channel language is **English**.
    **Language → ElevenLabs voices:** English uses premade voices;
    other languages pull from the shared library by code (Tagalog/Taglish →
    `fil`, etc.) so e.g. a Taglish channel sees real Filipino voices.
    Recommendation pool is filtered: **narration** use-case, **popularity** sort,
    and a **genre keyword** (`voiceSearchKeyword` from derivation, e.g. "horror")
    via the library `search`. A **gender** chip filters the shown list.
    (Listing + previews are free; only render-time TTS costs characters.)
- **Design conventions** captured in `DESIGN.md` (root): always animate, always
  responsive, primitives-first, custom controls, outlined icons, light theme.
- **Channel detail page (`/channel/[id]`)** — read-only overview: header,
  stat row, niche, tone bars, visual style (the chosen **style image** when one
  was previewed, above the DNA text), story world, narrator voices (real, with
  voice-mode badge), and a reels section (empty state). Portfolio cards open it.

## Next steps

1. ✅ **Channel settings / edit** (done) — `/channel/[id]/settings` makes the
   derived bible editable post-creation: identity (name/description/tagline),
   niche, tone (sliders), reel length, **captions** (live preview + all 16
   presets), visual-style DNA, and the full world bible (region/era/locations/
   objects/vocabulary). `PATCH /api/channel/[id]` validates with the same zod
   schemas as creation. Settings button on the detail page now links here.
   *Still deferred:* editing voices, avatar, language, and the not-yet-real
   config (LUT, audio packs, posting rules).
   Also fixed alongside: the **voice-id shape bug** (storyboard read a
   non-existent `id`/`style`; now uses `providerId`/`description`, so a chosen
   voice actually reaches render) + a render-time guard so an empty voice can't
   silently crash TTS; and **`tagline` + `voiceSearchKeyword` are now persisted**
   on the channel (were derived then discarded).

2. **Per-channel workspace** — fold the old `/review` and `/storyboard/[id]`
   views into the channel detail page (reels, review queue, analytics tabs).
   They're currently unreachable from nav. *Partially addressed 2026-08-06
   (`2c295e1`): the storyboard got its cutting-room treatment — one dark dock,
   one inspector. The nav folding itself is still open.*

3. **Per-story voice selection** — channel voice picking is done (real voices,
   single or per-story shortlist). When the reel flow is built, a `per_story`
   channel should let the operator pick one voice from its shortlist per reel;
   a `single` channel just inherits its one voice.

4. **Derivation prompt tuning** — iterate on `channel.v1` if the generated
   tone/style/world doesn't match what we imagine for a given niche.

5. ✅ **Align reel rendering to the chosen style** (superseded) — the flux/dev-vs-schnell framing is
   obsolete. Scene images now render on **nano-banana** (`fal-ai/gemini-25-flash-image`) by default,
   with **per-genre engine routing** chosen after a live owner A/B (`packages/providers/src/fal/config.ts`).
   ⚠️ **Live consequence, still open:** wizard Step-4 previews and real scenes no longer run the same
   engine, so the preview/scene no-drift invariant is **already broken** — an operator picks a style
   from a tile rendered by one model and gets reels from another. Worth confirming during the
   publish-bar audit: if "it doesn't look like what I picked" is a named disqualifier, this is why.
   Related: `gpt-image-1` (still `SCENE_IMAGE_MODEL` in the OpenAI config, used for the hybrid
   scare-beat route) **is deprecated 2026-10-23** — successor `gpt-image-2`, ~35% cheaper.

6. **De-bias `channel.v1` style derivation (optional)** — Step-4 curation no longer uses the derived
   `stylePreset` (it picks mediums on merit from niche + mood). But `channel.v1` still derives a
   film/photographic `stylePreset` ("film stock/medium … analog photography aesthetic"), now used only
   as the pre-Step-4 default + fallback if style-options fails. If that fallback ever matters, broaden
   `channel.v1` so the default look isn't reflexively cinematic either.

7. **Length follow-ups** — ✅ **the budget cap half is DONE** (PR #20): `budgetCapForSeconds` scales
   the cap with runtime ($4 + 9¢/s, $30 ceiling) and a reel that would blow it now **degrades to
   stills** instead of hard-throwing mid-render. The 2026-07-24 near-miss (a ~100s reel at $7.60,
   $0.40 under a flat $8 cap, one scene from being stranded) is what motivated it.
   *Still open — two horror-flavored bits to de-bias when generalizing the writing pipeline:*
   `scenes.v1` guards ("no faces of fear", "children in threatening contexts") and the hardcoded
   `audienceDescriptor: 'young Filipino adult'` in `generate-story`.

### Pipeline findings — 2026-07-24 "News Today PH" production run (one-off, $7.60, findings tracker)

A real factual Taglish news reel driven end-to-end surfaced these, ranked. Tackling one-by-one with
the owner (design first, then implementation). Full evidence in the session summary + hypothesis doc.

1. **Voiceover perspective missing** (owner-endorsed) — the pipeline knows only diegetic narrators
   (`first_person`/`third_person`), so a voiceover explainer got an invented on-screen host, POV
   shots, and a photoreal fake press photo of real officials; auto-breakdown unusable for the whole
   news/documentary/explainer family (incl. committed EBN documentary). Candidate architecture:
   [hypotheses/voiceover-perspective.md](hypotheses/voiceover-perspective.md) — one enum value +
   analyzer/scenes/assembly conditionals + channel presentation hint.
   **Status 2026-08-07: ✅ SHIPPED, on main (`c8e31bd`, PR #19).** Both director reviews
   ACCEPT-WITH-CHANGES (folded); Phase-0 probe RAN (39¢): axis mechanism VALIDATED; teaching bar
   FAILED → judge-and-force **depiction gate**. Phase 1 merged: axis (enum + analyzer participant
   test + scenes VOICEOVER_RULE + scene-qa) · depiction gate (scene-depiction-critic/doctor.v1,
   informational boards, `SCENE_DEPICTION_GATE=0` kill switch, scored audit) · presentation hint
   (channels.presentation, migration 0045, channel.v1 v1.5, wizard + Settings + analyzer).
   Remaining: graduate `hypotheses/voiceover-perspective.md` → `/specs`.
2. **Depictive-ethics floor for real parties** (separable, ships first) — nothing prevents rendering
   identifiable real living people / named orgs' officials/events as photoreal event imagery in
   standard-mode factual content (EBN's illustrative floor doesn't reach it). **✅ RATIFIED +
   SHIPPED (2026-07-25, on main).** Spec at
   [specs/depictive-ethics-floor.md](specs/depictive-ethics-floor.md) (visual-director): floor
   wording + 5-point placement inventory + boundaries + edge cases, ratified by the founder as
   floors-are-law (hard safety constraint, no A/B). The deterministic `scene-qa` check ships
   **warning-first** — remaining work is promoting it to a blocking error once its precision is
   proven on real boards.
3. **Standalone fact gate** — **✅ SHIPPED (PR #21, recovered to main in `b523149`).** The EBN
   Extractor + Fact-Fidelity Checker were only reachable via `storyMode='ebn'`, which also forced
   illustrative visuals + burned disclosure + a writer that ignores language/persona/length.
   "Check my script against sources" is now an opt-in step any channel can use, advisory-only
   (a punch-list, never a block). Production-proven on Pax Silica.
   ⚠️ Recovery note: a `(#NN)` squash commit is **not** proof of reaching main — verify with
   `git merge-base --is-ancestor`. This one was stranded on a branch for days.
4. **Budget cap** — folded into item 7 above (fresh evidence there).
5. **Render visual-fingerprint gap** — NON-ISSUE on inspection: `render-step.ts` already hashes
   subtitle text+timings into the visual fingerprint alongside `captionStyle`. Closed, no work.
6. **`captionStyle` has no "none"** — DONE (2026-07-29). `CaptionStyle.enabled` (optional, absent =
   on, so existing channels are unchanged) skips the overlay; toggle in Settings and the wizard; no
   migration (lives in the `captionStyle` jsonb). New `youtube_long` channels default it OFF and ship
   a native YouTube CC track instead (`subtitlesToSrt` → `captions.insert`) — burned captions answer
   mute-autoplay in a feed, which isn't how long-form is watched. Exactly one delivery per reel, never
   both. UNVERIFIED LIVE: needs a real long-form publish, and `captions.insert` needs the
   `youtube.force-ssl` scope the current refresh token may not carry (failure is best-effort/warn-only).
7. **Duration estimator undershoots** — 2.5 wps estimate vs ~2.2 wps real (voice delivery + genre
   pauses): a ~220-word script rendered 100.7s vs ~86s predicted. Calibrate `estimateNarrationSec`
   with the voice/pause profile; affects `targetSeconds` honoring end-to-end.
8. ~~**Style-ref distillation drops signature lighting**~~ — **CLOSED, no code (2026-07-25).** The
   observation was real (`style-ref.v1` strips time-of-day, so a dusk signature had to be hand-appended)
   but the proposed `preserveSignatureLighting` flag was **built and then reverted** as unearned: (a) the
   distillation already keeps the brand's real carrier — palette ("deep blue + warm orange", "dramatic
   skies") survived fine; only the literal time-of-day word was lost; (b) `stylePreset` is already
   owner-editable prose in Settings — a channel whose brand IS always-dusk types that in, which is exactly
   what the production run did, so a prompt-forking config flag duplicated an existing text field; (c) the
   exclusion is load-bearing — time-of-day is kept out of the DNA so it composes with the per-scene
   lighting directive, and a pinned "always dusk" would fight every night-set story. Fix if it recurs:
   better `stylePreset` guidance, not a knob.

### Long-form (`youtube_long`) readiness — 2026-07-29 audit, before the first live channel

Long-form shipped 2026-07-15 and has **never run live**. The pipeline is correctly parameterized where
the spec promised (frame/aspect threading, render-QA duration gate, chaptered breakdown, story token
budget, 16:9 thumbnail). The gaps cluster in the last mile and in budgets calibrated for 75s reels.

FIXED in this pass: TTS request timeout now scales with narration length (a ~9k-char long-form
narration sits *under* the chunk threshold, so it went out as ONE request on a 120s budget — the most
likely first-run hard failure); the animation budget reserve now scales with runtime via the real
`musicCostCents` (a flat 50¢ reserve was smaller than the ~82¢ 5-minute bed it was protecting);
`post-meta.v1.1` takes runtime as context instead of saying "short videos" and capping caption
guidance at "a few short lines".

Open, ranked:

1. **[BLOCKER for auto-publish] YouTube upload holds the whole file in memory and can't resume** —
   `uploadToYouTube` takes a `Buffer`, then does ONE `PUT` of a full second copy; the resumable
   session is used only to get the URL (no `Content-Range`, no chunking, no retry). A 600s 1080p
   render is ~0.5–1.5 GB, so peak RSS is 2–3× that and a drop at 90% restarts from zero — including
   the re-download. Never stressed: a 75s reel is ~50–100 MB. Fix = stream in ~8MB chunks with
   `Content-Range` + resume-on-drop. Same whole-file-in-memory pattern in `render-step` uploads and
   `export-post-package`. Also: `publish-youtube/route.ts` has no `maxDuration` export — a serverless
   deploy would cut the upload off regardless. **Manual upload is the safe path until this lands.**
2. **Chapters are a dead feature** — `planChapters` output is used only as an LLM batching device in
   `breakdown-scenes` and then discarded; `StoryChapter` never reaches the DB, `post-meta`, or the
   description, so YouTube gets no timestamps. For a 10-minute channel chapters are table stakes.
   Needs a real design: `StoryChapter` has offsets but **no titles**, so this is title generation +
   mapping chapter offsets to actual `timings` (not `estSec`) + a description block — not a quick fix.
3. **Step timeouts** — RAISED 2026-07-29 to cover the new 20-min ceiling (`PIPELINE_STEP_TIMEOUT_MS`
   10→20 min, `RENDER_STEP_TIMEOUT_MS` 25→45 min, `STUCK_REEL_THRESHOLD_MS` 40→60 min). The cost is
   that a genuinely HUNG short-form step now parks its slot longer. **Proper fix, still open:** scale
   each ceiling from the reel's own `targetSeconds` instead of one global worst case. Note render has
   no intra-attempt resume — a timeout there restarts from frame 0 (the heavy per-scene steps do
   resume via ledger rows, but only within `attempts: 3`).
4. **Budget cap stops scaling before long-form starts** — `budgetCapForSeconds` saturates at
   `BUDGET_CAP_MAX_CENTS` from 289s up, so a 300s and a 1200s channel share a $30 cap. Real spend
   ~$10.4–12.8 at 600s and ~$15–17 at 1200s (i2v caps at 8 clips and music at a 5-min bed, so the
   marginal minute past ~10 min is only ~$0.45 — mostly images + TTS). Headroom is fine; the cap is
   just no longer doing length-proportional work. It would start binding around ~30 min.
5. **No length control during onboarding** — the wizard has no duration field at all (`targetSeconds`
   seeds at 75 and is only overwritten by the LLM derive). A creator picking long-form gets whatever
   the model derived; the only real control is the Settings slider, post-creation. This matters more
   now that the ceiling is 20 min: the derive decides between a 5-min and a 20-min channel unaided.

**Duration ceiling raised 600s → 1200s (2026-07-29).** YouTube imposes no limit; the cap tracks what
the pipeline can finish. The original 600s rationale (keep narration inside ElevenLabs' single-request
comfort zone) is **obsolete** — long narrations chunk seam-safely and the TTS timeout now scales.
Going past 20 min needs three things that do NOT move with the number: the music bed maxes at 5 min
and loops (a 20-min reel already hears it 4×, never listen-tested), `motionBudgetForSeconds` caps at
8 i2v clips (~1 clip / 2.5 min at 20 min — reads as a slideshow), and the $30 budget cap starts
binding near 30 min.
6. **hookHint holes** — the main writer path was fixed in `23dc6e7` (the `decision-log.md:412` entry
   calling it broken is **stale**), but the `story.v1` fallback drops `platformHookHint` entirely, and
   the EBN writer never reads it — so an EBN long-form channel writes short-form-shaped prose. The
   genre probe passes `undefined` for long-form runs, so it can't catch either.
7. **Sound + editor deferrals** (all known, all in `specs/long-form.md`): one 5-minute bed looped
   twice for a 600s video (never listen-tested); `sfx.max(18)` is a whole-video cap, so density drops
   from ~1 cue/4s to ~1 cue/33s; the storyboard editor is 9:16-shaped everywhere except the main stage.
8. **Metrics window is short-form-shaped** — `metrics-poll.ts` stops at 30 days by explicit
   Shorts reasoning; long-form accrues over months, so recorded performance (which feeds few-shot
   selection) will systematically under-count long-form.

### Deferred config (currently schema defaults at creation)

- `lutConfig` / `audioPacks` — need real asset files (LUTs, ambient beds, music
  pack); configure later in channel settings.
- `postingRules` — creation still seeds the defaults (fb+yt, 21:00 PHT, no quality filter), but the
  parts that matter are now editable in channel settings: the auto-produce cadence and the **posting
  schedule** (`postingRules.publish` — post as soon as a reel is ready, or hold it for the channel's
  next free day/time slot). On an auto-publishing YouTube channel the slot is handed to YouTube as
  `publishAt`, so the schedule fires even if our worker is down; `publish_promote` (every 15 min) is
  what moves our own records from scheduled to live. Still deferred: per-platform schedules (only
  YouTube publishes by itself — fb/ig/tiktok get the next slot printed on the post package) and
  per-channel timezones (slots are stored as UTC hours, shown in the operator's local time).

### Known gaps / cleanup

- **EBN + auto-produce:** the scheduler creates reels with no dossier, which
  `generate_story` fail-closes on — an EBN channel with autoProduce enabled
  would manufacture stuck reels. Scheduler should skip EBN channels until a
  dossier queue exists (the UI already hides hands-off on EBN; this is the
  worker-side guard). See decision-log 2026-08-03-001.
- **R2 large uploads are one PutObject:** `uploadBuffer` sends whole files in a
  single request, and the 60s `requestTimeout` only *warns* without
  `throwOnRequestTimeout` (see the comment in
  `packages/providers/src/shared/storage.ts`). A 355 MB long-form render
  succeeded 2026-08-03, and `withJobTimeout` bounds a genuinely stuck upload —
  so multipart (`@aws-sdk/lib-storage`, per-part timeout + resume) is the fix
  **when an upload actually fails**, not before.
- **Provider resilience (all external APIs):** each call has a per-request
  timeout + auto-retry on transient failures (connection/429/5xx):
  Anthropic (60s, 1 retry), ElevenLabs (30s metadata / 120s TTS / 60s SFX,
  1 retry), R2/S3 (maxAttempts 3 + 5s/60s timeouts), fal asset download (60s,
  1 retry). **fal image/video generation is intentionally NOT auto-retried** —
  resubmitting a paid job risks double-charging; it keeps its existing
  rate-limit/content-filter handling. Wizard shows a "couldn't reach the AI —
  try again" message on final failure.
- **Shared-library voices at render:** non-English channels select community
  (shared) voices. ElevenLabs TTS may require *adding* a shared voice to the
  account before synthesis — wire that into the render step (the stored
  `providerId` is the shared `voice_id`).
- Multilingual is now unblocked end-to-end: per-reel story types (`story.ts`,
  `story.v1`, worker `dispatcher`/`generate-story`) accept any supported
  language; Taglish keeps its code-switch special-case (case-insensitive).
  Still TODO when reels run for real: normalize channel language casing
  ("Tagalog" → "tagalog") at the reel boundary, and verify ElevenLabs voice
  coverage per language.
- Avatar images can be orphaned in R2 if creation is abandoned (no cleanup job).
- No channel-name uniqueness check (fine for a single operator).

### Navigation / legacy cleanup

- Sidebar nav is portfolio-only now; per-channel nav (reels/review/analytics)
  moves into the channel detail page.
- ~~End-to-end reel production has never run start to finish~~ — **DONE**: first reel
  rendered 2026-06-19; channel-creation polish + flux/dev images + voice delivery + AI
  music shipped 2026-06-20.

### Deliberately uncommitted in the working tree (2026-08-07)

Not abandoned, not shipped — kept where it is on purpose, per decision-log 2026-08-06-002.

- **The bounded-edit chassis** (`packages/core/src/editing/bounded-edit.ts`, `apps/worker/src/pipeline/steps/ending-repair.ts`,
  the three prompts, `probe-critic-calibration.ts`). The MECHANISM passed everything asked of it —
  prefix held 28/28, zero stories damaged, all four guards load-bearing. The TASTE driving it failed
  a blind read. `STORY_ENDING_REPAIR` stays off. Reusable for any future edit region; do not rebuild it.
- ⚠️ **GOTCHA carried from that lap:** every `llmCall` hangs if Redis is down. Costs an afternoon
  if you don't know it.

## Audit backlog (2026-06-20) — fix AFTER channel creation
Pre-production audit (3 passes: channel creation, quality, robustness). Prioritized; pull as
evidence demands. **✅ Done 2026-06-20:** silent-failure surfacing + retry; `render_qa` hardening
(black-frame + silent-audio + unmeasured-loudness now fail); varied Ken Burns motion;
budget-exceeded fails fast (no wasted retries). Remaining items below are deliberately deferred
(scale / edge / big-bet / marginal-for-horror) — pull when real channels demand them.

### Robustness
- **[P1 — fixing now] Silent failure → no signal.** On permanent step failure the `pipeline_steps`
  row is marked failed but `reel.status` is NOT updated and nothing shows in the UI — the reel
  silently stalls (`harness.ts`, `dispatcher.ts`). Fix: mark `reel.status='failed'` on permanent
  BullMQ failure + a storyboard "failed" banner (step + error) + one-click retry
  (`/api/pipeline/retry-reel`).
- **[P2] 429 = hard fail** after 3 quick retries (5s exponential). No dedicated long backoff for
  rate limits (`ProviderRateLimitError` → BullMQ). Fine at low volume; revisit before batch.
- **[P2] Per-provider rate-limit queues defined but unused** — all steps run on the single PIPELINE
  queue (concurrency 2, 50/min). OK for low volume; split to FAL_IMAGE/TTS queues when scaling.
- **[✅ DONE] Budget-exceeded fails fast** — thrown as BullMQ `UnrecoverableError` (no wasted retries); reel marked failed + surfaced.
- **[P3] Wizard style-image previews fire ~4–5 in parallel un-throttled** — debounce/limit before heavy use.

### Quality ceiling (pull as niches demand)
- **[✅ DONE] render_qa hardened**: now also fails on black frames (`blackdetect`), near-silent audio
  (`volumedetect`), and unmeasured loudness (`packages/render/src/qa/render-qa.ts`).
- **[✅ DONE] Scene image beat-adherence** — `scenes.v1` now front-loads the load-bearing beat (the
  subject/action that carries the shot) before framing/light, so flux renders the actual moment (e.g. the
  scare) instead of generic atmosphere. Plus style-neutral quality-floor negatives (`imageprompt.ts`) and
  a content-filter fallback that keeps the channel style (`generate-images.ts`).
- **[✅ DONE] Beat-aware scene count** — `breakdown_scenes` cuts on dramatic beats within a length-scaled
  range (e.g. 120s → 7–14) instead of a fixed `len/12`; the `peakMoment` (`story.twistAnchor`) gets its
  own dedicated shot. Verbatim-tiling + music-timing invariants unchanged; empty-peak degrades gracefully.
- **[✅ DONE] Living grade overlay** — `GradeOverlay` now animates: grain re-grains every frame (film
  shimmer, not a static texture), an unstable-light flicker, and a slow vignette breath. Frame-deterministic;
  scaled by the channel's grain/vignette. Camera motion (Ken Burns) already varied per scene (`SceneClip.tsx`).
- **[✅ DONE] Per-scene mood-driven atmosphere** — `ReelComposition` maps each scene's mood + tier →
  intensity, so dread/climax beats grade harder (more grain/flicker/vignette) than quiet ones; a flat
  channel stays flat. `mood` is plumbed scene → render-step → Remotion. Scene TRANSITIONS (hard cuts) still TODO.
- **[✅ DONE — text-based] Character consistency within a reel** — `scenes.v1` fixes a recurring figure's
  canonical look (build/hair/wardrobe/one detail) on first appearance and reuses it verbatim in later scenes,
  so it reads as the same individual (verified: identical description across scenes + consistent generated
  images). Faces stay obscured (imply rule). REMAINING for face-heavy / cross-reel niches: identity
  conditioning (world-bible characters + an identity model) — a SaaS-tier build; wardrobe can still drop under flux.
- **[✅ DONE — spike + fix] i2v video path** — the configured `kling-video/v1.6/image-to-video` was a DEAD
  endpoint (404; fal now requires the `/standard/` tier segment), so the video path was silently broken.
  Fixed in `config.ts`. Verified on a real photoreal scene: both kling-standard and the wan fallback hold the
  style and give a clean camera push-in (no warping) — the "wrong for stylized" concern doesn't apply to THIS
  photoreal channel. Both output 720p → upscaled to 1080×1920 at render; use kling `/pro/` for native 1080p
  (higher cost). Invoked only for `tier:'video'` hero beats.
- **[✅ DONE] Unmeasured loudness now FAILS** render_qa (was a warning).
- **[✅ DONE] AI music is now PER-REEL, not per-channel.** `generate_music` composes one fresh original
  bed for each reel (seeded by the channel's `audioMood`, tilted by the story's mood, sized to the reel),
  replacing the fixed channel-bed pool — so no two reels share a backing track, and each is vetted in
  context at spot_check. Cost ~10¢/reel (vs ~30¢ once); ~8s added per render. The pooled approach can
  return later as an "economy" toggle (cheaper, consistent) for cost-sensitive SaaS tiers.
- **[future] Scored music** — arc-synced to `peakMoment` (rises/drops timed to the story beats), built
  on the per-reel `generate_music` foundation. The premium tier above today's flat per-reel bed.

#### Sound (owned by the Sound Director coworker; A/B/C taxonomy ratified 2026-07-24)
The founder's reframe: the reels-sound-thin fix is audio *engineering*; the competitive advantage is *sound
direction* — the creative reasoning before a single sound is generated. **An AI Sound Director, not a better
mixer.** Three phases, each gating its taste-touching parts on a blind ear test before they ship:

- **[✅ SHIPPED — `7497357`, merged `07fb753`] Phase A — Audio Engineering.** Fixes the founder's "I can
  barely hear it… no continuous background music and sound effects." **Reference gain-staging** (voice/music/
  ambient normalized to a reference so the bed is a true, audible ratio under the voice — it was ~22–27 dB
  under, below the WCAG floor); a **guaranteed continuous bed** (kill the two voice-over-silence paths; a
  room-tone ambient fallback instead of digital silence); a **QA bed-presence invariant** (an intended bed
  must be measurably audible — intensity-aware so a deliberately calm register isn't false-failed); duck-floor
  + SFX-bus re-level; plus the principle-7 cost-accounting fixes (music cost scales with length; SFX/TTS/music
  on one plan basis) and the annotate `maxTokens` reliability fix. Near-zero marginal cost (re-leveling, not
  more generation); validated by re-balancing the persisted stems + a blind before/after ear test.
- **[✅ SHIPPED — `ce53858` (register range + energy, the "leans calm" fix); the blind cross-register ear
  A/B that GATES it has not been recorded — treat as unvalidated] Phase B — Sound Direction**
  (candidate architecture: [hypotheses/audio-direction.md](hypotheses/audio-direction.md)).
  An **Audio Direction** — the canonical creative intent for a reel's sound (per-scene emotion, listener
  perspective, environment, intentional silence, peaks/releases, motifs, cross-scene continuity) — that music,
  ambience, foley, SFX, and any *future* provider all derive from. **Never "better prompts"**: the Direction is
  a provider-independent artifact, not prompt tuning. Built by deepening `annotate_audio_script` (Direct →
  Design, no new stage) with a mandatory **direction-fidelity check** (downstream stages satisfice plans — the
  judge-and-force lesson). The register work folds in here: de-bias `sound-designer.v1` off its 18-revision
  horror overfit (the first EBN documentary reel came out tense and wrong — register is set by genre + mode +
  channel DNA, never a house default; a calm register is often correct), de-monoculture the all-dark mood
  vocabulary, strip "tension/taut" from the universal music prompt, register-gate the forced-movement remap.
  Judgment/de-biasing, NOT more mandates (prescription *caused* the overfit — Anti-Prescription Guard). Gate:
  cross-register blind ear A/B. Diagnosed + A/B-designed by the Sound Director via Evidence-Before-Taste,
  shipped through the Product Partner + Technical Advisor.
- **[PARKED — spiked 2026-07-24, `353837f`: not earned until channels have a back catalog] Phase C —
  Channel Audio Identity, as the Audio Bible.** The channel-level twin of the Audio
  Direction (signature motifs, ambience palette, instrumentation, recurring transitions, pacing, loudness
  philosophy, silence habits, forbidden sounds, callbacks) that every reel's Direction inherits from —
  completing the Bible family (Story = fiction, Evidence = fact, Audio = sonic identity). North star: **a viewer
  recognizes the channel without seeing its logo.** Mechanism levers unused today: ElevenLabs `seed`,
  `music_v2`, `composition_plan`; a seeded signature bed reused across a channel (identity + cost win, cost
  attributed once). The Sound Director's spot-audit lever once channels have a back catalog.
- **[note] EBN i2v cost/quality lever** — for Evidence-Based (illustrative) reels, the i2v hero-beat clips
  are the bulk of per-reel cost, slow the render, and risk warping flat illustration (i2v is trained on
  photoreal motion). Consider allocating 0 video tiers for EBN (stills + Ken Burns only). Cost/render lever,
  not strictly sound — tracked here alongside the EBN media work.

#### Visual direction (owned by the Visual Director coworker, added 2026-07-24)
- **[NOW] Baseline visual spot-audit of shipped reels.** Visual craft has had no owner; the known failures
  are anecdotes scattered across the system's history — the entity drift that motivated the Story Bible, the
  breakdown drift that motivated storyboard grounding (`continuity.journey`), the fingerprint audit's
  cinematic-vagueness finding. First charge: audit a sample of shipped reels for continuity breaks
  (character / environment / object), style drift, and visual monoculture, and turn the anecdotes into a
  measured pattern catalog via the Visual Director's Evidence-Before-Taste workflow. Any fix ships as an
  experiment through the Product Partner + Technical Advisor — judgment-shaped, never more prompt mandates.
- **[future] Channel Visual DNA** — steward a channel's longitudinal visual identity (recognizable but not
  repetitive — rendering style, palette, camera language, motifs) once channels have a back catalog; the
  Visual Director's spot-audit lever, the twin of Channel Audio DNA.
- **[✅ DONE] Guided story creation + full-pipeline transparency.** Review-mode reels now land on a
  per-reel **Story Studio** (`/reel/[id]/story`): ask BYO-or-generate; a characterful, channel-themed
  loader (crimson for horror) while the story is written; review it; **regenerate-with-reason** (the
  rejection reason+note is injected into the prompt + an attempt # busts the `generate_story` inputHash, so
  even the same reason yields a new story). New routes: `provide-story`, `regenerate-story`, `status`
  (poll). A `usePipelineStatus` hook + `pipeline-phases.ts` (14→5 phases) also drive a live build/render
  stepper + "scenes develop in" on the storyboard. No schema change (reuses `rejections`/`pipeline_steps`).

### Channel creation
- **[P2] Derived genome goes stale on edit**: changing niche in Settings doesn't re-derive tone/style/
  voice-keyword/audioMood. Add a "Regenerate profile" action.
- **[P2] Hardcoded, should be per-niche**: ambient SFX pack (`province_night`), LUT grade, posting rules.
- **[P3] derive timeout can hang Step 1** (manual retry only) — add a client timeout + retry UX.
- **[P3] Validate `musicMode='ai'` has an `audioMood`** at create (else per-reel beds fall back to a
  generic niche/tone prompt instead of the channel's sonic DNA).
- **[P3] Some derived fields locked/hidden post-creation**: caption colors/position, audioMood.
