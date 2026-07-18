# Production Consequence Investigation — Findings

**Date:** 2026-07-18 · **Status:** retrospective record — no architecture proposed or implemented
**Cost:** ~$10 across 16 probe invocations (64 stories) · **Evidence:** full transcripts in [`transcripts/`](transcripts/)

This is a findings document, not a hypothesis and not a spec. It records how a vague quality complaint — *"we're strong with research/information, but genres requiring human taste and experience are lacking"* — was narrowed, through pre-registered experiments, into a small set of concrete engineering decisions. It exists so that later architectural choices (in particular anything touching "consequence-payable premises") are traceable to controlled experiments rather than intuition.

## 1. The question, and how it sharpened

| Stage | Question |
|---|---|
| start | "Why do these stories feel weak?" |
| after 2 genres | "Is the gate over-calibrated, or is production under the bar?" |
| after 5 genres | "Is there one universal failure wearing genre costumes?" |
| after 8 genres | "Where does irreversible consequence get lost between planning and generation?" |
| end | Resolved (layered) — see §4 |

## 2. Method

- **Instrument:** `apps/worker/scripts/probe-genre-lab.ts` — full production chain (Planner → Writer → Editor → Claude Naturalizer → Claude Gate, with the production ≤1 gate-steered rewrite), 2 short (75s) + 2 long (240s) per genre, Taglish, no DB writes. Long runs exercise the long-form writer branch only, not the chaptered scene pipeline.
- **Discipline:** hypotheses pre-registered *before* results (the earned-consequence invariant before drama ran; the Model A/B fork before the Claude reddit arm ran; the writer-reversal condition before the steerability probe ran). Plans were read separately from narrations to localize failures. Null results were accepted (one hypothesis retired earlier the same day: the comfort/likability prior).
- **Judge validity check:** the owner independently ranked stories in two genres; both rankings matched the gate's verdicts. The gate behaved as an editorial critic approximating publishing judgment, not a syntax checker.
- **Known caveats:** temp-1.0 non-reproducibility (transcripts are the artifact); broad probe niches exaggerate register drift; the gate is Claude judging Claude in the Claude-writer arms (mitigated by the gate failing Claude-written stories with independently checkable reasons, and by owner reads — not eliminated).

## 3. Experiments and measured results

### 3a. Full-genre sweep (production config: gpt-4o writer)

| genre | pass | signature failure |
|---|---|---|
| horror | 0/4 | debt unpaid; mood-fade endings |
| informational | 0/4 | knowledge debt — invented mechanism ("durog grafting technique") |
| commentary | 0/4 | conclusion bought on credit; 4/4 register convergence (WRY) |
| general | 0/4 | coincidence-as-meaning |
| comedy | 0/4 | random (not inevitable) escalation; announced punchline |
| drama | 0/4 | posthumous letter pays the emotional debt (3/4 used the device) |
| lifestyle | 0/4 | inspiration replaces decision; worst Taglish garbling |
| documentary | 0/4 | knowledge debt; gate fact-checked from incidental model memory |
| reddit | 0/4 | consequence outsourced to a third party / suspended at the threshold |

Plus a same-day independent reddit run: 1/4 (the one pass, "ML-skins," landed genuine irreversible cost — the capability-exists proof). **gpt-4o total: 1/40.**

### 3b. Claude-writer arms (identical prompts, gate, day)

| genre | pass |
|---|---|
| reddit | 3/4 (only THE DISCOVERY register fell — known-hardest, grammar-split deferred) |
| horror | 3/4 |
| drama | 4/4 |
| commentary | 4/4 |
| **total** | **14/16** |

### 3c. Consequence-steerability probe (gpt-4o + HOUSE RULE demanding on-screen irreversible consequence, injected via the existing channel-DNA seam)

| genre | gate | where the demand died |
|---|---|---|
| horror | 0/4 | **writer** — planner complied (planned irreversible endings); gate enforced the rule by name; the writer re-suspended: consequences "told retroactively with zero dramatized scene" |
| drama | 0/4 | **planner** — plans ignored the rule's structure (2/4 end at the literally-prohibited decision/vow moment) and evaded by **premise selection: dead counterparties** (Mama ×2, deceased clockmaker), making the demanded confrontation structurally impossible |

## 4. Hypotheses and their fates

| hypothesis | fate | decided by |
|---|---|---|
| genres are poorly specified (fix = per-genre prompts) | **falsified** | reddit-gpt-4o: the dilemma-first lens changed *selection*, endings still avoided the line |
| the gate is over-calibrated | **falsified** | genre-true failure reasons + owner rankings matching the gate twice + Claude 14/16 passing the same gate |
| comfort/likability is a sticky planner prior | **retired** (earlier same day) | reversibility experiment: steerable default, both genres complied |
| planner universally monocultures | **rejected** (earlier) | comedy/general planner-only probes: wide subject variety |
| earned-consequence invariant ("resolution without irreversible cost" → final form: *maximum emotional completion before irreversible uncertainty begins*) | **confirmed, named the Production Consequence Invariant** | pre-registered before drama; drama gate verdicts used the word "earned"; operationalized as **Consequence Distance** (causal steps remaining after the final scene — the planner defaults to ending while the biggest consequence is pending) |
| gpt-4o is merely under-constrained | **falsified** | steerability probe: 0/8 under simultaneous DNA + plan + gate constraint |
| Model A (planner bottleneck) vs Model B (writer prior) | **resolved: layered** | horror = writer completion prior (universal); drama adds planner premise-selection evasion on top |
| letter attractor is an aesthetic preference | **reframed** | letters collapse Consequence Distance to zero without rejection risk — the device *is* consequence avoidance |

## 5. Discoveries worth naming

1. **The Production Consequence Invariant** (owner-named): production optimizes for maximum emotional completion before irreversible uncertainty begins. Descriptive law at the *production* level — it emerges from planner × writer interaction and is not (yet) any single component's responsibility.
2. **Consequence Distance**: a countable per-plan metric (causal steps remaining after the final scene). High distance = the story ends while its biggest consequence is pending.
3. **Consequence-payable premises**: the drama planner satisfied a consequence demand *vacuously* — by selecting premises where the price cannot be paid (dead counterparties). Selection-time question: *can this premise ever satisfy the requested consequence?* This is the one concept flagged for eventual RFC treatment (later, not now); it is jurisdictionally a selection-lens concern.
4. **Knowledge debt** (strengthens the Evidence Bible hypothesis beyond the documentary probes): the planner creates information debt that cannot be repaid honestly without an authoritative fact source — fabrication ("durog grafting") is the path of least resistance the system itself incentivizes. The gate sometimes catching it via incidental model memory (bubble-wrap inventors) is evidence the responsibility *exists*, not that it is solved.
5. **The gate is an editorial critic**, not QA — it matched the owner's publishing judgment in both blind-ish comparisons. Its role in the product should eventually be described that way.
6. **Attractor catalog additions** (see memory: `planner-attractor-catalog`): horror atmosphere-fade, informational misconception-flip, commentary reflection-without-cost, general coincidence-as-meaning, comedy random-escalation — all candidates (N=4 each); drama device-attractor remains the only DNA-confirmed one, now explained by (3).

## 6. Decisions taken / pending

- **Writer:** owner's pre-registered retention condition for gpt-4o ("produces earned endings under a stronger planner contract") resolved negative. Recommendation reversed to **Claude as default story writer**, pending (a) owner personally reading the Claude-arm transcripts, (b) **one production reel end-to-end** — the pipeline (TTS, pacing, captions, scenes, music) can amplify or erase script differences; the reel is the product.
- **Auto-produce:** held while the writer is gpt-4o (would ship gate-failed stories ~97%); revisit after the writer decision (~87% measured pass on Claude).
- **PR #2:** reddit carved out; landing set orthogonal to the invariant (safe, not sufficient); naturalizer-routing lap effectively validated by the sweep (Claude naturalizer ran on all stories; all three discard guards observed firing); final lap = the one production reel above.
- **Genre Craft Acquisition (Part 2):** unfrozen but resequenced after the writer decision; **reframed** — its job is no longer rescuing publishability (the writer change largely does that) but measuring *distinctiveness beyond a publishable baseline*: publishable → memorable.
- **No architecture built.** Explicitly rejected today: Planner Consequence Engine, Consequence Grammar, Irreversibility Layer, Resolution Model. What was earned is a research question and this record.

## 7. Unresolved questions

1. Can a selection-lens test for consequence-payable premises steer the drama planner, or is the evasion lens-resistant like the device-attractor? (Next natural experiment; planner-only, cheap.)
2. Does the Claude writer hold up through the full pipeline and on platform metrics? (The one-reel test, then performance data.)
3. THE DISCOVERY register grammar-split (deferred; do not patch globally).
4. Witness-narrator physics: reword "narrator must drive events" → "narrator must be causally entangled" when physics text is next touched (owner ruling; not yet applied).
5. Comedy funniness and informational/documentary factual authority remain outside what a writer change fixes (the latter is the Evidence Bible's held territory).
6. Same-vendor gate caveat: consider an occasional cross-model gate audit once the writer decision lands.
