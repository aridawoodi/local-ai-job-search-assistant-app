import type { MatchResult } from '../../shared/types'

/**
 * Desktop notifications for best-fit jobs.
 * Email / Slack / Discord are out of scope for v1.
 */
export async function notifyBestFits(
  matches: MatchResult[],
  showNotification: (title: string, body: string) => void
): Promise<{ notified: number }> {
  const fits = matches.filter((m) => m.fits)
  console.info('[notify] stub — best fits:', fits.length)

  if (fits.length > 0) {
    showNotification(
      'Job Search Assistant',
      `${fits.length} best-fit job${fits.length === 1 ? '' : 's'} ready for review.`
    )
  }

  return { notified: fits.length }
}
