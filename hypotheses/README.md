# Hypotheses — candidate architecture, not yet earned

These documents describe architecture that has **evidence but has not earned implementation**. They are deliberately kept separate from `/specs` to signal a different level of commitment and to prevent *spec drift* — a thoughtful hypothesis gradually being treated as if it were already part of the system.

| Directory | Meaning |
|---|---|
| `/specs` | Describes the **current or intended** architecture — on the path to (or already in) implementation. |
| `/hypotheses` | Describes **candidate** architecture — justified by concrete evidence, but not yet built and possibly never built. |

A document graduates from `/hypotheses` to `/specs` (and only then toward code) when it clears the final bar: **the engine is blocked without it.** Until then, the hypothesis carries the knowledge perfectly well on its own.

**Death path (a hypothesis can lose, and that's valuable).** Falsifiability is required, so retirement must be defined too. When a hypothesis is falsified, do **not** delete it — move it to `hypotheses/retired/` (or mark it `Status: retired`) with a one-paragraph **why it died** and the evidence that killed it. A rejected hypothesis plus its evidence is more useful than its absence: it stops the same idea being re-proposed from scratch. Three end-states: **graduate** (→ /specs), **remain provisional** (stay here), or **retire** (→ retired, with reason).

**Process note — this tier is working as intended.** Its first cohort already spans two of the three end-states plus a strengthen-in-place — and, notably, **nothing has graduated**: one hypothesis *strengthened* but stays a hypothesis (Evidence Bible — responsibility accepted, graduation still blocked until documentary is a committed product), one *narrowed* to a tighter claim (Narrative Planning Grammar — "lever" kept, "five-dimension layer" demoted to candidate), and one *retired* (the "comfort/likability planner prior" — a controlled experiment showed it was a steerable operator default, not a planner responsibility; see [retired/](retired/)). That spread is the evidence the process reduces speculative architecture rather than multiplying it.

## What every hypothesis here must contain

- Emerged from **multiple concrete failures or observations**, not intuition.
- Explains behavior that **existing concepts could not**.
- Explicit **non-goals** (what it must never own).
- A stated **falsifiability or adoption threshold**.
- A **"strongest known objection"** section — the doc's own best counter-argument, held to the same rigor as its case. Persuasive docs resist falsification socially even when they invite it formally; this section is the antidote.
- It **does not drive implementation**.

## How to review a hypothesis

Reviewers: **do not bikeshed names or implementation.** Those are downstream. Test the *architecture* with four questions:

1. **Is this genuinely a missing responsibility?** Could an existing concept (Story Bible, Story Modes, the Planner) reasonably own it instead?
2. **Is the boundary clean?** Is anything in it that belongs elsewhere — or anything important missing?
3. **Would removing this hypothesis make a future product materially harder to build or reason about?** If not, it has not yet earned first-class status.
4. **Does it overreach?** Is it trying to solve problems it shouldn't own?

Then one falsification question — framed to produce a roadmap, not a debate:

5. **What future product would most likely break this hypothesis?** Not "can you think of a counterexample?" but "which product should we build *next* if we wanted to prove this wrong?" That turns an objection into the next experiment. Candidate stress-tests to weigh: live sports commentary · comedy · interactive fiction · debate · educational tutorials · children's bedtime stories.

## Current hypotheses

- ~~[ebn-cited-editor.md](ebn-cited-editor.md)~~ — **RETIRED 2026-08-31.** A controlled nine-draft probe
  produced only **1/9** mechanically valid Editor candidates; eight missed the duration contract and one also
  crossed a claim-evidence boundary. Matched regeneration was 0/9 valid, so 17/18 comparisons resolved on hard
  constraints rather than taste. Loosening lineage would turn the Editor into a second Writer, so no stage is
  added. Exact Anthropic spend: **$0.76**.
- [narrative-planning-grammar.md](hypotheses/narrative-planning-grammar.md) — the **selection lens / lens-authoring discipline** that shapes what the Planner *selects* (the "layer" and "five orthogonal dimensions" framing is explicitly under test, not asserted). Earned its evidence by **repeatedly explaining planner behavior** across reddit, informational, and horror. Not blocking anything today.
- [evidence-bible.md](hypotheses/evidence-bible.md) — the owner of **factual truth**, peer to the Story Bible. Earned its evidence because its **absence causes a product failure no existing layer catches** (a documentary shipped a debunked myth, gate-approved). Will block documentary implementation — but only when documentary is actually built.
- ~~real-places.md~~ — **GRADUATED 2026-08-12 → [specs/depictive-fidelity.md](../specs/depictive-fidelity.md).** The responsibility outgrew its motivating example: it now covers every class of real subject (places, objects, animals, and real people), with the human path split by the depictive-ethics floor into conditioning plates for long-dead figures and presented archival photographs for living ones. The "depictive fidelity is a responsibility" framing stopped being under test once *four* subject classes needed one answer to the same question.
- [identity-conditioning.md](identity-conditioning.md) — the **unsolved mechanism fork** that depictive fidelity deliberately routed around: a real place wants `/edit` (copy the pixels), a real person wants an identity model (re-synthesise the face). Spike-gated; nothing wired.
- [multi-tenant.md](hypotheses/multi-tenant.md) — the **inverse of the others**: not a responsibility to claim but a build to *defer*. Named the recurring "let other people use it / productize" pull and held it off until three conditions fire. **Partially overridden 2026-07-21**: the owner chose to build the app-layer tenancy (Auth.js accounts + `channels.userId` + admin console) ahead of the trigger; see the doc's update note. The infra question it gestured at now lives in the scaling doc below.
- [scaling-concurrent-users.md](hypotheses/scaling-concurrent-users.md) — the successor one layer down: once tenancy exists, **how the async pipeline serves many users**. Names five bottlenecks observed in the worker/queue code (one global `concurrency=2` queue; a per-process provider limiter that breaks under horizontal scale; inert distributed-throttle seam; no fairness/quotas; single global scheduler) and a trigger-gated phasing (safety pieces gated on specific unsafe actions — 2nd worker, 1st paying user — throughput pieces gated on measured load). Not blocking anything today; scales on evidence.
- [ebn-byo-fact-check.md](hypotheses/ebn-byo-fact-check.md) — the only candidate mechanism for **creator-written scripts on Evidence-Based channels** (rejected outright by decision-log 2026-08-03-001: one production entrypoint per story mode). Claim under test: the Fact-Fidelity Checker can grade *human* prose against a supplied dossier via claim reconstruction — it has only ever been validated on generated narration that carries its own citation map. Probe-gated AND demand-gated (a real creator must ask); even a perfect probe proves similarity, not provenance, so graduation also needs a founder-ratified product stance. Not blocking anything today.
