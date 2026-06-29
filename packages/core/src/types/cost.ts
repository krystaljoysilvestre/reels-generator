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
