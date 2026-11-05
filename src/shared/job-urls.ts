/**
 * Detect demo / fixture / placeholder job URLs that will 404 if opened live.
 * Apply fill and Open posting both route these to local practice forms.
 */

import type { JobListing } from './types'

export function isDemoOrFixtureJob(
  job: Pick<JobListing, 'id' | 'url' | 'company' | 'title' | 'source'>
): boolean {
  const blob = `${job.id} ${job.url} ${job.company} ${job.title} ${job.source}`
  if (/fixture|example\.com|localhost|\/example\/|liFixture|gFixture/i.test(blob)) {
    return true
  }
  if (/example corp/i.test(job.company || '')) return true
  if (!job.url || !/^https?:\/\//i.test(job.url)) return true
  // Relative paths left over from scrapes (should be rare after normalizers).
  if (job.url.startsWith('/')) return true
  return false
}

/** Human-readable reason Open posting fell back to practice. */
export function demoPostingReason(
  job: Pick<JobListing, 'id' | 'url' | 'company'>
): string {
  if (/fixture/i.test(`${job.id} ${job.url}`)) {
    return 'This match came from a local fixture — opening the practice application form instead of a dead board URL.'
  }
  if (/example\.com|\/example\//i.test(job.url) || /example corp/i.test(job.company || '')) {
    return 'Placeholder example URL — opening the practice application form.'
  }
  if (!job.url || !/^https?:\/\//i.test(job.url)) {
    return 'No usable job URL — opening the practice application form.'
  }
  return 'Demo listing — opening the practice application form.'
}
