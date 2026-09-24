# Publishing handoff

Status: implemented and verified locally, 2026-09-24. Founder approved the guided publishing handoff;
deployment remains deferred. No new social publishing integration or paid generation is required.

The initial pricing discussion deferred managed publishing. The founder subsequently approved a bounded
Post for Me own-account pilot, then prioritized the creator walkthrough before proceeding. The pilot has
not started a verified subscription or real post; see `post-for-me-pilot.md`. Keep the manual handoff and
existing optional YouTube integration; automatic publishing and scheduling are not launch promises.

The later creator walkthrough consolidates the finished screen's duplicate caption editors into one
Edit & copy caption action with draft preservation. See `creator-walkthrough-2026-09-24.md`.

## Evidence and intended outcome

Before this change, the finished-reel screen downloaded a ZIP under “Download,” offered one confirmation
that marked every channel destination published, omitted Instagram from validated destinations, and copied
captions without the image credits included in the ZIP. Subtitle sidecars were absent from export. A creator
could finish production but could not accurately record a partially completed cross-posting session.

The creator should approve a reel, download or share the finished video, copy its caption with credits,
post in the platform's own interface, then confirm each destination independently and resume later.
Manual confirmation records the creator's report. Neither downloading, sharing, opening an upload page,
nor saving a URL verifies public availability.

## Contract

- Add `instagram_reels` to the validated channel destination set and every destination mapping. It is
  a vertical manual destination mapped to the existing database platform `ig`. Preserve legacy channels
  and the exclusive widescreen rule. Other platforms use the generic download/copy path for now.
- Keep the existing publication unique key `(reel_id, platform)`. Add only a nullable `post_url` column.
  Existing external IDs and timestamps are retained. Existing rows remain visible without invented URLs.
- `POST /api/pipeline/mark-published` requires `{ reelId, platform, postUrl? }`, with platform one of
  `tiktok`, `fb`, `ig`, `yt`. Missing destinations and destinations outside the channel set are rejected.
  URLs must be credential-free HTTPS links on the chosen platform's known hosts; they are stored, never
  fetched. Omitted URLs preserve existing values; repeated confirmations preserve the first timestamp.
- Within one transaction and reel lock, confirm only the requested destination. The reel becomes
  `published` only when all selected platform rows are published; otherwise retain its approved/scheduled
  state. All existing ownership, active-account, visual-truth and state-machine checks remain. Existing
  terminal reels may reconcile missing rows without erasing their history. Concurrent retries are safe.
  Completion requires a nonempty, fully recognized destination set; an empty or filtered-unknown set
  never counts as complete. Scheduled rows are incomplete until promoted. Off-target historical rows
  remain visible read-only if destinations changed after posting.
  Confirmation is limited to 60 requests per minute per owner, after authorization and before further
  queries or writes. Scheduled mixed-platform reels with unfinished manual destinations remain actionable
  in the operator digest; purely queued destinations remain quiet.
- Direct YouTube remains optional. Its web and worker completion logic, including the scheduled-publication
  promoter, must use the same locked aggregate and respect remaining selected
  destinations. An existing manually confirmed YouTube destination must not silently trigger a new upload.
  Simultaneous first provider uploads and provider-success/database-failure reconciliation remain a
  separate limitation; do not imply this change fixes those existing cases.
- The finished-reel screen displays each destination's saved state, an optional post URL, a manual
  confirmation action and a platform entry link/instructions. YouTube connection/upload is optional;
  a creator can use the native upload path. Published confirmations remain visible after reload.
- Download video and cover through the existing authorized asset proxy with attachment disposition;
  retain the ZIP as “Post package.” Provide SRT when burned captions are disabled and timing data exists.
  Downloading or copying existing work performs no paid generation and remains available at spend caps.
- Post metadata GET supplies image credits and a deterministic fallback caption as well as metadata.
  Clipboard and ZIP use the same formatting, including edited metadata and required image attribution.
  Do not add new generated platform-specific copy. Keep existing explicit post-metadata edits intact.
  Remove the existing export-time legacy metadata generation; use the saved story title/logline fallback.
- Offer native file sharing only when supported; retain download/copy on unsupported browsers or errors.
  A share action never changes publication state. Bound in-memory file sharing and explain large-file
  fallback. Cancelled sharing is a normal outcome.

## Coordination contracts

Core exports `PublicationPlatform`, `publicationPlatformForTarget(target)` and
`publicationPlatformsForTargets(targets)` for explicit mappings. Unknown targets never fall back to TikTok.
The confirmation response returns `{ ok: true, reelStatus, publication }`; the publication exposes
`platform`, `status`, `postUrl`, `platformPostId`, `publishedAt` (ISO or null).

Storyboard destination props add the mapped `platform` and nullable publication with those fields.
Post-meta GET adds `imageCredits`, `captionText` and `hasSubtitles`; clients may use the shared formatter
with unsaved edits. Standalone subtitles use `/api/pipeline/export-subtitles?reelId=...`.

## Verification

Before implementation, review this contract against the observed failures. Test selected-destination
authorization, malformed/foreign URLs, partial and final completion, repeat/concurrent confirmation,
rollback, preservation of external IDs, legacy rows and direct YouTube coexistence. Test Instagram
validation/mapping, credits and sidecars, download ownership and safe attachment headers, and truthful
rendered UI states. Use a disposable migrated database, mocked providers and local desktop/mobile browser
checks. No real posts, account connections, emails, paid generation or deployment are part of this pass.

Technical review approved the contract with the scheduled promoter included and the nonempty aggregate,
historical-row, URL-validation and provider-free export boundaries made explicit above.

### Local acceptance evidence

- Full workspace suite: **1,221 tests passed**, no skips, with disposable PostgreSQL and Redis: core 656,
  providers 56, render 27, web 295 and worker 187. External uploads and emails were mocked.
- Before the fixes, focused tests reproduced export-time paid work, missing sidecars/attachment handling,
  destination confirmation failures and lost digest reminders. The broader suite caught eager cost-config
  loading through the new database dependency; narrow core subpath imports fixed it without weakening
  the existing spending-boundary tests.
- `pnpm typecheck` and `pnpm lint` passed, with the nine existing lint warnings.
- Final web and worker production builds passed. Separate web build directories kept the user's
  existing local app untouched; generated configuration edits were restored after verification.
- Desktop and 390px phone-width browser checks used an active tester with zero production allowance,
  a disposable database and local fixture media. Verified video playback; video, cover, SRT and ZIP
  downloads; wrong-platform link rejection; independent Instagram confirmation and persisted link;
  partial progress after reload; all four manual confirmations and final aggregate completion;
  and unsaved caption edits plus archival credits in the clipboard. Phone layout had no horizontal overflow.
- Native file preparation reached “Share video” without changing progress. The actual OS share sheet
  and posting into third-party apps were not exercised; unsupported and oversized files retain download
  fallback, and cancellation is covered by tests.
- Independent technical review found confirmation rate limiting and scheduled mixed-reel digest gaps.
  Both were fixed and re-reviewed with no remaining actionable findings.
- Migration 0068 was applied only to the disposable database. This does not establish deployed acceptance,
  real email delivery, social-account connection or a public post. Deployment remains deferred.

### Copy review

| Before | After | Purpose |
| --- | --- | --- |
| Download | Download video / Download cover / Download subtitles / Post package | Name the file before the click |
| Mark as published | I’ve posted this, within one destination | Record only the creator's chosen destination |
| Live on YouTube | Uploaded to YouTube; check visibility in Studio | Match the evidence the app actually has |

Help now walks through the same downloads and per-destination confirmations. Simultaneous first direct
uploads and provider-success/database-failure reconciliation remain outside this handoff, as above.
