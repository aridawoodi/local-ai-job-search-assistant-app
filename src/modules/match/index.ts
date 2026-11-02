import type { AppPreferences } from '../../shared/preferences'
import type { UserProfile } from '../../shared/profile'
import type { JobListing, MatchResult } from '../../shared/types'
import { analyze, resumeTextOf } from './engine'

/**
 * Match / rank jobs against the user's profile (port of extension lib/match.js).
 */
export async function matchJobs(
  jobs: JobListing[],
  prefs: AppPreferences,
  profile?: UserProfile
): Promise<MatchResult[]> {
  const resumeText = resumeTextOf(profile || {}, null) || ''

  return jobs.map((job) => {
    const jd = [job.title, job.company, job.location, job.snippet]
      .filter(Boolean)
      .join('\n')

    // Short snippets get a lighter dictionary pass; still deterministic.
    const analysis = analyze(
      jd.length >= 80
        ? jd
        : `${jd}\n\nRequirements\n${job.snippet || job.title}\nskills experience ${job.title}`,
      resumeText || job.title,
      { max: 24 }
    )

    const score = typeof analysis.score === 'number' ? analysis.score : 0
    const matched = (analysis.matched || []) as string[]
    const missing = (analysis.missing || []) as string[]
    const reasons: string[] = []
    if (matched.length) reasons.push(`Covered: ${matched.slice(0, 6).join(', ')}`)
    if (missing.length) reasons.push(`Missing: ${missing.slice(0, 6).join(', ')}`)
    if (!reasons.length) reasons.push('No strong keyword overlap detected.')

    return {
      jobId: job.id,
      score,
      reasons,
      fits: score >= prefs.matchThreshold,
      title: job.title,
      company: job.company,
      url: job.url,
      matched,
      missing
    }
  })
}
