# Publishing accounts

Status: guided manual posting supports TikTok, Instagram, Facebook and YouTube. YouTube direct upload
is optional. The handoff is implemented locally; deployment remains deferred. See `publishing-handoff.md`.

## Creator path

1. Channel creation records every chosen destination in `channels.targetPlatforms`.
2. Channel Settings shows those same destinations and the account assigned to each one.
3. Optional YouTube `Connect` starts provider OAuth in context for that channel. The callback verifies the signed-in
   user, channel ownership, signed state, expiry, and an HTTP-only nonce before storing credentials.
4. At the approved-reel gate, download the video, cover and available subtitles, copy the caption with
   image credits, and open each platform to post. File sharing is available where the browser supports it;
   the ZIP remains a secondary option. These actions do not mark anything posted.
5. Confirm each destination independently, optionally saving its HTTPS post link. Records survive reloads.
   Manual confirmation records the creator's report; it does not verify public availability. Other platforms
   can use the same download and copy path without adding a tracked destination.
6. The reel becomes `published` only when every selected destination has a published row. A scheduled
   YouTube upload is incomplete until its scheduled record is promoted. Historical rows for destinations
   removed from channel settings remain visible. Legacy terminal reels are never moved backwards.

## Ownership and credentials

`platform_connections.channel_id → channels.user_id` is the only tenancy path. A connection belongs
to a channel, not globally to a login, because one creator may operate several brand accounts. This
also keeps `channels.userId` as the future workspace seam.

Access and refresh tokens are encrypted with AES-256-GCM using `PUBLISHING_CREDENTIALS_KEY`. Provider
client secrets remain environment configuration. Disconnect revokes the provider grant best-effort,
then removes the local connection.

## Provider rollout

### YouTube

Implemented with the server-side authorization-code flow. Requested scopes are `youtube.upload`,
`youtube.force-ssl`, and `youtube.readonly`; the last identifies the selected YouTube channel and the
force-ssl scope supports the existing native caption-track upload. Direct upload uses the channel's
refresh token rather than the legacy operator-wide environment refresh token.
The UI says “Uploaded to YouTube” and directs creators to check visibility in Studio. It does not promise
that an uploaded video is public. A manually confirmed YouTube row prevents a fresh direct upload.

### TikTok

Before direct post can ship, the developer app needs Content Posting API approval and `video.publish`.
The publish screen must query creator info immediately before posting, show the returned privacy and
interaction options, collect explicit consent, validate the creator-specific duration limit, initialize
the post, upload the video, and poll its status. Unaudited clients can only post privately, so Kendrix
must not label that path as public publishing before review passes.

### Facebook Reels

Before direct post can ship, the Meta app needs the appropriate Page publishing permissions and review.
OAuth must let the creator choose a Page, persist the selected Page identity and long-lived Page token,
then use the Reels upload/publish flow. Page selection belongs in the connection callback—not in channel
creation—so channel creation remains about the story destination, not account plumbing.

### Instagram Reels

Manual posting is supported without a Kendrix social API connection. The channel picker uses a conservative
90-second Kendrix output cap; this is not a claim about Instagram's current maximum duration. A future
direct integration requires its own professional-account, permissions and review work.

## Reliability boundary

Publication records use the unique `(reel_id, platform)` index and a reel lock to serialize updates and
the aggregate completion decision in one transaction. Manual retries preserve the first timestamp,
provider identity and an existing URL when none is supplied. A recorded provider result is reused on retry.
Failures are logged with reel/channel context, stored on the connection for diagnosis, and returned to
the creator as a short reconnect-and-retry message without leaking provider responses or credentials.

The database transaction does not make external uploads idempotent: simultaneous first uploads and
provider success followed by a failed database write still need future reservation/reconciliation work.
Platform rows are authoritative for partial progress; the reel status is the aggregate terminal state.
Migration 0068 adds nullable `publications.post_url` without rewriting existing publication history.
