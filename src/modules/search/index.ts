import type { AppPreferences } from '../../shared/preferences'
import type { JobListing, JobSource, SearchHistoryEntry, SourceSearchMeta } from '../../shared/types'
import type { UserProfile } from '../../shared/profile'
import type { Page } from 'playwright'
import { defaultFixturePath, searchIndeed } from './indeed'
import { defaultLinkedInFixturePath, searchLinkedIn } from './linkedin'
import { defaultGoogleFixturePath, searchGoogleJobs } from './google'
import { defaultCompanyFixturePath, searchCompanySites } from './company'

export interface SearchRunResult {
  jobs: JobListing[]
  sources: SourceSearchMeta[]
  usedFixture: boolean
  message: string
  searchUrl: string
  query: string
  location: string
  runId: string
  historyEntry: SearchHistoryEntry
}

const history: SearchHistoryEntry[] = []
const MAX_HISTORY = 20

export function getSearchHistory(): SearchHistoryEntry[] {
  return [...history]
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Orchestrated multi-source search (Milestone 3).
 * Runs enabled drivers sequentially with a soft rate limit. No job-board APIs.
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
  const { query, location } = resolveSearchQuery(prefs, options.profile)
  const runId = `run_${Date.now().toString(36)}`
  const sources: SourceSearchMeta[] = []
  const collected: JobListing[] = []
  const gap = Math.max(0, prefs.sourceRateLimitMs || 0)
  let first = true

  const maybeWait = async () => {
    if (!first && gap > 0) await sleep(gap)
    first = false
  }

  if (prefs.enabledSources.indeed) {
    await maybeWait()
    const result = await searchIndeed(options.page, {
      query,
      location,
      fixturePath: defaultFixturePath(options.appPath, options.cwd),
      maxResults: 20
    })
    collected.push(...result.jobs)
    sources.push({
      source: 'indeed',
      usedFixture: result.usedFixture,
      message: result.message,
      searchUrl: result.searchUrl,
      jobCount: result.jobs.length
    })
  }

  if (prefs.enabledSources.google) {
    await maybeWait()
    const result = await searchGoogleJobs(options.page, {
      query,
      location,
      fixturePath: defaultGoogleFixturePath(options.appPath, options.cwd),
      maxResults: 20
    })
    collected.push(...result.jobs)
    sources.push({
      source: 'google',
      usedFixture: result.usedFixture,
      message: result.message,
      searchUrl: result.searchUrl,
      jobCount: result.jobs.length
    })
  }

  if (prefs.enabledSources.linkedin) {
    await maybeWait()
    const result = await searchLinkedIn(options.page, {
      query,
      location,
      fixturePath: defaultLinkedInFixturePath(options.appPath, options.cwd),
      maxResults: 20
    })
    collected.push(...result.jobs)
    sources.push({
      source: 'linkedin',
      usedFixture: result.usedFixture,
      message: result.message,
      searchUrl: result.searchUrl,
      jobCount: result.jobs.length
    })
  }

  if (prefs.enabledSources.companySites) {
    await maybeWait()
    const result = await searchCompanySites(options.page, {
      urls: prefs.companyCareerUrls || [],
      fixturePath: defaultCompanyFixturePath(options.appPath, options.cwd),
      maxResults: 25,
      rateLimitMs: Math.min(gap, 1000)
    })
    collected.push(...result.jobs)
    sources.push({
      source: 'company',
      usedFixture: result.usedFixture,
      message: result.message,
      searchUrl: result.searchUrl,
      jobCount: result.jobs.length
    })
  }

  if (!sources.length) {
    const empty: SearchRunResult = {
      jobs: [],
      sources: [],
      usedFixture: false,
      message: 'No search sources enabled — turn on Indeed / Google / LinkedIn / company sites in Preferences.',
      searchUrl: '',
      query,
      location,
      runId,
      historyEntry: {
        id: runId,
        at: new Date().toISOString(),
        query,
        location,
        jobCount: 0,
        sources: [],
        message: 'No sources enabled'
      }
    }
    pushHistory(empty.historyEntry)
    return empty
  }

  const jobs = dedupeJobs(collected)
  const usedFixture = sources.some((s) => s.usedFixture)
  const message = sources.map((s) => `${s.source}: ${s.message}`).join(' · ')
  const searchUrl = sources.map((s) => s.searchUrl).filter(Boolean).join(' | ')
  const historyEntry: SearchHistoryEntry = {
    id: runId,
    at: new Date().toISOString(),
    query,
    location,
    jobCount: jobs.length,
    sources: sources.map((s) => s.source as JobSource),
    message
  }
  pushHistory(historyEntry)

  return {
    jobs,
    sources,
    usedFixture,
    message,
    searchUrl,
    query,
    location,
    runId,
    historyEntry
  }
}

function pushHistory(entry: SearchHistoryEntry): void {
  history.unshift(entry)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
}

function dedupeJobs(jobs: JobListing[]): JobListing[] {
  const seen = new Set<string>()
  const out: JobListing[] = []
  for (const job of jobs) {
    if (seen.has(job.id)) continue
    // Soft URL dedupe across sources — keep discriminating job ids in the key
    // (Indeed /viewjob?jk=… shares one pathname; stripping query collapsed fixtures).
    const urlKey = normalizeUrlKey(job.url)
    if (urlKey && seen.has(`url:${urlKey}`)) continue
    seen.add(job.id)
    if (urlKey) seen.add(`url:${urlKey}`)
    out.push(job)
  }
  return out
}

/** Host + path + job-id query params when present (jk / vjk / currentJobId / …). */
export function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url)
    const base = `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '')
    const id =
      u.searchParams.get('jk') ||
      u.searchParams.get('vjk') ||
      u.searchParams.get('currentJobId') ||
      u.searchParams.get('jobId') ||
      u.searchParams.get('jobid') ||
      u.searchParams.get('gh_jid') ||
      ''
    if (id) return `${base}?id=${id.toLowerCase()}`
    // LinkedIn /jobs/view/12345 already unique via pathname — keep as-is.
    return base
  } catch {
    return url.toLowerCase()
  }
}
