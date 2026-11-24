# Post for Me publishing pilot

Status: founder approved a $10/month, own-account evaluation on 2026-09-24. An API client and operator
runner are prepared locally; the founder then prioritized the creator walkthrough before further integration.
No subscription, connected accounts or real publications have been verified yet. See
`creator-walkthrough-2026-09-24.md`; the pilot remains outside customer launch acceptance.

## Decision and evidence

Problem: guided downloads complete the current creator handoff, but direct scheduled distribution
still requires a provider. Ayrshare's quoted SaaS entry cost was too high for early access.
Post for Me advertises $10/month for 1,000 successful posts, unlimited accounts, and managed
Quickstart credentials that avoid registering Kendrix developer apps. Users see Post for Me in
the platform consent screen. These are vendor claims, not Kendrix reliability evidence.

- [Pricing](https://www.postforme.dev/pricing)
- [Quickstart and scheduling](https://www.postforme.dev/solutions/social-media-scheduler)
- [API contract](https://api.postforme.dev/docs)

Participants: Research Partner verifies the actual API contract and billing unit; Technical Advisor
reviews the pilot's ownership, duplicate-post and cost boundaries. The founder has authorized the
small evaluation; broader creator rollout remains dependent on its results.

## Bounded experiment

Use a Quickstart project and the founder's own TikTok, Instagram professional account, Facebook Page
and YouTube channel. Preview an existing approved reel, exact caption with image credits, account
identities and scheduled time before submission. Do not generate new content just to test publishing.

Keep this as an operator pilot until real posting works. No new customer controls, connection-table
overloads, platform reviews, production deployment or billing plans are needed for this experiment.
Existing native YouTube connections and guided manual posting remain available.

Persist one immutable submission intent before the external request. A timeout or lost response is
ambiguous: reconcile the remote job instead of automatically creating another post. Read per-account
results; neither an accepted request, an elapsed scheduled time nor a processed aggregate proves all
destinations succeeded. Record costs once from successful billable destinations using the documented
subscription allocation, separate from the actual $10 monthly cash expense.

Billing unit verified from the [terms](https://www.postforme.dev/terms) and
[provider implementation](https://github.com/DayMoonDevelopment/post-for-me/blob/main/trigger/post-to-platform.ts):
each successful destination consumes one post, allocated at 1 cent. Four successful deliveries use four
posts, so 1,000 covers 250 four-platform crossposts. Pending or failed deliveries do not yet consume
a successful-post unit. Read-only account/status requests and media staging have no separate billable
unit. The pricing FAQ and upgrade guide conflict on automatic tier upgrades; stay within the pilot
allowance and verify actual checkout terms.

Pilot jobs must stay out of `publications` while queued: the existing native YouTube schedule promoter
assumes publication at the due time. Experimental posts also must not inflate retained-publication
metrics. Keep experiment evidence and cost attribution on the owning reel, with explicit actor,
channel, artifact, destination and provider identities. Never store provider access tokens in a
manifest, log or tracked file.

The journal uses `pipeline_steps` with `step_name=post_for_me_pilot`, always `status=done`; its remote
phase is inside `output`. It never enters the production dispatcher or retry queue. The unique reel/step
index reserves one attempt. Reconciliation locks that row and atomically adds newly observed successful
account units to its cost and `reels.costCents`. The CLI requires the configured active admin to match
`getReelOwnerUsage(reelId).userId`; broad admin visibility is insufficient. It rechecks the approved
artifact's byte hash, caption, owner, account identities and spend boundaries before submitting.

Current provider limitations to verify in the pilot:

- TikTok success may return a profile URL rather than a video permalink. A processing failure can
  publish later; neither outcome permits an automatic retry.
- TikTok and YouTube expose native synthetic-content flags. Instagram and Facebook do not expose an
  equivalent flag in the current contract; verify their disclosure labels in the native platform UI.
- `external_id` is a reconciliation tag, not an idempotency key. Use a query by that value to identify
  an existing job after a lost response.
- Quickstart rejects callback overrides in account-auth requests. Configure its callback in the project.

## Acceptance

1. Founder can authorize all four intended accounts through managed credentials.
2. Reviewed video, caption, credits and disclosure settings reach each intended account.
3. A scheduled job actually appears publicly at each platform; collect public URLs and check them.
4. Partial failures remain visible; polling and repeated commands do not repost or double-count cost.
5. Establish the billable unit for cross-posting and record actual subscription terms.
6. Report successes, delays, failures and manual interventions before deciding on customer integration.

This experiment tests lower-friction distribution and provider reliability. It does not validate
story quality, customer demand or the outstanding deployed product-only acceptance journey.

## Local implementation verification — 2026-09-24

- The runner passed 17 pure tests and 19 integration tests against a disposable, migrated PostgreSQL
  database. Provider calls and stored media were mocked; no subscription or real post was created.
- The integration checks cover actual owner/admin enforcement, all four platform mappings, immutable
  reservation races, lost-response recovery, mismatched remote jobs, concurrent cost reconciliation and
  transaction rollback. Recovery tests use the exact reconciliation ID passed to post creation.
- Targeted lint and worker typecheck passed. The CLI help command runs without provider credentials.
- Combined pre-commit validation, including the creator handoff and caption fixes: **1,278 tests passed,
  no failures or skips**, across 122 files with real disposable PostgreSQL and Redis. All 69 migrations
  (0000–0068) applied. Full workspace lint (nine existing warnings), typecheck and production builds
  passed. Disposable test databases and test Redis keys were removed; existing local services remained running.
- These checks establish local safeguards. Account connection, provider delivery, public visibility,
  disclosure labels and actual billing remain unverified until the bounded live pilot.
