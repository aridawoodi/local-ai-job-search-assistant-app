/**
 * Pipeline pause helpers — captcha / login walls surface a clear UI state
 * so unattended automation stops with actionable next steps (never auto-enter passwords).
 */

import type { SessionCheckResult, SourceSearchMeta } from './types'

export type PauseKind = 'captcha' | 'login' | 'auth_wall' | 'blocked'

export interface PipelinePause {
  active: boolean
  kind: PauseKind | null
  source: string | null
  title: string
  message: string
  url?: string
  at: string
  /** Suggested next steps shown in the pause banner. */
  steps: string[]
}

export function emptyPause(): PipelinePause {
  return {
    active: false,
    kind: null,
    source: null,
    title: '',
    message: '',
    at: new Date().toISOString(),
    steps: []
  }
}

export function pauseFromSession(s: SessionCheckResult): PipelinePause | null {
  if (s.ready && !s.needsLogin) return null
  const captcha =
    s.pauseKind === 'captcha' ||
    /captcha|bot check|unusual traffic|not a robot/i.test(s.message)
  const login =
    s.pauseKind === 'login' ||
    s.needsLogin ||
    /needs? (a )?manual login|sign in|log in|auth wall/i.test(s.message)

  if (captcha) {
    return {
      active: true,
      kind: 'captcha',
      source: s.source,
      title: `${labelSource(s.source)} captcha / bot check`,
      message: s.message,
      url: s.url,
      at: new Date().toISOString(),
      steps: [
        'Switch to the automation browser window',
        'Complete the captcha or bot check there',
        'Return here and click Resume / Check sessions'
      ]
    }
  }
  if (login) {
    return {
      active: true,
      kind: 'login',
      source: s.source,
      title: `${labelSource(s.source)} login required`,
      message: s.message,
      url: s.url,
      at: new Date().toISOString(),
      steps: [
        'Switch to the automation browser window',
        'Sign in manually (passwords are never entered by the app)',
        'Return here and click Resume / Check sessions'
      ]
    }
  }
  if (!s.ready) {
    return {
      active: true,
      kind: 'blocked',
      source: s.source,
      title: `${labelSource(s.source)} needs attention`,
      message: s.message,
      url: s.url,
      at: new Date().toISOString(),
      steps: [
        'Open the automation browser',
        'Resolve the block or error',
        'Check sessions again'
      ]
    }
  }
  return null
}

/** Prefer the first hard pause from session probes (login > captcha > blocked). */
export function pickSessionPause(sessions: SessionCheckResult[]): PipelinePause {
  const ranked = sessions
    .map(pauseFromSession)
    .filter((p): p is PipelinePause => Boolean(p))
  const login = ranked.find((p) => p.kind === 'login')
  if (login) return login
  const captcha = ranked.find((p) => p.kind === 'captcha')
  if (captcha) return captcha
  return ranked[0] || emptyPause()
}

/**
 * Derive pause hints from search source meta when live scrape hit captcha/login
 * (even if fixture fallback still returned jobs).
 */
export function pauseFromSearchSources(sources: SourceSearchMeta[]): PipelinePause {
  for (const s of sources) {
    const msg = s.message || ''
    if (/captcha|bot check|unusual traffic|not a robot/i.test(msg)) {
      return {
        active: true,
        kind: 'captcha',
        source: s.source,
        title: `${labelSource(s.source)} captcha during search`,
        message: msg,
        url: s.searchUrl,
        at: new Date().toISOString(),
        steps: [
          'Complete the captcha in the automation browser',
          'Re-run Search for live results (fixtures may have been used)',
          'Or dismiss this pause if fixture results are enough'
        ]
      }
    }
    if (/needs login|needs a manual login|sign in in the automation|auth wall/i.test(msg)) {
      return {
        active: true,
        kind: 'login',
        source: s.source,
        title: `${labelSource(s.source)} login during search`,
        message: msg,
        url: s.searchUrl,
        at: new Date().toISOString(),
        steps: [
          'Sign in manually in the automation browser',
          'Click Check sessions, then re-run Search',
          'Or dismiss if fixture results are enough for this run'
        ]
      }
    }
  }
  return emptyPause()
}

function labelSource(source: string): string {
  if (source === 'indeed') return 'Indeed'
  if (source === 'linkedin') return 'LinkedIn'
  if (source === 'google') return 'Google Jobs'
  if (source === 'company') return 'Company sites'
  return source
}
