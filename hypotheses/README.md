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

- [narrative-planning-grammar.md](hypotheses/narrative-planning-grammar.md) — the **selection lens / lens-authoring discipline** that shapes what the Planner *selects* (the "layer" and "five orthogonal dimensions" framing is explicitly under test, not asserted). Earned its evidence by **repeatedly explaining planner behavior** across reddit, informational, and horror. Not blocking anything today.
- [evidence-bible.md](hypotheses/evidence-bible.md) — the owner of **factual truth**, peer to the Story Bible. Earned its evidence because its **absence causes a product failure no existing layer catches** (a documentary shipped a debunked myth, gate-approved). Will block documentary implementation — but only when documentary is actually built.
- [real-places.md](hypotheses/real-places.md) — the owner of **depictive fidelity** (does what's shown depict the *real* place?), the visual sibling of the Evidence Bible. Candidate mechanism: auto-source real place photos into the existing `referenceImageKey` slot. The "depictive fidelity is a responsibility" framing is explicitly under test; the whole proposal is gated on one throwaway spike (does place identity survive across shots?). Waits behind the same bar as the Evidence Bible — factual must be a committed product.
