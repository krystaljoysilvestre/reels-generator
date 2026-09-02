import { baseStepName } from '@reels/core'

export function hasFailedAttemptForStep(
  rows: ReadonlyArray<{ stepName: string; status: string }>,
  stepName: string,
): boolean {
  return rows.some((row) => row.status === 'failed' && baseStepName(row.stepName) === stepName)
}
