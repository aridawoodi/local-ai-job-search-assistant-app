import type { MatchResult } from '../../shared/types'

const notifiedKeys = new Set<string>()

/**
 * Desktop notifications for best-fit jobs (deduped by job id for the session).
 */
export async function notifyBestFits(
  matches: MatchResult[],
  showNotification: (title: string, body: string) => void
): Promise<{ notified: number; skippedDuplicate: number }> {
  const fits = matches.filter((m) => m.fits).sort((a, b) => b.score - a.score)
  let notified = 0
  let skippedDuplicate = 0

  for (const fit of fits) {
    if (notifiedKeys.has(fit.jobId)) {
      skippedDuplicate += 1
      continue
    }
    notifiedKeys.add(fit.jobId)
    const label = fit.title
      ? `${fit.title}${fit.company ? ` · ${fit.company}` : ''}`
      : fit.jobId
    showNotification(
      `Best fit (${fit.score})`,
      `${label}${fit.reasons[0] ? ` — ${fit.reasons[0]}` : ''}`
    )
    notified += 1
  }

  if (fits.length === 0) {
    showNotification(
      'Job Search Assistant',
      'No jobs met your match threshold this run.'
    )
  }

  return { notified, skippedDuplicate }
}

/** Test helper — clear session dedupe. */
export function resetNotifyDedupe(): void {
  notifiedKeys.clear()
}
