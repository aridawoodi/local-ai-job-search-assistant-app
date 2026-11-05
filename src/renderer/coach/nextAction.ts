import type { PipelinePause } from '../../shared/pause'
import type {
  ApplyResult,
  BrowserRuntimeStatus,
  MatchResult,
  SessionCheckResult
} from '../../shared/types'

export type CoachNavTab = 'home' | 'matches' | 'apply' | 'profile' | 'preferences'

export type NextActionId =
  | 'import_profile'
  | 'open_browser'
  | 'check_sessions'
  | 'resume_pause'
  | 'run_pipeline'
  | 'review_matches'
  | 'queue_apply'
  | 'confirm_apply'
  | 'zero_fits'
  | 'idle'

export type CoachActionKind =
  | 'import_sample'
  | 'open_browser'
  | 'check_sessions'
  | 'resume_pause'
  | 'run_pipeline'
  | 'navigate'
  | 'run_apply'
  | 'confirm_apply'
  | 'none'

export interface CoachContext {
  profileComplete: boolean
  profileMissing: string[]
  browser: BrowserRuntimeStatus | null
  sessions: SessionCheckResult[]
  sessionsChecked: boolean
  pause: PipelinePause
  jobCount: number
  matches: MatchResult[]
  applyResults: ApplyResult[]
  pipelineRan: boolean
  matchThreshold: number
}

export interface NextAction {
  id: NextActionId
  eyebrow: string
  title: string
  detail: string
  ctaLabel: string
  kind: CoachActionKind
  nav?: CoachNavTab
}

/** Derive the single recommended next step from pipeline / profile state. */
export function deriveNextAction(ctx: CoachContext): NextAction {
  if (!ctx.profileComplete) {
    const missing = ctx.profileMissing.length
      ? ctx.profileMissing.slice(0, 3).join(', ')
      : 'basics'
    return {
      id: 'import_profile',
      eyebrow: 'Setup',
      title: 'Import a profile to get started',
      detail: `Matching and apply need a profile (${missing} missing). Load the sample or import from the Chrome extension under Settings.`,
      ctaLabel: 'Import sample profile',
      kind: 'import_sample'
    }
  }

  if (ctx.pause.active) {
    const kind =
      ctx.pause.kind === 'captcha'
        ? 'captcha'
        : ctx.pause.kind === 'login'
          ? 'login'
          : 'pause'
    return {
      id: 'resume_pause',
      eyebrow: kind === 'captcha' ? 'Captcha' : kind === 'login' ? 'Login' : 'Paused',
      title:
        kind === 'captcha'
          ? 'Finish the captcha, then resume'
          : kind === 'login'
            ? 'Sign in in the automation browser, then resume'
            : 'Resolve the pause, then resume',
      detail:
        ctx.pause.message ||
        'Complete the step in the automation Chrome window, then resume so sessions re-check.',
      ctaLabel: 'Resume — check sessions',
      kind: 'resume_pause'
    }
  }

  const browserOpen = Boolean(ctx.browser?.open)
  if (!browserOpen) {
    return {
      id: 'open_browser',
      eyebrow: 'Browser',
      title: 'Open the automation browser',
      detail:
        'Job boards run in a dedicated Chrome window. Open it first, then optionally sign in before searching.',
      ctaLabel: 'Open browser',
      kind: 'open_browser'
    }
  }

  if (!ctx.sessionsChecked) {
    return {
      id: 'check_sessions',
      eyebrow: 'Sessions',
      title: 'Check board sessions',
      detail:
        'Confirm Indeed / LinkedIn / Google are reachable (and signed in if you want live results). Captchas pause here instead of burning the session.',
      ctaLabel: 'Check sessions',
      kind: 'check_sessions'
    }
  }

  const pendingConfirm = ctx.applyResults.filter((r) => r.status === 'pending_confirm')
  if (pendingConfirm.length) {
    return {
      id: 'confirm_apply',
      eyebrow: 'Apply queue',
      title: `Confirm fill for ${pendingConfirm.length} job${pendingConfirm.length === 1 ? '' : 's'}`,
      detail:
        'Confirm mode filled forms but will not submit. Review fields on Apply, then confirm to continue.',
      ctaLabel: 'Confirm apply',
      kind: 'confirm_apply'
    }
  }

  const fits = ctx.matches.filter((m) => m.fits)
  if (fits.length) {
    const hasQueued = ctx.applyResults.some(
      (r) =>
        r.status === 'filled' ||
        r.status === 'needs_you' ||
        r.status === 'pending_confirm' ||
        r.submitted
    )
    if (!hasQueued) {
      return {
        id: 'queue_apply',
        eyebrow: 'Matches ready',
        title: `Review ${fits.length} fit${fits.length === 1 ? '' : 's'}, then queue apply`,
        detail:
          'Open Matches to triage fits, or queue a confirm-mode fill for the top fits from Apply.',
        ctaLabel: 'Review Matches',
        kind: 'navigate',
        nav: 'matches'
      }
    }
    return {
      id: 'review_matches',
      eyebrow: 'Matches',
      title: 'Review matches and apply queue',
      detail: 'Fits are scored. Keep triaging on Matches or confirm pending fills on Apply.',
      ctaLabel: 'Open Apply',
      kind: 'navigate',
      nav: 'apply'
    }
  }

  if (ctx.pipelineRan && ctx.jobCount > 0 && fits.length === 0) {
    const top = Math.max(0, ...ctx.matches.map((m) => m.score))
    return {
      id: 'zero_fits',
      eyebrow: 'No fits yet',
      title: 'No jobs met your match threshold',
      detail: `Highest score ${top} vs threshold ${ctx.matchThreshold}. Lower the threshold in Settings, refine Profile, or re-run search.`,
      ctaLabel: 'Open Settings',
      kind: 'navigate',
      nav: 'preferences'
    }
  }

  if (!ctx.pipelineRan || ctx.jobCount === 0) {
    const blocked = ctx.sessions.filter((s) => !s.ready)
    const note = blocked.length
      ? ` ${blocked.map((s) => s.source).join(', ')} still need attention — search can still use fixtures.`
      : ''
    return {
      id: 'run_pipeline',
      eyebrow: 'Ready',
      title: 'Run search → match → notify',
      detail: `Sessions look good enough to search.${note} Confirm-mode apply never auto-submits.`,
      ctaLabel: 'Run search → match → notify',
      kind: 'run_pipeline'
    }
  }

  return {
    id: 'idle',
    eyebrow: 'Up to date',
    title: 'Pipeline caught up',
    detail: 'Re-run search when you want fresh listings, or open Matches / Apply for prior results.',
    ctaLabel: 'Run search again',
    kind: 'run_pipeline'
  }
}

export interface ActionAvailability {
  openBrowser: boolean
  checkSessions: boolean
  closeBrowser: boolean
  runPipeline: boolean
  runSearch: boolean
  runMatch: boolean
  runNotify: boolean
  runApply: boolean
  confirmApply: boolean
}

/** Enable only actions that make sense for the current state; hide dead-ends via disabled. */
export function actionAvailability(ctx: CoachContext, _next: NextAction): ActionAvailability {
  const browserOpen = Boolean(ctx.browser?.open)
  const hasJobs = ctx.jobCount > 0
  const hasMatches = ctx.matches.length > 0
  const pendingConfirm = ctx.applyResults.some((r) => r.status === 'pending_confirm')
  const paused = ctx.pause.active
  const profileOk = ctx.profileComplete

  const readyToSearch = profileOk && browserOpen && ctx.sessionsChecked && !paused

  return {
    openBrowser: profileOk && !browserOpen,
    checkSessions: profileOk && browserOpen && !paused,
    closeBrowser: browserOpen && !paused,
    runPipeline: readyToSearch,
    runSearch: readyToSearch,
    runMatch: readyToSearch && (hasJobs || ctx.pipelineRan),
    runNotify: readyToSearch && hasMatches,
    runApply: readyToSearch && hasJobs,
    confirmApply: profileOk && pendingConfirm
  }
}
