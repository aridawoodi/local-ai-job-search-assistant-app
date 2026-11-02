import type { AppPreferences } from '../../shared/preferences'
import type { JobListing } from '../../shared/types'
import type { UserProfile } from '../../shared/profile'
import type { Page } from 'playwright'
import { defaultFixturePath, searchIndeed } from './indeed'

export interface SearchRunResult {
  jobs: JobListing[]
  source: 'indeed'
  usedFixture: boolean
  message: string
  searchUrl: string
  query: string
  location: string
}

export function resolveSearchQuery(
  prefs: AppPreferences,
  profile?: UserProfile
): { query: string; location: string } {
  const query =
    prefs.searchQuery.trim() ||
    [profile?.currentTitle, ...(profile?.skills || []).slice(0, 3)]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'software engineer'

  const location =
    prefs.searchLocation.trim() ||
    profile?.location ||
    [profile?.city, profile?.state].filter(Boolean).join(', ') ||
    'Remote'

  return { query, location }
}

/**
 * Browser-driven job search. Milestone 2 first source: Indeed (most reliable
 * without a forced login). LinkedIn / Google Jobs land in later milestones.
 */
export async function searchJobs(
  prefs: AppPreferences,
  options: {
    page: Page
    profile?: UserProfile
    appPath: string
    cwd: string
  }
): Promise<SearchRunResult> {
  if (!prefs.enabledSources.indeed) {
    return {
      jobs: [],
      source: 'indeed',
      usedFixture: false,
      message: 'Indeed is disabled in preferences (enabledSources.indeed).',
      searchUrl: '',
      query: '',
      location: ''
    }
  }

  const { query, location } = resolveSearchQuery(prefs, options.profile)
  const fixturePath = defaultFixturePath(options.appPath, options.cwd)
  const result = await searchIndeed(options.page, {
    query,
    location,
    fixturePath,
    maxResults: 25
  })

  return {
    jobs: dedupeJobs(result.jobs),
    source: 'indeed',
    usedFixture: result.usedFixture,
    message: result.message,
    searchUrl: result.searchUrl,
    query,
    location
  }
}

function dedupeJobs(jobs: JobListing[]): JobListing[] {
  const seen = new Set<string>()
  const out: JobListing[] = []
  for (const job of jobs) {
    if (seen.has(job.id)) continue
    seen.add(job.id)
    out.push(job)
  }
  return out
}
