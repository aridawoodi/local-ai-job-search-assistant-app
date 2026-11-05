/**
 * Detect true demo / fixture / placeholder job URLs that will 404 if opened live.
 * Apply fill and Open posting route those to local practice forms.
 * Live HTTPS listings always open their real URL in the automation browser.
 */

import type { JobListing, JobSource } from './types'

/** Explicit fixture markers from search drivers (preferred over URL heuristics). */
export function isTrueFixtureJob(
  job: Pick<JobListing, 'id' | 'url' | 'company' | 'title' | 'source' | 'raw'>
): boolean {
  if (job.raw && job.raw.fixture === true) return true
  const blob = `${job.id} ${job.url}`
  if (/fixture|liFixture|gFixture/i.test(blob)) return true
  if (/\bexample\.com\b/i.test(job.url || '')) return true
  // Shipped Google/company fixtures use /example/ paths on ATS hosts.
  if (
    /\/example\//i.test(job.url || '') &&
    /(greenhouse|lever\.co|ashbyhq)/i.test(job.url || '')
  ) {
    return true
  }
  if (/example corp/i.test(job.company || '')) return true
  return false
}

export function isDemoOrFixtureJob(
  job: Pick<JobListing, 'id' | 'url' | 'company' | 'title' | 'source' | 'raw'>
): boolean {
  if (isTrueFixtureJob(job)) return true
  if (!job.url || !/^https?:\/\//i.test(job.url)) return true
  // Relative paths left over from scrapes (should be rare after normalizers).
  if (job.url.startsWith('/')) return true
  return false
}

/** Human-readable reason Open posting fell back to practice. */
export function demoPostingReason(
  job: Pick<JobListing, 'id' | 'url' | 'company' | 'raw'>
): string {
  if (job.raw?.fixture === true || /fixture/i.test(`${job.id} ${job.url}`)) {
    return 'This match came from a local fixture — opening the practice application form instead of a dead board URL.'
  }
  if (
    /\bexample\.com\b|\/example\//i.test(job.url) ||
    /example corp/i.test(job.company || '')
  ) {
    return 'Placeholder example URL — opening the practice application form.'
  }
  if (!job.url || !/^https?:\/\//i.test(job.url)) {
    return 'No usable job URL — opening the practice application form.'
  }
  return 'Demo listing — opening the practice application form.'
}

/**
 * Fix relative / redirect / missing board URLs from search scrapes.
 * Returns empty string when nothing usable can be built.
 */
export function normalizeJobUrl(url: string, source?: JobSource): string {
  const raw = String(url || '').trim()
  if (!raw) return ''

  if (raw.startsWith('/')) {
    if (source === 'indeed') return `https://www.indeed.com${raw}`
    if (source === 'linkedin') return `https://www.linkedin.com${raw}`
    if (source === 'google') return `https://www.google.com${raw}`
    return raw
  }

  try {
    const u = new URL(raw)
    // Unwrap Google redirect wrappers to the external apply URL when present.
    if (/google\./i.test(u.hostname) && u.pathname === '/url') {
      const q = u.searchParams.get('q') || u.searchParams.get('url') || ''
      if (/^https?:\/\//i.test(q) && !/google\./i.test(q)) return q
    }
    return u.toString()
  } catch {
    return raw
  }
}

/** Apply normalizeJobUrl onto a listing (keeps other fields). */
export function withNormalizedJobUrl(job: JobListing): JobListing {
  const url = normalizeJobUrl(job.url, job.source)
  if (url === job.url) return job
  return { ...job, url }
}
