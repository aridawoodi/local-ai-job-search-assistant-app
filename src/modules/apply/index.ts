import type { AppPreferences } from '../../shared/preferences'
import type { ApplyResult } from '../../shared/types'

/**
 * Apply workflow — Milestone 2 keeps this search+match+notify only.
 * Never auto-submits. Confirm mode queues; unattended is explicitly not wired yet.
 */
export async function applyToJobs(
  jobIds: string[],
  prefs: AppPreferences
): Promise<ApplyResult[]> {
  return jobIds.map((jobId) => {
    if (prefs.applySafety === 'confirm') {
      return {
        jobId,
        status: 'pending_confirm' as const,
        message:
          'M2: apply submit is not wired. Job queued for confirmation only — no form was submitted.'
      }
    }
    return {
      jobId,
      status: 'skipped' as const,
      message:
        'M2 safety: unattended apply is disabled this milestone. Switch to confirm mode; submit automation lands later.'
    }
  })
}
