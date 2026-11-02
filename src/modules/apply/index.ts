import { existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { AppPreferences } from '../../shared/preferences'
import type { UserProfile } from '../../shared/profile'
import type { ApplyResult, JobListing } from '../../shared/types'
import { fillApplicationPage } from './fill'

export interface ApplyContext {
  page: Page
  jobs: JobListing[]
  profile: UserProfile
  appPath: string
  cwd: string
  /** When true, proceed with fill even in confirm mode (user approved). */
  confirmed?: boolean
}

const pendingConfirm = new Set<string>()

export function getPendingConfirmIds(): string[] {
  return Array.from(pendingConfirm)
}

/**
 * Apply-fill workflow (Milestone 3).
 *
 * Safety:
 * - Default confirm mode: queue jobs as pending_confirm until the user confirms.
 * - Unattended: fill immediately without per-job confirm.
 * - Neither mode auto-submits (no Submit / Apply / Next clicks). Full unattended
 *   submit automation is deferred to a later milestone.
 */
export async function applyToJobs(
  jobIds: string[],
  prefs: AppPreferences,
  ctx?: ApplyContext
): Promise<ApplyResult[]> {
  if (!ctx) {
    return jobIds.map((jobId) => ({
      jobId,
      status: 'failed' as const,
      message: 'Apply context missing (browser page / jobs / profile).',
      submitted: false
    }))
  }

  const results: ApplyResult[] = []

  for (const jobId of jobIds) {
    const job = ctx.jobs.find((j) => j.id === jobId)
    if (!job) {
      results.push({
        jobId,
        status: 'failed',
        message: 'Job not found in current search results.',
        submitted: false
      })
      continue
    }

    if (prefs.applySafety === 'confirm' && !ctx.confirmed && !pendingConfirm.has(jobId)) {
      pendingConfirm.add(jobId)
      results.push({
        jobId,
        status: 'pending_confirm',
        message:
          'Queued for confirmation (apply safety = confirm). Approve to autofill — Submit will never be pressed automatically.',
        url: job.url,
        submitted: false
      })
      continue
    }

    if (prefs.applySafety === 'confirm' && !ctx.confirmed && pendingConfirm.has(jobId)) {
      results.push({
        jobId,
        status: 'pending_confirm',
        message: 'Still waiting for confirmation. Use Confirm apply to autofill this job.',
        url: job.url,
        submitted: false
      })
      continue
    }

    try {
      const targetUrl = resolveApplyUrl(job, ctx)
      await ctx.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 800))

      const fill = await fillApplicationPage(ctx.page, ctx.profile)
      pendingConfirm.delete(jobId)

      const status =
        !fill.formFound
          ? ('failed' as const)
          : fill.needsYouCount > 0
            ? ('needs_you' as const)
            : ('filled' as const)

      results.push({
        jobId,
        status,
        message:
          `${prefs.applySafety === 'unattended' ? 'Unattended fill' : 'Confirmed fill'}: ${fill.message} ` +
          '(apply-safety: no auto-submit).',
        url: targetUrl,
        adapter: fill.adapter,
        filledCount: fill.filledCount,
        needsYouCount: fill.needsYouCount,
        fields: fill.fields,
        submitted: false
      })
    } catch (err) {
      results.push({
        jobId,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
        url: job.url,
        submitted: false
      })
    }
  }

  return results
}

/** Confirm previously queued jobs and run fill (confirm mode). */
export async function confirmAndFill(
  jobIds: string[],
  prefs: AppPreferences,
  ctx: ApplyContext
): Promise<ApplyResult[]> {
  return applyToJobs(jobIds, prefs, { ...ctx, confirmed: true })
}

function resolveApplyUrl(job: JobListing, ctx: ApplyContext): string {
  // Demo/fixture jobs → local practice apply form so fill can be verified offline.
  const demo =
    /fixture|example\.com|localhost|\/example\//i.test(job.url) ||
    /fixture/i.test(job.id) ||
    /example corp/i.test(job.company)
  if (demo) {
    const practice = defaultPracticeFormPath(ctx.appPath, ctx.cwd)
    if (practice) return `file://${practice}`
  }
  // Prefer http(s) URLs; Greenhouse/Lever board listing links often work as apply targets.
  if (/^https?:\/\//i.test(job.url)) return job.url

  const practice = defaultPracticeFormPath(ctx.appPath, ctx.cwd)
  if (practice) return `file://${practice}`
  return job.url
}

export function defaultPracticeFormPath(appPath: string, cwd: string): string | null {
  const candidates = [
    join(appPath, 'fixtures', 'practice-apply-form.html'),
    join(cwd, 'fixtures', 'practice-apply-form.html'),
    join(__dirname, '../../../fixtures/practice-apply-form.html')
  ]
  return candidates.find((p) => existsSync(p)) || null
}
