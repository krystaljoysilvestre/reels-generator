# Phase 0 Exit Audit — 2026-09-01

Status: Active

Owner: Founder

Decision: `dna/company/decision-log.md` 2026-09-01-001

## Verdict

Kendrix is **not ready to exit Phase 0 yet**, but the gap is bounded. The product already contains most of the
right mechanisms: active-user and ownership gates, per-user and global spend limits, a durable pipeline-step
ledger, idempotent step reuse, a creator-visible failure banner and one-click retry. What is missing is proof that
those mechanisms hold together under another user's identity and under real failure—plus a deployed worker that
can run the acceptance lap without the founder's terminal.

The active work is reliability evidence and release operability. It is not another Crossroads reel and it is not
a broad SaaS feature build.

## Evidence Matrix

| Exit invariant | Present evidence | Gap before exit | Status |
| --- | --- | --- | --- |
| Clear ownership | `channels.userId` is the ownership root; reels, stories and scenes inherit through their channel. All non-public app API routes use centralized active-user/owner/admin gates. Page loaders scope or 404. | No database-backed two-user route suite. Non-reel R2 keys (`avatars/`, `channel-music/`, `style-options/`, `style-refs/`) are currently allowed to any active user; random UUIDs are being treated as secrecy, not authorization. | Blocked |
| Auditable actions | `pipeline_steps` records step, attempts, status, output, error, timing and cost. Major destructive/admin mutations log actor and target. | There is no durable general mutation audit log; ordinary creator edits are not reconstructable after log retention. This is important, but only product-critical mutations and the acceptance failure need closing for Phase 0. | Partial |
| Cost-recorded AI work | Paid pipeline work is inside `runStep`; costs increment atomically; cache hits return zero; partial spend survives throws; on-demand paid routes have spend gates and atomic accounting. Reel #4 conservatively counted submitted-but-timed-out motion. | No integration test proves failed → Retry neither repeats a completed paid step nor adds its prior cost twice. Provider calls abandoned by `Promise.race` are not cancellable, so a timeout can still complete after the worker has moved on. | Blocked |
| Credits and limits | Reel cap, user monthly cap, daily reel quota, in-flight cap and optional global daily kill switch exist in shared helpers and worker checks. Admin spend visibility exists. | No automated route/worker suite proves the limits against real tenant rows or a mid-pipeline retry. | Blocked |
| Authorized requests | Pending/suspended sessions are re-read from the database; foreign tenant IDs are designed to return 404; only admin routes use the admin gate; request bodies are generally Zod-validated. | No regression suite proves suspended-user blocking, admin-only mutation, malformed IDs and foreign-ID 404 behavior across representative channel/story/reel routes. | Blocked |
| Observable recovery | Exhausted jobs mark the reel failed; failed phase and error surface in the storyboard; Retry re-enqueues the canonical failed step and says completed work is kept. The boot reaper surfaces orphaned running steps. | No forced provider/queue/render failure has been recovered through the product. The long-running worker has no repository deploy manifest or runbook, so “deployed product” is not yet a reproducible operating state. | Blocked |
| Workspace-ready boundary | Ownership comparisons are concentrated in access helpers and usage aggregation; deep rows do not carry scattered user IDs. | Storage ownership is the major exception. Keep the ownership seam concentrated while closing it; do not add ad-hoc ACL checks route by route. | Partial |

## Baseline on 2026-09-01

- `pnpm lint`: pass, 9 warnings and 0 errors.
- `pnpm typecheck`: pass.
- `pnpm build`: pass with network access; Next.js reports the existing Auth.js Edge-runtime and ESLint-plugin warnings.
- Initial `pnpm test:unit`: 598 tests executed before the recursive run stopped; 596 passed and two FFmpeg
  mix tests timed out at the default five seconds under workspace concurrency. The render package passed alone
  (26/26); one mix test took 5.025 seconds. This was a release-harness flake, not a verified product regression.
- After giving FFmpeg subprocess tests a 15-second ceiling, the complete workspace run passes: **643 passed,
  1 intentionally skipped, 0 failed**. The assertions are unchanged.
- CI previously ran typecheck, lint and unit tests but not a production build. The audit adds `pnpm build` to CI;
  the first remote run remains pending.
- The landing site has a Vercel deploy guide. The authenticated web app and BullMQ/FFmpeg worker have no checked-in deployment contract.

## Ten-Working-Day Sprint

### Days 1–2 — Make the release signal trustworthy

- Stabilize the FFmpeg integration-test timeout without weakening its assertions.
- Add `pnpm build` to CI.
- Keep lint, typecheck, full unit suite and build green from one checkout.
- Document the authenticated web app, worker, scheduler, Postgres, Redis and R2 deployment topology plus rollback.

### Days 3–4 — Prove tenancy, not just helpers

- Add a database-backed two-user test fixture.
- Prove representative channel, story, reel and asset reads/writes return 404 for the foreign user.
- Prove a suspended user is blocked and a tester cannot use admin mutation routes.
- Replace random-UUID authorization for private non-reel storage with an explicit ownership record or owner-scoped
  key contract, including a safe compatibility path for existing Customer Zero assets.

### Days 5–6 — Prove recovery and cost idempotency

- Add a test-only, non-production fault injection seam at one paid provider boundary and one queue/render boundary.
- Drive each failure through the product until the creator sees the failed phase.
- Click Retry; verify durable outputs are reused, completed paid steps do not execute again, and reel/step cost
  changes only for genuinely new paid work.
- Verify the reaper and exhausted-job path cannot regress an approved/published reel.

### Days 7–8 — Deploy the acceptance build

- Deploy web plus persistent pipeline/render/scheduler workers against the intended Postgres, Redis and R2.
- Run migrations, provider-connectivity smoke checks and a zero/low-cost queue smoke.
- Verify admin spend visibility, user/monthly cap, in-flight cap and global kill switch in the target environment.
- Record rollback target and triggers before the acceptance reel begins.

### Days 9–10 — Product-only acceptance lap

- Use an invited non-admin test identity.
- Complete one fresh standard short-form reel: sign-in → channel → story → storyboard → production → review → export.
- Creative review is allowed. Terminal, SQL, scripts and infrastructure salvage are disallowed.
- Exercise one recoverable failure during the lap and recover through the visible Retry action.
- Record elapsed time, operator minutes, cost before failure, cost after retry and every intervention.
- Founder decides Phase 0 → Phase 1 only after every exit item is green.

## Acceptance Record

| Check | Evidence | Result |
| --- | --- | --- |
| Invited non-admin completes the standard short-form workflow | Deployment URL + reel ID | Pending |
| No engineering intervention | Intervention ledger | Pending |
| Failure is visible and understandable | Screenshot/event record | Pending |
| One-click retry resumes durable work | Step-attempt ledger | Pending |
| No completed paid call or cost is duplicated | Before/after cost ledger | Pending |
| Foreign IDs and private assets are isolated | Automated suite | Pending |
| Suspended/admin/spend boundaries hold | Automated suite | Pending |
| Lint, typecheck, tests and build pass | CI run | Pending |
| Exported artifact passes creative/technical review | Review record | Pending |

## Explicitly Outside This Gate

Billing, teams/workspaces, long-form, arbitrary-user YouTube OAuth verification, TikTok/Facebook direct publishing,
public-launch polish, new ending architecture and Crossroads reel #5.
