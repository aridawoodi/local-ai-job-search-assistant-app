import type { AppPreferences } from '../../shared/preferences'
import type { JobListing, MatchResult } from '../../shared/types'

/**
 * Match / rank jobs against the user's profile and criteria.
 * Will reuse / port logic from the Job Apply Assistant extension (read-only reference).
 */
export async function matchJobs(
  jobs: JobListing[],
  prefs: AppPreferences
): Promise<MatchResult[]> {
  console.info('[match] stub — threshold', prefs.matchThreshold)

  return jobs.map((job) => {
    const score = 75
    return {
      jobId: job.id,
      score,
      reasons: ['Scaffold placeholder score — wire real profile matching next.'],
      fits: score >= prefs.matchThreshold
    }
  })
}
