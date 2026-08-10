# Current Metrics

---

Status: Active

Owner: Finance & Operations Partner

Approver: Founder

Review Frequency: Weekly

Purpose: Living Strategy

Depends On:

* company/metrics.md
* company/roadmap.md
* company/pricing.md

Current Phase (authority: company/roadmap.md):

Phase 0 — Foundation

Last Updated:

2026-08-10

---

## Purpose

This document captures Kendrix's current operating metrics.

Unlike `metrics.md`, which defines timeless measurement philosophy, this document reflects today's reality.

Everything in this document is expected to change as Kendrix evolves.

This weekly review is the heartbeat that feeds the monthly roadmap and metrics reviews.

A metric that is not yet measured says so explicitly. An honest "not yet measured" beats an impressive guess.

---

## Current Phase Objective

Current Goal

Build a reliable storytelling workflow that consistently produces publishable, high-quality stories.

Current Bottleneck

**Packaging and surface — not story.** No reel has yet cleared the founder's own publish bar, and as of 2026-08-10 the reason is diagnosed rather than guessed at.

**The publish-bar audit ran on 2026-08-10** (Priority 1, open since 08-07). The founder watched all three rendered reels — Crossroads (2026-07-30), Emberlight (2026-08-04), Edge of Everything (2026-08-05) — and named the disqualifiers unprompted:

1. *"The thumbnails are not post-worthy. We need to look how current content creators do it. Same goes with their titles."*
2. *"The burned caption styles look so old."*
3. *"These 3 reels just ended."*

**This is the most important result of the last seven weeks, and it relocates the bottleneck.** Nothing named is story quality — not premise, not writing, not believability, not the ending *criteria*, which is what every automated judge and probe has been measuring. Two of the three items are **not even inside the video**: the thumbnail and the title are the packaging a viewer sees before deciding to watch. The third is a surface treatment. The engine was producing publishable *stories* wrapped in unpublishable *packaging*, and **no instrument we own looks at packaging.**

This also vindicates this document's own standing risk note: *the most reliable quality instrument we own is the founder declining to publish, and we left it unread for seven weeks.*

The previous bottleneck entry — *story believability*, from the 2026-07-19 fingerprint audit — is **retired, and now retired with a cause rather than only a suspicion.** The intermediate hypothesis that the defect lived somewhere in the watched artifact (look, voice, timing, mix) was **half right and importantly incomplete**: it was right that the text was not the problem, and wrong to assume the artifact meant the *video*. Two of three disqualifiers sit outside the frame entirely.

Only one primary bottleneck should exist at any given time.

**Correction of record.** This document previously stated that all three reels sit at `spot_check`. **Crossroads is at `storyboard`** — it has a finished render and a render asset but never advanced. The other two are at `spot_check`. Unrelated to the audit result; recorded because the number was wrong.

---

## North Star

Current North Star

Customer Zero consistently publishes high-quality stories using Kendrix.

---

## Current Priorities

Priority 1

**Close the packaging gap the audit named, then re-ask the publish question.** The audit is *done* — this is its repair, and it is deliberately scoped to exactly what the founder named. Shipped in the same lap (2026-08-10, uncommitted at time of writing):

* **Thumbnail** — was wrong at the concept level, not the styling level: the composition burned the *whole title* at 64–92px in `system-ui`. Now a separate `thumbnailText` field (3–5 words) and one chosen house treatment. Four candidate treatments × two fittings were rendered from the founder's own hero frames — 28 candidates — and the founder's marks settled it; the losers were **deleted, not left behind a prop**.
* **A defect found while rendering those candidates, worse than the styling.** A vertical reel's hero frame is 768×1344 and the 16:9 thumbnail cropped it with `objectFit: cover`, keeping **32% of the height, centred**. Vertical composition does not put its subject in the middle — Emberlight's hero is a child atop a glowing ladder in the upper 6%, and the shipped thumbnail discarded them. Portrait frames are no longer cropped.
* **Titles** — `post-meta.v1` optimised for restraint (*"no clickbait caps… intrigue comes from the story"*) on the one surface that rewards a curiosity gap, producing filenames like *"the one second thing"*. Now requires a real gap while keeping every honesty ban (ALL-CAPS, emoji, fake urgency, unpaid-off promises).
* **Captions** — `352f3a1` replaced the presets but remapped only the preset *id*; the render step reads the stored **resolved** style, so all three channels kept their old font, size, animation and stroke. A legacy style is now re-resolved through its replacement on read, preserving genuine creator tweaks (Crossroads' `#0057b8` brand blue survives; the two channels storing untouched defaults adopt their replacement whole).
* **Endings** — **build nothing.** Already fixed by `e712dbe` (08-06); all three reels predate it. An additional text-layer ending fix was built and **reverted** (decision-log 2026-08-06-003) because the founder marked 12/12 unseen closes as ending properly. More ending machinery is the one item here with evidence *against* it.

**Then the question that closes the loop: *would you publish this now?*** Asked on re-rendered reels — the same instrument the audit just proved is the most reliable one we own, pointed at a changed artifact.

Priority 2

**Whatever the re-ask names.** Deliberately unassigned, for the same reason Priority 1 was unassigned before the audit ran: the seat is chosen by evidence, not by prediction. If packaging was the whole of it, this becomes *first publish*. If new reasons surface, they get diagnosed on the same terms — the audit is repeatable.

Note on routing, now that the audit has run: the disqualifiers landed on **packaging**, a surface with no owning coworker seat. Story → Editorial Director, Look → Visual Director, Sound → Sound Director all existed and none of them owns a thumbnail or a title. Worth watching whether that gap recurs.

Priority 3

**First publish.** The Phase 0 → Phase 1 gate, and the only source of the audience evidence Phase 1's exit criteria require. Blocked behind Priority 2 by judgment, not by mechanics: the manual path (`export-post-package` → upload → `mark-published`) is complete, and the API path needs only a ~30-minute OAuth setup (`YOUTUBE_*` keys are unset today).

**Demoted from the previous period:**

* *Universal Writer fix (was Priority 1)* — the plan-level judge-and-force mechanism is **built, merged, and switched off**. `STORY_PLAN_GATE` exists on main but is unset in the environment, so all three declined reels were produced without it. Turning it on is a one-line experiment, but it is not obviously the constraint and should not be assumed to be.
* *Factual grounding / EBN (was Priority 2)* — substantially **done and merged**. Slice 1 (factual text path), Slice 2 (illustrative rendering profile + disclosure), the depictive-ethics floor, and the standalone opt-in fact gate are all on main. Remaining work (Tier B data-driven visuals, the paid EBN look-check lap) is deferred behind a real signal.

---

## Creator Success

| Metric                     | Current | Trend |     Target | Notes |
| -------------------------- | ------: | :---: | ---------: | ----- |
| Stories Published          |       0 |   →   |     Weekly | **Not a pending task — a repeated outcome.** 3 renders, 3 channels, 3 weeks, none approved. Cause now diagnosed: packaging, not story (2026-08-10 audit) |
| Publishing Consistency     | Not yet started |   →   |     Weekly | Begins when the first reel clears the publish bar |
| Customer Zero Satisfaction | Failing, first honest reading |   →   |  Improving | The founder declines to publish own output. This is the reading; it was previously recorded as "not yet measured" |
| Workflow Completion        | 2 at `spot_check`, 1 at `storyboard` |   →   | Increasing | The pipeline completes end-to-end. Approval is where it stops, every time. **Corrected:** Crossroads was previously recorded as `spot_check`; it has a finished render but never advanced past `storyboard` |

---

## Product Quality

| Metric               | Current | Trend |     Target | Notes |
| -------------------- | ------: | :---: | ---------: | ----- |
| Editorial Pass Rate  | Not systematically tracked |   →   | 60% first-attempt | First recorded gate pass 2026-07-20 (children's). The ending criteria that were suppressing it were reverted 2026-08-06 |
| Story Quality Review | No detectable text-level defect |   ↑   |  Improving | 2026-08-06-003: the founder marked 12/12 unseen closes as ending properly; judge/ear agreement was exactly chance. Supersedes the 0/12 fingerprint reading for TEXT |
| Watched-Reel Quality | **First reading taken: 3/3 declined** |   →   |  Improving | Publish-bar audit 2026-08-10. The named causes were thumbnails, titles and caption styling — **2 of 3 sit outside the video**. Story quality was not named by any of the three |
| Packaging Quality | **Unmeasured, and it is where the bottleneck moved** |   →   |  Improving | Thumbnail + title + caption surface. No instrument we own examines it, and no coworker seat owns it. Created by the 2026-08-10 audit |
| Visual Consistency   | Qualitative only |   →   |  Improving | Story Bible + reference conditioning shipped; Visual Director baseline audit still unrun |
| Audio Quality Review | Qualitative only |   →   |  Improving | Sound Phase A + B shipped; the cross-register blind ear A/B that gates them has not been recorded |

---

## Operational Health

| Metric                        | Current | Trend |     Target | Notes |
| ----------------------------- | ------: | :---: | ---------: | ----- |
| Generation Success Rate       | Not yet measured |   →   |       >95% | 3 of 3 recent renders completed; too small a sample to state a rate |
| Average Story Generation Time | Not yet measured |   →   |     Stable |       |
| Average AI Cost per Story     | ~$7.60 short-form · ~$8.69 long-form |   →   | Decreasing — never at taste's expense | Two measured laps (2026-07-24, 2026-08-03). Cost accounting is live; residual leaks tracked in the execution backlog |
| Production Reliability        | Improving |   ↑   |  Improving | Timeouts, reaper, step ceilings sized from a real long-form render; concurrent clip/upload overlap landed |

---

## Business Health

Current phase does not optimize business metrics.

Monitor only.

| Metric             |          Current | Trend | Notes                   |
| ------------------ | ---------------: | :---: | ----------------------- |
| Revenue            |                — |   →   | Informational           |
| Active Creators    |    Customer Zero |   →   | Informational           |
| Willingness to Pay | Not yet measured |   →   | Roadmap phase dependent |
| Fixed Costs        | kendrix.io $50/yr |   →   | Domain, Cloudflare Registrar (2026-08-04-001) |

---

## Active Experiments

Each experiment tests a named assumption in company/assumptions.md.

| Experiment | Hypothesis | Expected Metric Impact | Status |
| ---------- | ---------- | ---------------------- | ------ |
| **Publish-bar audit** | The reason no reel gets published is nameable, and lives in the watched artifact rather than the text | Identifies the true bottleneck | **CLOSED — hypothesis confirmed, and its second half falsified (2026-08-10).** Nameable: yes, in one sitting, unprompted. "In the watched artifact": **wrong for 2 of 3** — thumbnails and titles are outside the video entirely. $0, as predicted. The instrument is repeatable and should be re-run after the packaging repair |
| Packaging repair | The named disqualifiers are packaging, not story, and fixing them changes the publish answer | Stories published 0 → ≥1 | **OPEN (2026-08-10).** Thumbnail treatment chosen from 28 rendered candidates on the founder's own frames; portrait-crop defect fixed; titles retuned; legacy caption styles re-resolved. Falsifier: the founder still declines, and names something new |
| Overlay text needs a gate, not guidance | Naming the exact failure in the prompt is enough to stop a thumbnail overlay drifting vaguer than its title | Packaging quality ↑ | **NEGATIVE, n=4 (2026-08-10).** `post-meta.v1.3` names the failure verbatim — *"AI Takes Over?" is WRONG, "HALF THE JOBS" is right* — and the same reel still returned `AI Takes Over Offices`. 2 of 4 improved, 1 clear win. Consistent with craft-needs-judgment-not-asking; **no gate built** — n=4 does not clear the machinery bar |
| Judge-and-force at the plan level | Structural agency failures are fixed by forced re-planning, not line rewrites | Editorial pass rate ↑ | Built and merged; `STORY_PLAN_GATE` **unset**, so it has never run in production. n=3 probe was clean (3/3 control-FAIL→forced-PASS). Open: does it change a reel the founder would publish? |
| Bounded edits for weak endings | A weak close can be repaired in place instead of re-rolling the story | Editorial pass rate ↑ | **CLOSED — rejected (2026-08-06-002).** Judge said 6/6 repaired; the founder preferred the repaired close in at most 2/6. Mechanism kept and uncommitted; the taste driving it failed |
| Endings are three layers | Reels "just stop" because nothing ends — cinematically, narratively, psychologically | Perceived completeness ↑ | **PARTIALLY CLOSED (2026-08-06-003).** TIME layer validated and kept ("it's so much better now"). TEXT layer reverted — it generalized a viewing complaint into a writing complaint |
| Prescribe variation, not shortness | The sentence-rhythm monoculture is self-inflicted by "short lines" prompts | Story quality review ↑ | Shipped (PR #14, 2026-07-20); children's-validated only. Cross-genre regression sweep still open |

---

## Current Risks

* **~~The founder's bar is undiagnosed.~~ RETIRED 2026-08-10 — the audit ran.** Replaced by a narrower and more actionable risk: **we have no instrument that looks at packaging.** Every judge, probe and gate we own examines story text or the assembled video. Thumbnails, titles and the caption surface — where the founder's three disqualifiers actually landed — are measured by nothing and owned by no coworker seat. The founder's eye is currently the only reading available, which is exactly the situation the row below warns about.
* **The repair was scoped by one sitting with three reels, two of them the same 55s vertical format.** A packaging treatment chosen on that sample may not hold for the 7:38 long-form or for a channel whose hero frames are photographic rather than painterly. Cheap to re-test; worth re-testing before it is called settled.
* **Our automated quality instruments do not track the founder's ear.** Demonstrated twice in one week, in opposite directions (2026-08-06-002, -003). Any plan whose success criterion is an LLM judge should be treated as unvalidated by default.
* **Marketing surface is running ahead of product proof.** kendrix.io, the landing page and a hero trailer now on its fourth cut all describe a product that has published nothing. Legitimate under the Phase-0 build-in-public mandate, but the gap is widening and the trailer's own acceptance gate (a blind recall test with an outsider) has not been run.
* **Unattended reliability is unproven.** No production lap has completed without supervision.
* **Long-form auto-publish is blocked by the YouTube uploader** — whole file held in memory, no resume. Non-issue at short-form sizes; a real blocker at ~1GB.

---

## Key Learnings

From the current period (2026-07-23 → 2026-08-10):

* **Ask the instrument.** Seven weeks of story-quality work were aimed at a layer the founder never named. Thirty minutes of watching relocated the bottleneck to a surface no probe had ever examined — and two of the three disqualifiers were not even inside the video. The audit cost $0 and should have run in week one.
* **"Not the text" did not mean "the video".** The prior bottleneck entry correctly retired story text and then narrowed too fast, assuming the defect had to live in look/voice/timing/mix. It lived in the packaging around the artifact. When eliminating a layer, do not assume the next-nearest layer inherits the blame.
* **The most reliable quality instrument we own is the founder declining to publish** — and we left it unread for seven weeks while building automated judges that contradicted it.
* **Rendering the candidates found the real bug.** The thumbnail defect that mattered most — a 16:9 centre crop discarding 68% of a portrait frame, subject included — was invisible in the code and obvious the moment real frames were rendered side by side. Build the cheap preview harness before theorising about a visual surface.
* **Naming a failure in a prompt does not fix it.** `post-meta.v1.3` states the exact failing overlay and the exact right answer, and the same reel reproduced the failure anyway (n=4). This is the fourth independent instance of soft guidance being satisficed. Treat prompt wording as a weak lever by default and reserve mechanism for what must hold.
* **A judge that agrees with itself proves nothing.** The ending criteria validated against nothing but their own judge; measured against the founder's ear, agreement was exactly chance.
* **Diagnose the layer the complaint actually lives in.** "Our reels just stop" was a complaint about watching, and had a timing fix. Generalizing it into a writing complaint cost two laps and shipped criteria that had to be reverted.
* **Pre-registering the interpretation works.** Both negative results were unarguable afterward because the decision rule was written before the data was seen. Keep doing this.
* **A negative result is cheap if the mechanism survives.** Bounded edits failed on taste, but the prefix guarantee held 28/28 and all four guards proved load-bearing — a reusable chassis for any future edit region.

Carried forward from earlier periods and still standing: craft needs judgment not asking; raw writer output ≈ final output; the gate cannot self-check facts; goal-first genre architecture works; prescribed surface features become monoculture.

---

## Decisions Made

Major decisions are recorded in company/decision-log.md; this section lists the period's entries.

* **2026-08-06-003** — The endings complaint was about TIME, not TEXT; the text-layer criteria rest on a misdiagnosis and were reverted.
* **2026-08-06-002** — Bounded edits do not ship; a blind read overruled every automated signal.
* **2026-08-06-001** — Endings are three layers (the TIME layer of which survives).
* **2026-08-04-001** — Kendrix's public home is kendrix.io.
* **2026-08-03-001** — EBN accepts no ungrounded narration; one production entrypoint per story mode.
* **2026-07-24-001** — EBN leads with Historical Events / documentary, not True Crime.
* **2026-07-25** — The depictive-ethics floor ratified (floors-are-law) and implemented; now on main.

Shipped this period without needing a decision entry: EBN Slices 1 + 2, voiceover perspective + depiction gate, the standalone opt-in fact gate, budget/caption hardening, Sound Phases A and B (Phase C spiked → parked), multi-platform channels, the channel clarify loop, the script shelf, publishing schedules, the storyboard cutting room, the Kendrix rebrand, kendrix.io + landing, and the hero trailer. 61 commits, all pushed.

---

## Next Review

Date

2026-08-14

Questions

* What did the publish-bar audit name, and which seat owns it?
* Has the bottleneck statement earned a specific cause yet?
* Did anything get published?
* Which assumptions were validated? Which failed?
* Does the roadmap phase still accurately describe the company?
