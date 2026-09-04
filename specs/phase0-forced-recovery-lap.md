# Phase 0 forced-recovery lap

**Status:** Ready to run
**Date:** 2026-09-03
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
| Reel id / subject | |
| Cost at failure | |
| Cost after Retry (must match) | |
| Failure visible in-product without help? | |
| Retry clicks needed | |
| Frame pass repeated? (expect no) | |
| Any terminal / SQL / script touched? (expect none) | |
| Wall-clock from Retry to render complete | |

## The lap fails if

the reel stalls instead of showing a failed phase; the banner cannot name the step; Retry needs more than one
click or any out-of-product help; the frame pass runs again; the ledger moves; or the reel's durable work has to
be located by inspecting R2 or the queue.
