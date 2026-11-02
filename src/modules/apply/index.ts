import { existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { AppPreferences } from '../../shared/preferences'
import type { UserProfile } from '../../shared/profile'
import type { ApplyResult, JobListing } from '../../shared/types'
import { fillApplicationPage } from './fill'
import { canAutoSubmit, maybeClickSubmit } from './submit'

export interface ApplyContext {
  page: Page
  jobs: JobListing[]
  profile: UserProfile
  appPath: string
  cwd: string
  /** When true, proceed with fill even in confirm mode (user approved). */
  confirmed?: boolean
  /** Soft daily action counter (fills + submits). */
  actionsToday?: number
}

const pendingConfirm = new Set<string>()

export function getPendingConfirmIds(): string[] {
  return Array.from(pendingConfirm)
}

/**
 * Apply-fill (+ optional gated submit) workflow.
 *
 * Safety:
 * - Confirm mode: queue until user confirms; fill only; NEVER submit even if allowAutoSubmit.
 * - Unattended: fill immediately; submit only when allowAutoSubmit is true.
 * - Daily maxActionsPerDay soft-caps automated fills/submits.
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
  let actions = ctx.actionsToday ?? 0

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
          'Queued for confirmation (apply safety = confirm). Approve to autofill — Submit stays gated.',
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

    if (actions >= prefs.maxActionsPerDay) {
      results.push({
        jobId,
        status: 'skipped',
        message: `Daily action cap reached (${prefs.maxActionsPerDay}).`,
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
      actions++

      let submitted = false
      let submitMsg = ''
      if (fill.formFound && canAutoSubmit(prefs)) {
        if (actions >= prefs.maxActionsPerDay) {
          submitMsg = ' Fill done; submit skipped (daily cap).'
        } else {
          const sub = await maybeClickSubmit(ctx.page, prefs)
          submitted = sub.submitted
          submitMsg = ` ${sub.message}`
          if (sub.attempted) actions++
        }
      } else if (prefs.applySafety === 'confirm') {
        submitMsg = ' Confirm mode: submit not pressed (requires user).'
      } else if (!prefs.allowAutoSubmit) {
        submitMsg = ' Unattended fill only (allowAutoSubmit off).'
      }

      const status = submitted
        ? ('submitted' as const)
        : !fill.formFound
          ? ('failed' as const)
          : fill.needsYouCount > 0
            ? ('needs_you' as const)
            : ('filled' as const)

      results.push({
        jobId,
        status,
        message:
          `${prefs.applySafety === 'unattended' ? 'Unattended' : 'Confirmed'} fill: ${fill.message}${submitMsg}`,
        url: targetUrl,
        adapter: fill.adapter,
        filledCount: fill.filledCount,
        needsYouCount: fill.needsYouCount,
        fields: fill.fields,
        submitted
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
  const demo =
    /fixture|example\.com|localhost|\/example\//i.test(job.url) ||
    /fixture/i.test(job.id) ||
    /example corp/i.test(job.company)
  if (demo) {
    const practice = defaultPracticeFormPath(ctx.appPath, ctx.cwd)
    if (practice) return `file://${practice}`
  }
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

export { canAutoSubmit, maybeClickSubmit } from './submit'
