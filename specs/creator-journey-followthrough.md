# Creator journey follow-through

Local work, 2026-09-24. Deployment is deferred at the founder's request while Railway billing is resolved.

## Observed failures

- The per-creator production limit counts approved reels as unfinished. Five completed downloads can therefore prevent another project unless the creator claims they were published.
- Manual publication confirmation changes the reel status before saving destination records. A failed second write leaves a published reel whose confirmation cannot be retried.
- The direct YouTube route checks the status transition before its existing-upload check, so a retry after a successful YouTube-only upload returns a conflict instead of the saved result.
- An unverified account can be told to wait for approval when open signup actually requires email confirmation and mail is unavailable. Recovery guidance disappears or promises delivery that cannot happen.

## Contract

- Per-creator concurrency counts unfinished production and review, including the retained legacy Bible-review state. Approved, scheduled, published, failed and rejected reels do not occupy a production slot. Automatic per-channel backlog protection continues to count approved reels waiting to be posted.
- Daily creation limits stop new projects, not finishing an existing project within its spending allowance or downloading completed work. Ownership and monthly/global spending checks remain in force.
- Manual publication confirmation is atomic and safe to repeat. It preserves existing destination IDs and timestamps, can reconcile a previously published reel missing destination records, and never turns an unapproved reel into a publication.
- Retrying a completed direct YouTube upload returns its recorded result without another upload. The current mixed-destination behavior remains: YouTube alone does not mark a multi-destination reel fully published.
- Verification and recovery screens describe the actual access mode and mail capability. They always provide a usable support route when email recovery is unavailable and never imply that Google will automatically link to a password account.

## Proof

The focused tests reproduced the failures before the fixes: completed reels occupied creator slots,
legacy Bible-review work bypassed the limit, automatic production counted finished work on other channels,
and publication retries failed. The final suites exercise real PostgreSQL rollback/concurrency and
creator-scoped counts, preserve scheduler backlog behavior, and render the account-entry state matrix.

- Full workspace suite: **1,121 tests passed**, with disposable PostgreSQL and Redis configured:
  core 639, providers 56, render 27, web 232, worker 167.
- New coverage: 15 creator-limit cases, 3 automatic-production cases, 11 PostgreSQL manual-publication
  cases, 12 mocked YouTube cases and 23 account-entry cases.
- `pnpm lint`: no errors; nine existing warnings in unchanged code. `pnpm typecheck`: passed.
- Web and worker production builds: passed. Web used a separate output directory so the existing local
  app was not interrupted.
- Local browser checks: password sign-in/sign-out, recovery help without email configuration, the
  account's production-slot explanation and recovery link, and the unverified-account screen without
  email configuration. Disposable accounts had zero production allowance.
- Independent technical review: no blocking findings. Its confirmation-email copy edge was corrected.

## Remaining boundaries

The local pass does not replace the fresh deployed signup-to-export acceptance journey. Deployment,
real email delivery, external publishing and paid generation remain deferred.

A recorded YouTube upload is now safe to retrieve on retry. Simultaneous first uploads, or a process
failure after YouTube accepts the upload but before its ID is saved, can still duplicate the external
video; durable upload reservation/reconciliation is separate work. This pass does not claim to solve it.
