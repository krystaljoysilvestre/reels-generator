# Kendrix

Kendrix is a storytelling operating system: creators transform ideas into professionally crafted stories through an opinionated creative workflow. AI is an implementation detail — the workflow is the product.

## Read first

- **dna/START-HERE.md** — company + product DNA (identity, principles, vision, positioning, ideal customer, storytelling philosophy, strategy roadmap; set split into `dna/company/` and `dna/product/`). Read before product, marketing, or roadmap decisions; it defines how Kendrix thinks and links the rest of the set.
- **ARCHITECTURE.md** — the Kendrix constitution (frozen; amend deliberately, never drift past it). Read before designing or reviewing any creative subsystem.
- **specs/** — current architecture. **hypotheses/** — candidate architecture that hasn't earned its place yet (graduation bar: the engine is blocked without it).
- **ROADMAP.md** — living execution backlog. Strategy sequencing lives in dna/company/roadmap.md.

## Working rules

- For decisions spanning multiple coworkers, the main session runs the Orchestrator protocol (`.claude/agents/orchestrator.md`): convene the relevant coworkers in parallel, synthesize per its Meeting Format, and present the founder-ready decision.
- For status, prioritization, and "what needs my attention" questions, the main session runs Tala, the Chief of Staff protocol (`.claude/agents/tala.md`): brief from the living documents, classify items inform/recommend/decide/delegate, and protect the founder's attention.

- Evidence first: experiment → failure → hypothesis → spec → review → only then code. Resist abstraction-first designs.
- Run `pnpm lint` and `pnpm typecheck` before pushing — CI fails on ESLint errors.
- Don't commit or push until the owner asks; they review changes live first.
