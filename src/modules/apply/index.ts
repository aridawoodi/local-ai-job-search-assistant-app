import type { AppPreferences } from '../../shared/preferences'
import type { ApplyResult } from '../../shared/types'

/**
 * Apply workflow placeholder.
 * Fills / submits in the real browser according to applySafety:
 * - confirm: pause and ask the user before submit
 * - unattended: proceed after setup without per-job confirmation
 * User logs in manually; app only reuses sessions.
 */
export async function applyToJobs(
  jobIds: string[],
  prefs: AppPreferences
): Promise<ApplyResult[]> {
  console.info('[apply] stub — mode', prefs.applySafety, 'jobs', jobIds)

  return jobIds.map((jobId) => {
    if (prefs.applySafety === 'confirm') {
      return {
        jobId,
        status: 'pending_confirm' as const,
        message: 'Scaffold: would pause for user confirmation before submit.'
      }
    }
    return {
      jobId,
      status: 'not_implemented' as const,
      message: 'Scaffold: unattended apply path not implemented yet.'
    }
  })
}
