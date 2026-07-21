// Per-reel cost accumulation.
// Halt + flag if a reel exceeds its budget cap. [M7]

export const DEFAULT_BUDGET_CAPS_CENTS = {
  short: 800,         // ~$8 (expected ~$4-5 + retry buffer)
  compilation: 1500,  // ~$15 (reuses assets; mostly connective tissue + render)
} as const

export type ReelType = keyof typeof DEFAULT_BUDGET_CAPS_CENTS

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

// ── Per-user limits (multi-tenant cost safety) ──────────────────────────────
// A coarse gate at reel-CREATION, complementing the per-reel assertBudget (mid-render cutoff): the
// reel cap stops one runaway reel; these stop many reels draining a user's wallet. Env-overridable so
// the owner can raise the default without a deploy; per-user overrides live on users.{monthly_budget_cents,daily_reel_quota}.
export const DEFAULT_USER_LIMITS = {
  monthlyBudgetCents: Number(process.env['DEFAULT_USER_MONTHLY_BUDGET_CENTS'] ?? 5000), // ~$50/mo
  dailyReelQuota: Number(process.env['DEFAULT_USER_DAILY_REEL_QUOTA'] ?? 20),
}

export type UserLimits = { monthlyBudgetCents: number; dailyReelQuota: number }
export type UserUsageSnapshot = { spendCentsThisMonth: number; reelsToday: number }

export class QuotaExceededError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'QuotaExceededError'
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
