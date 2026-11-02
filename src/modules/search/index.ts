import type { AppPreferences } from '../../shared/preferences'
import type { JobListing } from '../../shared/types'

/**
 * Browser-driven job search placeholder.
 * Real implementation will launch Chrome/Edge (per prefs), reuse the user's
 * logged-in sessions, and scrape/search Google, LinkedIn, Indeed, and career sites.
 * No job-board APIs.
 */
export async function searchJobs(prefs: AppPreferences): Promise<JobListing[]> {
  const sources = Object.entries(prefs.enabledSources)
    .filter(([, on]) => on)
    .map(([name]) => name)

  console.info('[search] stub — would drive', prefs.browser, 'for sources:', sources)

  return [
    {
      id: 'stub-1',
      title: 'Placeholder Software Engineer',
      company: 'Example Corp',
      location: 'Remote',
      url: 'https://example.com/jobs/1',
      source: 'other',
      snippet: 'Scaffold placeholder listing — replace with real browser search.'
    }
  ]
}
