export type RecoveryStep = {
  id: string
  stepName: string
  status: string
  error: string | null
}

export const MISSING_FAILURE_DETAIL = 'The last take stopped before details were saved.'

// Permanent failures normally carry a failed row. Reels stranded by the older recorder bug may have only
// successful substep rows; the newest durable row is then the safest product-only resume boundary.
export function recoveryStep(
  failed: RecoveryStep | null | undefined,
  latestDurable: RecoveryStep | null | undefined,
): RecoveryStep | null {
  return failed ?? latestDurable ?? null
}
