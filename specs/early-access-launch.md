# Free early-access launch runbook

The studio and marketing site deploy independently. These changes prepare a signup journey; they do not establish that the deployed journey has passed acceptance.

## Keep both entry points aligned

- Studio: `SIGNUP_MODE=approval` is the default. Apply the account-session version migration, configure the trusted `AUTH_URL`, verify Google callbacks, and configure account email before enabling password signup in open mode.
- Apply migration `0067_account_auth_version.sql` through the normal migration command before deploying the new app. Set `RESEND_API_KEY` and the verified `AUTH_EMAIL_FROM` sender. Missing mail configuration hides password signup in open mode; Google remains available when configured. Confirm real email delivery and expiry/replay behavior with a controlled account before announcing availability.
- Set and review `DEFAULT_USER_MONTHLY_BUDGET_CENTS`, `DEFAULT_USER_DAILY_REEL_QUOTA`, `MAX_INFLIGHT_REELS_PER_USER`, and a positive `GLOBAL_DAILY_SPEND_CAP_CENTS` on the applicable web/worker services. The unchanged defaults are $50/month, 20 reels/day and five in progress; the global ceiling is off unless configured. These are internal production safety caps, not purchased credits. Existing monthly accounting follows the creation month of the project, including its later accumulated cost; it is not a transaction-period billing ledger.
- Confirm Redis is reachable before opening. The inherited authentication rate limiter fails open without Redis; this implementation does not replace that limiter or certify abuse resistance during a Redis outage.
- Marketing (`apps/landing`): `SIGNUP_MODE=approval` retains the access-request form and its existing D1 waitlist. `SIGNUP_MODE=open` changes the entry buttons to studio signup. `KENDRIX_APP_URL` defaults to `https://app.kendrix.io`; use the intended studio origin for a preview deployment.
- Update and rebuild/redeploy both services when opening signup. The landing pages are statically rendered, so changing an environment value alone does not update the published buttons.
- Keep `KENDRIX_LIST_ENDPOINT` and its key for the invitation list while approval mode remains in use. Existing requests are a list of interested creators, not studio accounts; opening signup does not create accounts or send invitations for those addresses.

## Acceptance before opening

Use a new non-admin account to verify the deployed path through signup, email verification or Google sign-in, channel setup, draft resume, story review, storyboard, production/retry, review and download. Check account usage, a denied foreign resource, sign-out, password recovery, session revocation, and a finished download at the production allowance boundary. Record live production and email acceptance separately; local mocked checks do not prove their delivery.

Verify the marketing buttons reach the correct studio, and that `https://kendrix.io/contact` provides the existing support route. The repository identifies `hello@kendrix.io` for general support and `privacy@kendrix.io` for privacy requests. Do not promise a response time without an operating commitment.

Web auth pages do not load third-party marketing analytics. Marketing-site analytics remain on the marketing site. Recovery links use `no-referrer` and explicit confirmation, so email scanners do not consume them on GET. Session revocation and suspension propagate immediately in the handling web process and within the 30-second profile cache window on another instance; expired authorization fails closed when the database cannot be read.

## Support-assisted account deletion

The studio has channel deletion and finished-reel downloads. It does not yet have self-service account deletion or a complete account-data export. Those requests are directed to the existing contact page.

Before broad opening, the owner needs an operational procedure for these requests: confirm the requesting account's identity, identify the account's data and connected publishing credentials, perform the authorized removal/export, account for separate stored-media cleanup and retained operational records, and confirm the outcome to the creator. Define who handles requests and how completion is checked. No automatic media-removal or backup-expiry schedule is established by this implementation, and none is promised in the updated privacy page.

Do not run destructive deletion as part of signup acceptance. This runbook records the remaining operational work; it does not authorize deletion of any creator's account or content.
