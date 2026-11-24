# Account data requests during early access

This is the operator procedure for requests sent through https://kendrix.io/contact or privacy@kendrix.io. It does not add self-service account deletion or promise a response time. Assign a human operator and record a request ID, account ID, requested scope, verification method and completion status in a restricted support record.

## Verify and inventory

A contact-form email field does not prove ownership. Confirm the request through the account's existing verified email and a fresh sign-in to that same account. Never request a password, recovery token or session cookie. Leave unverified requests pending.

Before changing anything, enumerate the account's channels and all dependent drafts, stories, series/topics, reels, compilations, scenes, assets, pipeline records, publication records and publishing connections. Create an exact row/key manifest, including storage keys inside nested creative data, and retain it until reconciliation finishes. Schema: `packages/db/src/schema.ts`.

## Export

Produce a tenant-filtered archive of profile information, creative content/settings, project history, publication metadata and usage records, with the media requested. `packages/providers/src/shared/storage.ts` exposes `downloadStream()` and `downloadBuffer()`. The existing finished-reel package route is useful for completed reels, but is not a complete account-data export.

Exclude password hashes, auth/recovery/invite tokens, publishing credentials, platform secrets, internal security logs and every other creator's data. Deliver through an authenticated or access-controlled transfer to the verified requester. Record delivery and clean up temporary export files.

## Delete after the requested scope is confirmed

1. Suspend the account, increment `users.authVersion`, invalidate its profile cache and allow the documented 30-second cross-instance cache window. Disable its scheduled generation/publishing. Identify jobs by the manifest, wait for active work to finish and remove only that account's queued work; never clear shared queues.
2. Revoke publishing grants and remove local credentials. The current YouTube disconnect route does not treat non-success revoke responses as failures, so its success response proves only local disconnection. Confirm provider revocation separately and record failures for follow-up. This does not remove already-published social posts.
3. Remove exact owned storage objects using the manifest and the ownership rules in `apps/web/src/lib/storage-key.ts` and `callerMayUseStorageKey()` in `api-access.ts`. Include owned channel/reel/compilation prefixes and ownership-proven legacy keys. Preserve shared presets and cross-tenant references. There is no shared R2 listing/deletion helper; use the authorized storage console or a separately reviewed exact-key operation, recording per-key results.
4. In a transaction, delete the account's channels before its user. User deletion alone leaves channels ownerless. Channel deletion cascades creative database rows; user deletion cascades auth accounts and database sessions. Explicitly remove that user's `account:verify:<userId>:...` and `account:reset:<userId>:...` verification-token identifiers and applicable email-bound invitations.
5. Handle its D1 waitlist row and support-mail records separately. The access-inbox export endpoint returns the whole waitlist and must never be sent as one person's export. Retain only necessary restricted completion evidence and documented operational totals.

## Verify and close

Reconcile database rows and storage objects against the manifest. Verify revoked sessions fail and queued work cannot recreate content. Preserve anonymous reel/compilation cost totals before deleting those rows; `spend_events` intentionally retains amounts with user/channel references cleared. Check for temporary media left by failed jobs.

Track database, storage, provider-revocation and delivery failures separately; retry only incomplete operations and report partial completion honestly. Record handling of backups, provider-held data and operational logs separately. No automatic expiry or universal immediate erasure is established by this procedure.
