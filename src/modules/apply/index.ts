import { existsSync } from 'fs'
import { join } from 'path'
import type { Page } from 'playwright'
import type { AppPreferences } from '../../shared/preferences'
import type { UserProfile } from '../../shared/profile'
import { isDemoOrFixtureJob } from '../../shared/job-urls'
import type { ApplyResult, JobListing } from '../../shared/types'
import { maskProfileForFill } from '../../shared/field-mask'
import { fillApplicationPage } from './fill'
import { canAutoSubmit, maybeClickSubmit } from './submit'
import { openApplyEntry, runMultiStepSession } from './steps'

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
 * Apply-fill (+ optional multi-step + gated submit) workflow.
 *
 * Safety:
 * - Confirm mode: queue until user confirms; fill (+ optional Next) only; NEVER submit.
 * - Unattended: fill immediately; advance steps when allowAdvanceSteps; submit only when allowAutoSubmit.
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
  const fillProfile = maskProfileForFill(ctx.profile, prefs.fieldToggles)

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

      // Extension parity: open Apply / Easy Apply on the posting before fill.
      const entry = await openApplyEntry(ctx.page)
      await new Promise((r) => setTimeout(r, 400))

      pendingConfirm.delete(jobId)
      actions++

      let submitted = false
      let submitConfirmed = false
      let submitLabel: string | undefined
      let filledCount = 0
      let needsYouCount = 0
      let fields: ApplyResult['fields'] = []
      let adapter = 'Generic'
      let formFound = false
      let stepsAdvanced = 0
      let message = ''

      const useSteps =
        prefs.allowAdvanceSteps ||
        /linkedin|easy-apply|multi-step|workday/i.test(targetUrl + ' ' + (job.title || ''))

      if (useSteps) {
        const session = await runMultiStepSession(ctx.page, fillProfile, prefs)
        filledCount = session.filledCount
        needsYouCount = session.needsYouCount
        fields = session.fields
        adapter = session.adapter
        formFound = session.formFound
        stepsAdvanced = session.stepsAdvanced
        submitted = session.submitted
        submitConfirmed = Boolean(session.submitConfirmed)
        submitLabel = session.submitLabel
        message = `${entry.message} ${session.message}`.trim()
        if (session.stepsAdvanced > 0) actions += session.stepsAdvanced
        if (session.submitted) actions++
      } else {
        const fill = await fillApplicationPage(ctx.page, fillProfile)
        filledCount = fill.filledCount
        needsYouCount = fill.needsYouCount
        fields = fill.fields
        adapter = fill.adapter
        formFound = fill.formFound
        message = `${entry.message} ${fill.message}`.trim()

        let submitMsg = ''
        if (fill.formFound && canAutoSubmit(prefs)) {
          if (actions >= prefs.maxActionsPerDay) {
            submitMsg = ' Fill done; submit skipped (daily cap).'
          } else {
            const sub = await maybeClickSubmit(ctx.page, prefs)
            submitted = sub.submitted
            submitConfirmed = Boolean(sub.submitConfirmed)
            submitLabel = sub.controlLabel
            submitMsg = ` ${sub.message}`
            if (sub.attempted) actions++
          }
        } else if (prefs.applySafety === 'confirm') {
          submitMsg = ' Confirm mode: submit not pressed (requires user).'
        } else if (!prefs.allowAutoSubmit) {
          submitMsg = ' Unattended fill only (allowAutoSubmit off).'
        }
        message = `${message}${submitMsg}`
      }

      const status = submitted
        ? ('submitted' as const)
        : !formFound
          ? ('failed' as const)
          : needsYouCount > 0
            ? ('needs_you' as const)
            : ('filled' as const)

      results.push({
        jobId,
        status,
        message:
          `${prefs.applySafety === 'unattended' ? 'Unattended' : 'Confirmed'}: ${message}`,
        url: targetUrl,
        adapter,
        filledCount,
        needsYouCount,
        fields,
        submitted,
        submitConfirmed,
        submitLabel,
        stepsAdvanced
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

export function resolveApplyUrl(job: JobListing, ctx: ApplyContext): string {
  if (isDemoOrFixtureJob(job)) {
    const keyed = pickPracticeFixture(job, ctx)
    if (keyed) return `file://${keyed}`
  }
  if (/^https?:\/\//i.test(job.url)) return job.url

  const practice = defaultPracticeFormPath(ctx.appPath, ctx.cwd)
  if (practice) return `file://${practice}`
  return job.url
}

type FixturePaths = Pick<ApplyContext, 'appPath' | 'cwd'>

/** Same practice routing as fill — used by Open posting for fixture/demo jobs. */
export function resolveOpenPostingUrl(
  job: JobListing,
  ctx: FixturePaths
): { url: string; usedPractice: boolean } {
  if (isDemoOrFixtureJob(job)) {
    const keyed = pickPracticeFixture(job, ctx)
    if (keyed) return { url: `file://${keyed}`, usedPractice: true }
    const practice = defaultPracticeFormPath(ctx.appPath, ctx.cwd)
    if (practice) return { url: `file://${practice}`, usedPractice: true }
  }
  if (/^https?:\/\//i.test(job.url)) return { url: job.url, usedPractice: false }
  const practice = defaultPracticeFormPath(ctx.appPath, ctx.cwd)
  if (practice) return { url: `file://${practice}`, usedPractice: true }
  return { url: job.url, usedPractice: false }
}

/** Choose Workday / Easy Apply / multi-step / generic practice HTML from job hints. */
export function pickPracticeFixture(job: JobListing, ctx: FixturePaths): string | null {
  const blob = `${job.id} ${job.title} ${job.company} ${job.url} ${job.source}`.toLowerCase()
  const map: [RegExp, string][] = [
    [/workday/, 'workday-basic.html'],
    [/easy.?apply|linkedin/, 'linkedin-easy-apply.html'],
    [/multi.?step|wizard|greenhouse/, 'multi-step-apply.html']
  ]
  for (const [re, file] of map) {
    if (re.test(blob)) {
      const p = fixturePath(file, ctx)
      if (p) return p
    }
  }
  return defaultPracticeFormPath(ctx.appPath, ctx.cwd)
}

function fixturePath(name: string, ctx: FixturePaths): string | null {
  const candidates = [
    join(ctx.appPath, 'fixtures', name),
    join(ctx.cwd, 'fixtures', name),
    join(__dirname, '../../../fixtures', name)
  ]
  return candidates.find((p) => existsSync(p)) || null
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
export { detectSubmitConfirmation } from './submit-detect'
export {
  runMultiStepSession,
  clickNextOrContinue,
  ensureEasyApplyModal,
  openApplyEntry,
  canAdvanceSteps
} from './steps'
