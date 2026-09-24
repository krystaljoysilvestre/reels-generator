# Early-access rollout record — 2026-09-24

## Merged release

- PR #24 (account journey) merged as `b3c52195a2add56ec253e726eee07db0b635cca5` after CI and the landing preview passed.
- The live worker reported `/app/.build-commit=d80cb7a81599f0bcfbb8f244a0b823fb7ce5140f`, which was absent from the prior `main`. PR #25 preserved that existing visual-fix history, with the newer story paid-failure accounting intact.
- PR #25 passed CI and merged as `ac7a48113e9a84b40d5ac10d5d3f01596c64ffb5`. Its tree matched the locally tested composition: 1,057 tests passed with real disposable Postgres/Redis, plus lint, typecheck and all production builds.
- Release checkout: `/private/tmp/kendrix-early-access`, detached at the merged release. Original working checkout and its unrelated edits were preserved.

## Production preflight

Read-only checks confirmed web build `d0a0c59`, worker build `d80cb7a`, a healthy Redis response and zero active/waiting/delayed pipeline and render jobs. Only the existing admin account was present. Web's pre-deploy hook is `pnpm db:migrate`; migration 0067 is part of the release but has not been applied by this rollout.

These non-secret settings were staged on web and worker with `--skip-deploys`:

| Setting | Value |
| --- | --- |
| DEFAULT_USER_MONTHLY_BUDGET_CENTS | 5000 |
| DEFAULT_USER_DAILY_REEL_QUOTA | 2 |
| MAX_INFLIGHT_REELS_PER_USER | 5 |
| GLOBAL_DAILY_SPEND_CAP_CENTS | 2500 |

Web also has explicit `SIGNUP_MODE=approval`. The new settings are staged configuration; no successful service restart applied them during this attempt. The global spend value is a protective threshold, not a strict provider-invoice ceiling: accounting follows project creation periods and gates do not reserve concurrent spend. The five-project limit includes approved projects, so it was not reduced.

Google credentials, the trusted auth URL, database and Redis settings are present. `RESEND_API_KEY` and `AUTH_EMAIL_FROM` are absent. Password-email delivery cannot be accepted yet. Landing-site configuration remains in approval mode by default; no signup-opening change was made.

## Deployment blocked — 10:40 UTC

`scripts/deploy-railway.sh web` stopped during upload with: “Your trial has expired. Please select a plan to continue using Railway.” No new Railway build or migration went live. A subsequent health probe still returned web build `d0a0c59`.

The Railway workspace billing page confirmed that an unpaid invoice blocks deployment. No payment was attempted and no hosting plan was changed. Billing was left open for the owner. No billing account identifiers or payment credentials are stored here.

## Resume

The founder deferred deployment until billing is resolved. Local creator-journey fixes continue on
`codex/creator-journey-followthrough`; select the reviewed, pushed release when resuming rather than
assuming the detached checkout above includes those later changes. See `creator-journey-followthrough.md`.

1. Resolve Railway billing with explicit owner authorization. Confirm deployment eligibility.
2. Recheck that the release checkout is clean and pushed, and that no production render is active. Deploy web first for migration 0067, then worker; verify both report the selected release commit.
3. Resolve the pending Google-first versus Resend email setup choice. Verify the actual Google callback and, if enabled, real account-email delivery and recovery with an owner-controlled account.
4. Complete the fresh non-admin signup-to-export acceptance journey described in `early-access-launch.md`. The existing admin session and mocked tests are not substitutes for this evidence.
5. Once acceptance passes, align `SIGNUP_MODE=open` on studio and marketing, rebuild/redeploy both and verify the public entry points. The landing project is reachable through the existing authenticated browser; Vercel CLI has no credential in this environment.
6. Use `account-support.md` for verified account-data requests. It documents manual operational work; no creator data was exported or deleted during rollout.

If a successful deployment later needs rollback, retain the additive migration and restore the prior service deployments through Railway after checking active jobs. Before this attempt the web deployment was `46d15e61-1c52-4897-b0fb-2bd2d474b58e` and the worker deployment was `345e0124-a20c-438b-8a4f-1832c5326e04`.
