// Per-reel cost accumulation.
// Halt + flag if a reel exceeds its budget cap. [M7]

export const DEFAULT_BUDGET_CAPS_CENTS = {
  short: 800,         // ~$8 — legacy flat floor; used when a reel's length is unknown (see budgetCapForSeconds)
  compilation: 1500,  // ~$15 (reuses assets; mostly connective tissue + render)
} as const

export type ReelType = keyof typeof DEFAULT_BUDGET_CAPS_CENTS

// Per-reel budget cap SCALED BY LENGTH. A flat $8 false-failed two legitimate cases: (1) a long-form
// (~180s) reel has more scenes + more TTS, and (2) an all-scenes-animated reel spends ~7¢/s on i2v — an
// 85s reel hit $7.60, one scene from stranding under the flat cap (2026-07-24 News Today PH production).
// The cap must scale so those don't hard-fail mid-render, while staying a real runaway-spend backstop.
// Model: a base (LLM + images + voice + music, roughly length-independent) + a generous per-second
// allowance that covers all-scene animation plus retries; bounded so it stays a backstop, not a blank cheque.
export const BUDGET_CAP_BASE_CENTS = 400          // ~$4 non-animation floor
export const BUDGET_CAP_PER_SEC_CENTS = 9         // ~9¢/s ≥ the ~7¢/s i2v rate → headroom for all-animated + a retry
export const BUDGET_CAP_MAX_CENTS = 3000          // ~$30 ceiling — a runaway loop still can't burn unbounded
export function budgetCapForSeconds(targetSeconds: number | null | undefined): number {
  const t = typeof targetSeconds === 'number' && targetSeconds > 0 ? targetSeconds : 75
  return Math.min(BUDGET_CAP_MAX_CENTS, Math.max(DEFAULT_BUDGET_CAPS_CENTS.short, BUDGET_CAP_BASE_CENTS + Math.round(t * BUDGET_CAP_PER_SEC_CENTS)))
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly reelId: string,
    public readonly costCents: number,
    public readonly capCents: number,
  ) {
    super(
      `Reel ${reelId} exceeded budget cap: ${costCents}¢ > ${capCents}¢ (~$${(capCents / 100).toFixed(2)})`,
    )
    this.name = 'BudgetExceededError'
  }
}

export function assertBudget(reelId: string, costCents: number, capCents: number): void {
  if (costCents > capCents) {
    throw new BudgetExceededError(reelId, costCents, capCents)
  }
}

// ── App-wide daily spend kill-switch ────────────────────────────────────────
// A backstop against a runaway loop / leaked key / many tenants summing past what the per-user caps
// bound — the per-user monthly cap protects one wallet, this protects the whole app. Env-configured;
// empty/invalid = OFF (no ceiling), so it's inert until an operator sets it. Enforced in the worker
// harness before every paid step.
export const GLOBAL_DAILY_SPEND_CAP_CENTS: number | null = (() => {
  const raw = process.env['GLOBAL_DAILY_SPEND_CAP_CENTS']
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
})()

export class GlobalBudgetExceededError extends Error {
  constructor(
    public readonly spentTodayCents: number,
    public readonly capCents: number,
  ) {
    super(
      `App-wide daily spend cap reached: ${spentTodayCents}¢ >= ${capCents}¢ (~$${(capCents / 100).toFixed(2)}). Paid steps are halted until the cap resets or is raised.`,
    )
    this.name = 'GlobalBudgetExceededError'
  }
}

// Throws when the app's spend today has reached the configured global cap. No-op when the cap is unset.
export function assertGlobalDailyBudget(spentTodayCents: number): void {
  if (GLOBAL_DAILY_SPEND_CAP_CENTS !== null && spentTodayCents >= GLOBAL_DAILY_SPEND_CAP_CENTS) {
    throw new GlobalBudgetExceededError(spentTodayCents, GLOBAL_DAILY_SPEND_CAP_CENTS)
  }
}

// ── Per-user limits (multi-tenant cost safety) ──────────────────────────────
// A coarse gate at reel-CREATION, complementing the per-reel assertBudget (mid-render cutoff): the
// reel cap stops one runaway reel; these stop many reels draining a user's wallet. Env-overridable so
// the owner can raise the default without a deploy; per-user overrides live on users.{monthly_budget_cents,daily_reel_quota}.
export const DEFAULT_USER_LIMITS = {
  monthlyBudgetCents: Number(process.env['DEFAULT_USER_MONTHLY_BUDGET_CENTS'] ?? 5000), // ~$50/mo
  dailyReelQuota: Number(process.env['DEFAULT_USER_DAILY_REEL_QUOTA'] ?? 20),
}

// How many reels one user may have building at once. Bounds concurrent in-flight spend so a burst of
// reel-creates can't all clear the (lagging) create-time budget gate at $0 and then run past it in
// parallel — a companion to the mid-pipeline assertUserBudget re-check. Env-overridable.
export const MAX_INFLIGHT_REELS_PER_USER = Number(process.env['MAX_INFLIGHT_REELS_PER_USER'] ?? 5)

export type UserLimits = { monthlyBudgetCents: number; dailyReelQuota: number }
export type UserUsageSnapshot = { spendCentsThisMonth: number; reelsToday: number }

export class QuotaExceededError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'QuotaExceededError'
  }
}

// Mid-pipeline enforcement of the monthly budget: the create-time checkUserLimits gate is lagging (a
// burst passes at $0, then accrues), so the worker harness re-checks the owner's month-to-date spend
// before every paid step and throws this (terminal) once the cap is reached. Admins are exempt upstream.
export function assertUserBudget(spendCentsThisMonth: number, monthlyBudgetCents: number): void {
  if (spendCentsThisMonth >= monthlyBudgetCents) {
    throw new QuotaExceededError(
      `Monthly budget reached ($${(monthlyBudgetCents / 100).toFixed(2)}). This reel was stopped; ask the admin to raise the cap.`,
    )
  }
}

// Pure policy check (no DB). Callers load usage + the user's effective limits and pass them in.
export function checkUserLimits(
  usage: UserUsageSnapshot,
  limits: UserLimits,
): { ok: true } | { ok: false; reason: string } {
  if (usage.reelsToday >= limits.dailyReelQuota) {
    return { ok: false, reason: `Daily limit reached (${limits.dailyReelQuota} reels/day). Try again tomorrow.` }
  }
  if (usage.spendCentsThisMonth >= limits.monthlyBudgetCents) {
    return { ok: false, reason: `Monthly budget reached ($${(limits.monthlyBudgetCents / 100).toFixed(2)}). Ask the admin to raise it.` }
  }
  return { ok: true }
}
