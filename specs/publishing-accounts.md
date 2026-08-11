# Publishing accounts

Status: YouTube direct publish implemented; TikTok and Facebook Reels remain manual until their app
review requirements are satisfied.

## Creator path

1. Channel creation records every chosen destination in `channels.targetPlatforms`.
2. Channel Settings shows those same destinations and the account assigned to each one.
3. `Connect` starts provider OAuth in context for that channel. The callback verifies the signed-in
   user, channel ownership, signed state, expiry, and an HTTP-only nonce before storing credentials.
4. At the approved-reel gate, Storyboard repeats the destinations. Connected providers can publish
   directly; the post package remains the fallback for destinations that are not connected.
5. A direct publish writes one `publications` row per platform. The reel becomes `published` only when
   that direct publish covers every selected destination; otherwise it stays `approved` until the
   remaining destinations are posted and marked complete.

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

## Reliability boundary

Provider calls are idempotent at the database boundary through the unique
`(reel_id, platform)` publication index. A provider post id is persisted as soon as an upload succeeds.
Failures are logged with reel/channel context, stored on the connection for diagnosis, and returned to
the creator as a short reconnect-and-retry message without leaking provider responses or credentials.

The current single reel status cannot fully express “published to one of three destinations.” The
`publications` rows are therefore authoritative per destination; `reels.status = published` remains the
aggregate terminal state. If multi-provider direct publishing proves useful, replace the manual
`mark-published` action with an aggregate that derives completion from the selected destinations.
