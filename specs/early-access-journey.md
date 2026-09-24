# Free early-access journey

Founder direction, 2026-09-24: finish the creator journey before further story, visual and audio polish. The first release is **free early access**, with no payment method or subscription required.

## Observed failures

- Registration always leaves uninvited creators pending; there is no explicit public-access switch.
- Password accounts have no email verification or recovery. Automatic same-email Google linking can preserve an unverified registrant's password.
- Existing pending accounts cannot accept an invite; suspended accounts see the same waiting screen.
- There is no account/usage page or working first-run guide.
- A channel draft can be loaded by a foreign draft ID.
- Downloading a completed reel checks the production allowance even when it needs no paid work.

## Contract

`SIGNUP_MODE=approval` remains the deployment default. `SIGNUP_MODE=open` enables free self-service access for verified email owners. Google sign-in requires a verified provider email. Password registration in open mode requires configured transactional email, and remains pending until verification. Existing active invitees retain access; suspension is never undone by sign-in, invitation or email verification. Automatic linking to an existing password account is disabled.

Recovery links are hashed at rest, expire, have separate purposes, and are consumed atomically. Resetting a password changes the session version so earlier sessions stop working. Email uses a configured trusted app URL, never an untrusted request host. No transactional emails are sent by the development acceptance tests.

The first-run route is account → channel (including saved draft) → story → storyboard → production/retry → review → export. Help and account/usage are reachable throughout the normal app. Free access has existing production limits; these are not purchased credits or an invoice. Finished output remains downloadable at the allowance boundary without new provider spend.

## Review and proof

Product review identified the waiting-screen, dead-tour and export failures. Technical review identified verification/linking and draft ownership gaps. The chosen scope improves creator activation and workflow completion; monetization is deferred by the founder's free-access choice. Existing creative quality gates and generation edits remain in place.

Required checks: token expiry/replay/purpose separation, status and session revocation, registration modes, foreign draft denial, capped export with no paid call, lint, typecheck and production build. Deployment additionally requires an applied auth-version migration, configured mail for email signup, working Google callbacks, and one fresh non-admin journey through export on the deployed build. Public signup is opened by deployment configuration after those checks; local changes do not establish a completed live acceptance lap.

## Creator-facing wording

| Before | After |
| --- | --- |
| Watch 60-sec tour (inactive button) | Read the quick guide (working help page) |
| Publish everywhere, on a schedule | Download & post |
| AI story generation | Story development |
| Awaiting approval for every non-active account | Verify email, waiting for approval, enter studio, or access paused — matching the account |

Account usage explicitly says that production amounts are covered during early access and are not a bill.

## Original combined-workspace validation — 2026-09-24

- 1,057 automated checks passed across core (639), providers (56, including real Redis), render (27),
  worker (164) and web (171). The final web run includes the returning-creator activation correction.
- Actual PostgreSQL suites passed against a newly created isolated database: tenant access (3 cases plus
  2 status checks), account-token transactions (5), invitation transactions (5), spending boundaries (8),
  and forced cost-idempotent recovery (3). No external generation or real transactional email was sent.
- Repository lint and typecheck passed; lint retains 9 pre-existing warnings. Worker build and both
  website production builds passed; both website entry points were built with open-mode configuration.
- Browser checks used a disposable non-admin account with zero production allowance: public entry,
  configured Google-only signup, credentials sign-in, first-run dashboard, account display, name save,
  desktop/narrow layouts, sign-out, incomplete recovery link, and signed-out help. No live Google consent,
  inbox delivery or new video production was exercised by that preview.
- Temporary preview and isolated test database were removed after validation. Existing creative changes
  were preserved. This preview included the separate visual-identity branch; its counts and browser proof
  describe that original workspace, not the later branch extracted from `main`. No deployment or production
  signup change was performed.

## Main-based branch validation — 2026-09-24

The early-access changes were extracted onto `codex/free-early-access-journey` from `main` at `6ebf7f8`.
The earlier story-generation work is already in that base; the separate visual-identity changes are excluded.

- All 1,038 tests passed: core (631), providers (55, including real Redis), render (27), worker (154),
  and web (171), with all PostgreSQL integration suites enabled against a newly migrated disposable database.
- Repository lint and typecheck passed; lint retains 9 pre-existing warnings.
- Worker and both website production builds passed; both website builds used `SIGNUP_MODE=open`.
  Existing dependency/Edge-runtime build warnings remain. No new live email or paid generation was exercised.

The deployed non-admin production/export lap and live email acceptance remain required in the launch runbook.
