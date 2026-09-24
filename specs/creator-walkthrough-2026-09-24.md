# Creator walkthrough — 2026-09-24

Status: implemented and verified locally. Deployment and the Post for Me subscription remain deferred.

## Experiment and observed failure

Walk the current web build with disposable non-admin accounts, then inspect a finished reel before posting.
The local preview uses a separate database with all migrations, zero production allowance, no generation
credentials and read-only fixture storage. Existing services, real accounts and original reel records are untouched.

The empty creator can sign in, save a channel brief, resume the same draft, reach help and read the free-access
allowance. These checks do not exercise email verification, paid generation or deployed acceptance.

The finished-reel preview uses a copy of Crossroads reel `91ebdcf9`, *The 31 Million Bottle Decision*, including
its real video, cover, story, post metadata and timing. Scene editing media is outside this fixture.

Reproduction: edit Caption on the finished-reel screen without saving; open Post caption; click Copy caption.
The clipboard contains the older saved caption, even while the edited caption remains visible behind the dialog.
The page has two independent editors for the same fields. This can send a creator's superseded copy to a platform.
The finished screen also labels the early-access production allowance as Spend without the explanation on Account.

## Hypothesis and contract

One post-details editor removes conflicting drafts and makes copying predictable.

- The finished screen previews saved title and caption. A clearly named Edit & copy caption action opens the
  existing full post editor. Remove the duplicate inline title/caption editor and its separate save lifecycle.
- The full editor continues to copy its current draft with hashtags and required image credits. Save persists
  that same draft; successful save refreshes the preview. Do not introduce automatic saves or generation.
- Preserve an unsaved draft when the dialog is closed and reopened in the same screen session. Make unsaved
  status visible so copying a draft cannot be confused with saving it for later exports.
- Keep video, cover, subtitles, ZIP, per-destination posting and existing metadata authorization unchanged.
- Label final-screen dollar amounts as production usage and explain that early access covers the amount.
- Validate the reproduced editing/copy/reopen/save path in the browser, including a narrow viewport. Run focused
  checks, lint and typecheck. No real platform post, subscription, deployment or new reel is part of this pass.

## Existing artifact review

The actual media is 84.288 seconds, 1080×1920 H.264 at 30 fps with AAC audio. A measured audio pass reads
−14.1 LUFS integrated and −1.3 dBFS true peak. These measurements do not establish narration performance,
music taste or intelligibility by ear. Visual review uses sampled frames and the cover, not a continuous
motion-quality judgment.

Sampled frames retain a consistent muted palette and bottle/capsule imagery. The three-panel composition
around 36 seconds occupies substantially less portrait height than adjacent scenes; check its readability
on a phone in a future visual review. The cover's “31 Million Bottles” is concrete and readable. These
observations do not establish continuity or motion quality across the entire video.

The text has concrete stakes, a decision, and quantified consequences. The stored caption's “reshaped product
safety forever” is broader than the narration, which explicitly separates the company action from federal
rulemaking. The opening spends about 4.5 seconds on dates before the first danger statement at 5.143 seconds.
The later close repeats the earlier shelf-risk question. These are one-artifact review observations, not
measured retention failures or evidence for a pipeline rewrite. Preserve the approved cut.

A proposed publishing-copy revision, derived from the saved narration rather than a new historical fact-check:

> In 1982, the source of the Tylenol poisonings was still unknown. Johnson & Johnson chose a nationwide capsule
> withdrawal covering 31 million bottles. The company estimated the response at $100 million. This story follows
> that decision and the separate federal packaging measures that followed.

No original reel metadata or existing public post has been changed.

## Review and verification

Product Partner reviewed the contract before implementation: keep the editor beside the saved preview,
preserve drafts and failed saves, prevent edits from being lost during a pending save, retain fallback captions,
and refresh saved text immediately even when cover composition takes longer.

- Browser: active non-admin sign-in; empty dashboard; channel brief save/resume; account allowance and help entry.
- Reproduced both caption failures before the fix: the duplicate editor copied older text, and closing/reopening
  the full editor discarded an unsaved draft.
- After the fix: one editor beside Saved post details; current caption and hashtags in clipboard; explicit
  unsaved state; draft preserved on close/reopen; editing disabled while a save is pending.
- A temporary constraint in the disposable database forced a real save failure. The UI showed the error,
  retained the draft and kept saved metadata unchanged. Removing the constraint allowed the same draft to save;
  the preview updated immediately and persisted after a page reload.
- Authenticated ZIP export from the zero-allowance test account contained the saved caption and hashtags, plus
  video, cover, subtitles and disclosure note. Copying/exporting existing work incurred no generation call.
- Desktop (1280×900) and phone (390×844) layouts checked. Phone document width remained 390px; the full caption
  editor and its actions fit. Temporary viewport overrides were reset after verification.
- Existing publishing-handoff suite: 19 tests passed, including image credits and fallback caption behavior.
  Web typecheck passed. Web lint passed with 0 errors and 2 existing warnings. `git diff --check` passed.
- Final Product Partner review found no actionable regression against the contract. Temporary web/storage
  processes were stopped and the disposable database was dropped; original local web/worker services remain running.

| Before | After | Purpose |
| --- | --- | --- |
| Independent inline fields and Post caption dialog | Saved post details + Edit & copy caption | One draft to review and copy |
| Closing the dialog discarded edits | Visible unsaved state; draft retained for the current reel session | Preserve work without implying it is saved |
| Spend | Production used; covered during free early access | Explain the amount without implying a bill |

This is local workflow and artifact-review evidence. Fresh deployed signup, real account email, uninterrupted
new-reel production and external posting remain outside this pass. The walkthrough itself did not commit,
push or deploy; the founder subsequently requested committing and pushing the reviewed work.
