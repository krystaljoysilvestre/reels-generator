# Phase 0 forced-recovery lap

**Status:** Complete — hosted failure, durable reuse and unchanged ledger observed
**Date:** 2026-09-10
**Gate items:** 3 (a forced failure is visible in-product and one-click Retry reuses durable work) and
4 (retry repeats no paid provider call and adds no cost twice)

## Why this lap exists

Reel #4 completed only because the builder inspected the queue and salvaged a durable artifact by hand. The
gate's question is whether the *creator* can do that recovery. Until a failure has been induced and recovered
through the product, the answer is untested.

The lap must not be induced by hand either. Killing the worker, revoking a provider key or editing rows is the
same invisible-builder move the gate exists to remove, and none of it is reproducible. So the failure is
ordinary configuration: `FORCE_STEP_FAILURE`.

## What is already proven automatically

`apps/worker/src/pipeline/forced-recovery.integration.test.ts` proves against real Postgres that a forced
failure is recorded as a `failed` step row with its error, that the storyboard/retry predicate sees it, that
re-entering a completed paid step returns the cached output with `costCents: 0` and never invokes the provider,
and that the reel's ledger reads the same before the failure and after the recovery.
`fault-injection.test.ts` proves the switch is inert when unset.

The live lap therefore confirms one thing the tests cannot: that a real creator, in the deployed product, sees
the failure and recovers from it without a terminal.

## The mechanism

`FORCE_STEP_FAILURE` names boundaries to fail at, comma-separated. Unset — the shipped state — is a no-op that
does not even query. One boundary exists today:

| Boundary | Fails after | Reproduces |
| -------- | ----------- | ---------- |
| `render:after_visual` | the graded `visual.mp4` checkpoint has committed and `render.mp4` is in R2, before the render asset row is written | the 2026-09-01 lost-queue-lock failure, the one that needed manual salvage |

The fault fires only on a step's **first** attempt, read from that step's own durable row. One click of Retry
clears it — the operator never reaches back into the deployment mid-lap, and an armed variable cannot trap a
reel in a loop. The error is permanent (`UnrecoverableError`), so BullMQ does not quietly succeed on its own
second attempt: the creator gets a failed phase to act on.

## Run it

1. **Arm before the reel exists.** Railway → `worker` service → Variables → `FORCE_STEP_FAILURE=render:after_visual`.
   The web service does not need it. Changing a variable redeploys the worker, and the deploy invariant is never
   to restart the worker mid-render — so arm it first, with nothing in flight.
2. **Produce one standard short-form reel through `app.kendrix.io`** — sign-in → channel → story → storyboard →
   production. No terminal, no SQL, no scripts. Note the reel's cost as production ends.
3. **Watch it fail at render.** Expected: the reel goes to `failed` immediately, and the storyboard shows the
   failure banner naming the Rendering phase, the `render` step, the message
   `Forced recovery-lap failure at render:after_visual (FORCE_STEP_FAILURE)`, and "Nothing's lost — everything
   finished so far is kept. Retry picks up from there."
4. **Click Retry.** Nothing else. Expected: the render step re-runs, finds its own visual checkpoint, logs
   `[render] visual unchanged — reusing cached track … re-muxing audio only`, and completes without a Remotion
   frame pass. Every upstream paid step is re-entered and skipped on its input hash.
5. **Verify the ledger.** The reel's cost after recovery must equal the cost noted in step 2 — the recovery is
   free. Cross-check `/admin/costs` for the day if the reel's own figure is ambiguous.
6. **Disarm.** Remove `FORCE_STEP_FAILURE` from the worker. Then finish the reel through review and export.

Left armed, the switch is not dangerous but it is not free either: every *new* reel's first render fails once and
needs one Retry. It costs nothing (render is a $0 step and the frame pass is reused), but it will confuse anyone
who did not arm it. Disarm as soon as the lap is recorded.

## Doing it inside the acceptance reel

Recommended: **the same reel**. The gate describes one acceptance lap that includes the forced failure, and a
separate forced reel spends another $6–11 to learn nothing new. Arming a deployment variable before the lap is
test setup, not mid-lap salvage — but it is the founder's call whether that reads as "no manual intervention".
If the recovery leaves the artifact in any doubt, disarm and run a clean acceptance reel; the forced lap still
counts for items 3 and 4.

## Record this

| Field | Value |
| ----- | ----- |
| Reel id / subject | `b2ce55d3-f388-474a-8a3f-20ececc7498a` / 1961 Goldsboro B-52 nuclear near miss |
| Cost at failure | **$7.86**, after `render:after_visual`; all paid generation was already complete |
| Cost after Retry (must match) | **$7.86** — unchanged through render completion and render QA |
| Failure visible in-product without help? | **Yes** — the storyboard changed to Failed and showed “Something went wrong while finishing” plus “Nothing’s lost — everything finished so far is kept. Retry picks up from there.” Worker evidence names `Forced recovery-lap failure at render:after_visual (FORCE_STEP_FAILURE)` |
| Retry clicks needed | **One** recovery click |
| Frame pass repeated? (expect no) | **No** — failed pass took 269.7s; recovery logged `visual unchanged — reusing cached track`, muxed/uploaded from the checkpoint, and finished `render` in 12.5s |
| Any terminal / SQL / script touched? (expect none) | No artifact, queue or database salvage. The fault variable was removed and the worker restarted before the recovery click; this was not necessary because attempt 2 stands down by contract, but it is a procedural deviation from step 4’s “Nothing else.” No SQL or one-off recovery script touched the reel |
| Wall-clock from Retry to render complete | **12.5s** for `render`; **27.1s** through final `render_qa` |

### 2026-09-10 completion

After the visual-identity blockers below were repaired, the same reel reached the configured boundary. The first
render committed its graded visual checkpoint, then failed exactly where armed. The product surfaced the failed
finishing phase and preserved Retry. Recovery reused the durable visual at 3.1s, re-muxed and uploaded at 6.1s,
completed render at 12.5s, and passed final QA at 27.1s. The reel ledger stayed at **786¢** across the failure and
recovery, proving that no paid provider step repeated. The finished 86.3-second artifact was spot-checked,
approved, and exported through the product; it was **not published**.

The worker was restarted after the test variable was removed and before Retry. This did not unlock the retry —
the durable render row was already attempt 2, for which the fault stands down even when armed — and the restart
adds useful persistence evidence. Still, future laps should follow the written order exactly: Retry first, disarm
after success, so the live log also records `armed but attempt 2 — standing down`.

### 2026-09-09 blocker (resolved for this lap)

The first live lap found a stricter failure before the fault-injection boundary. The Story Bible routed
`b-52-aircraft` to a sourced reference plate and selected a story-time appearance in which the aircraft was
broken apart. Sourcing the intact B-52 reference succeeded, but all state-adaptation candidates were rejected:
the verifier required the same stable physical structure to remain intact while the target required separated
fuselage sections and detached components. The two requirements are mutually exclusive for a destructive event.

The product behavior around the failure was sound: it stopped before scene-image spend, explained that completed
work was kept, exposed Retry, and the creator's Retry left the reel cost unchanged at $2.16. But Retry cannot heal
the stored identity/state contract; later attempts fail immediately against the same missing-reference gate. The
forced render-recovery lap was therefore unrun on 2026-09-09. The destructive-state verifier and subsequent exact
object sourcing/state-conditioning defects were repaired, deployed, and the same reel resumed to the completed
lap recorded above.

`FORCE_STEP_FAILURE` was removed immediately after the first diagnosis. Railway deployment
`56385a81-914c-41c1-8095-07f79c3bfe65` became Active and the worker returned Online with 24 service variables;
the temporary switch was later re-armed for the successful boundary run. It was removed again after the injected
failure; Railway redeploy `d82b8a96-2490-4d27-aba1-d102725b2769` restarted the verified worker image, and a direct
process check confirmed the variable absent.

## The lap fails if

the reel stalls instead of showing a failed phase; the banner cannot name the step; Retry needs more than one
click or any out-of-product help; the frame pass runs again; the ledger moves; or the reel's durable work has to
be located by inspecting R2 or the queue.
