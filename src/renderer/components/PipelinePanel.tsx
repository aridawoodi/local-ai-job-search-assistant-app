import { useEffect, useMemo, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { PipelinePause } from '../../shared/pause'
import { emptyPause } from '../../shared/pause'
import type {
  ApplyResult,
  BrowserRuntimeStatus,
  JobListing,
  MatchResult,
  SearchHistoryEntry,
  SearchMeta,
  SessionCheckResult
} from '../../shared/types'
import {
  actionAvailability,
  deriveNextAction,
  type CoachNavTab
} from '../coach/nextAction'
import PauseBanner from './PauseBanner'
import EmptyState from './EmptyState'
import NextActionCoach from './NextActionCoach'

interface Props {
  prefs: AppPreferences
  profileComplete: boolean
  profileMissing: string[]
  onNavigate: (tab: CoachNavTab) => void
  onProfileReload?: () => void
}

export default function PipelinePanel({
  prefs,
  profileComplete,
  profileMissing,
  onNavigate,
  onProfileReload
}: Props) {
  const [log, setLog] = useState(
    'Follow What’s next below — the app highlights the one recommended action for your current state.'
  )
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [meta, setMeta] = useState<SearchMeta | null>(null)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [browser, setBrowser] = useState<BrowserRuntimeStatus | null>(null)
  const [sessions, setSessions] = useState<SessionCheckResult[]>([])
  const [sessionsChecked, setSessionsChecked] = useState(false)
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([])
  const [pause, setPause] = useState<PipelinePause>(emptyPause())
  const [pipelineRan, setPipelineRan] = useState(false)
  const [busy, setBusy] = useState(false)

  const enabled = [
    prefs.enabledSources.indeed && 'Indeed',
    prefs.enabledSources.google && 'Google',
    prefs.enabledSources.linkedin && 'LinkedIn',
    prefs.enabledSources.companySites && 'Company sites'
  ].filter(Boolean)

  const coachCtx = useMemo(
    () => ({
      profileComplete,
      profileMissing,
      browser,
      sessions,
      sessionsChecked,
      pause,
      jobCount: jobs.length,
      matches,
      applyResults,
      pipelineRan,
      matchThreshold: prefs.matchThreshold
    }),
    [
      profileComplete,
      profileMissing,
      browser,
      sessions,
      sessionsChecked,
      pause,
      jobs.length,
      matches,
      applyResults,
      pipelineRan,
      prefs.matchThreshold
    ]
  )

  const next = useMemo(() => deriveNextAction(coachCtx), [coachCtx])
  const avail = useMemo(() => actionAvailability(coachCtx, next), [coachCtx, next])

  async function refreshBrowser() {
    setBrowser(await window.desktopApi.browserStatus())
  }

  async function refreshPause() {
    setPause(await window.desktopApi.getPipelinePause())
  }

  useEffect(() => {
    void (async () => {
      await refreshBrowser()
      await refreshPause()
      setHistory(await window.desktopApi.getSearchHistory())
      const [lastJobs, lastMatches, lastApply] = await Promise.all([
        window.desktopApi.getLastJobs(),
        window.desktopApi.getLastMatches(),
        window.desktopApi.getLastApplyResults()
      ])
      if (lastJobs.length) {
        setJobs(lastJobs)
        setPipelineRan(true)
      }
      if (lastMatches.length) setMatches(lastMatches)
      if (lastApply.length) setApplyResults(lastApply)
    })()
  }, [prefs.browser])

  async function openBrowser() {
    setBusy(true)
    try {
      const status = await window.desktopApi.openBrowser()
      setBrowser(status)
      setLog(
        `Browser open (${status.channel})\nProfile: ${status.profileDir}\n${status.profileNote}\n\nNext: check sessions, or sign into boards in that window first.`
      )
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function checkSessions() {
    setBusy(true)
    try {
      const results = await window.desktopApi.checkSessions()
      setSessions(results)
      setSessionsChecked(true)
      await refreshBrowser()
      await refreshPause()
      setLog('Session check\n' + JSON.stringify(results, null, 2))
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function resumeAfterPause() {
    setBusy(true)
    try {
      const result = await window.desktopApi.resumeAfterPause()
      setSessions(result.sessions)
      setSessionsChecked(true)
      setPause(result.pause)
      await refreshBrowser()
      setLog(
        result.pause.active
          ? `Still paused: ${result.pause.title}\n${result.pause.message}`
          : 'Resume OK — sessions clear. You can run Search → match → notify.'
      )
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function dismissPause() {
    setBusy(true)
    try {
      setPause(await window.desktopApi.clearPipelinePause())
      setLog('Pause dismissed. Automation can continue; resolve captcha/login when ready.')
    } finally {
      setBusy(false)
    }
  }

  async function closeBrowser() {
    setBusy(true)
    try {
      const status = await window.desktopApi.closeBrowser()
      setBrowser(status)
      setSessionsChecked(false)
      setLog('Automation browser closed.')
    } finally {
      setBusy(false)
    }
  }

  async function runSearch() {
    setBusy(true)
    try {
      const result = await window.desktopApi.runSearch()
      setJobs(result.jobs)
      setMeta(result.meta)
      setHistory(result.history)
      setMatches([])
      setApplyResults([])
      setPipelineRan(true)
      if (result.pause) setPause(result.pause)
      else await refreshPause()
      setLog(
        `${result.meta.message}\nQuery: ${result.meta.query} @ ${result.meta.location}\nFixture: ${result.meta.usedFixture}\n\n` +
          JSON.stringify(result.meta.sources, null, 2)
      )
      await refreshBrowser()
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runMatch() {
    setBusy(true)
    try {
      let source = jobs
      if (!source.length) {
        const result = await window.desktopApi.runSearch()
        source = result.jobs
        setJobs(source)
        setMeta(result.meta)
        setHistory(result.history)
        setPipelineRan(true)
        if (result.pause) setPause(result.pause)
      }
      const scored = await window.desktopApi.runMatch(source)
      setMatches(scored)
      setLog(
        `Match → ${scored.filter((m) => m.fits).length}/${scored.length} meet threshold ${prefs.matchThreshold}\n` +
          JSON.stringify(scored, null, 2)
      )
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runNotify() {
    setBusy(true)
    try {
      let scored = matches
      if (!scored.length) {
        let source = jobs
        if (!source.length) {
          const result = await window.desktopApi.runSearch()
          source = result.jobs
          setJobs(source)
          setMeta(result.meta)
          setHistory(result.history)
          setPipelineRan(true)
          if (result.pause) setPause(result.pause)
        }
        scored = await window.desktopApi.runMatch(source)
        setMatches(scored)
      }
      const result = await window.desktopApi.notifyBestFits(scored)
      setLog(
        `Notify → ${result.notified} sent` +
          (result.skippedDuplicate ? `, ${result.skippedDuplicate} duplicate(s) skipped` : '')
      )
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runPipeline() {
    setBusy(true)
    try {
      const result = await window.desktopApi.runPipeline()
      setJobs(result.jobs)
      setMatches(result.matches)
      setMeta(result.meta)
      setHistory(result.history)
      setApplyResults([])
      setPipelineRan(true)
      if (result.pause) setPause(result.pause)
      else await refreshPause()
      const fits = result.matches.filter((m) => m.fits).length
      const pauseNote =
        result.pause?.active
          ? `\nPaused: ${result.pause.title} — ${result.pause.message}`
          : ''
      const thresholdNote =
        result.jobs.length > 0 && fits === 0
          ? `\nNo jobs met match threshold ${prefs.matchThreshold} (highest score ${Math.max(0, ...result.matches.map((m) => m.score))}). Lower it in Settings or refine the profile/query.`
          : ''
      setLog(
        `Demo pipeline complete\n${result.meta.message}\nJobs: ${result.jobs.length} · Fits: ${fits} · Notified: ${result.notified}${pauseNote}${thresholdNote}\n\n` +
          JSON.stringify(
            result.matches.map((m) => ({
              title: m.title,
              company: m.company,
              score: m.score,
              fits: m.fits
            })),
            null,
            2
          )
      )
      await refreshBrowser()
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runApply() {
    setBusy(true)
    try {
      const ids = jobs.map((j) => j.id)
      if (!ids.length) {
        setLog('No jobs loaded — run Search first.')
        return
      }
      const results = await window.desktopApi.runApply(ids.slice(0, 3))
      setApplyResults(results)
      setLog(
        `Apply (mode=${prefs.applySafety}) →\n` + JSON.stringify(results, null, 2)
      )
      await refreshBrowser()
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmApply() {
    setBusy(true)
    try {
      const pending = applyResults
        .filter((r) => r.status === 'pending_confirm')
        .map((r) => r.jobId)
      const ids = pending.length ? pending : jobs.map((j) => j.id).slice(0, 3)
      if (!ids.length) {
        setLog('Nothing to confirm — run Apply first in confirm mode.')
        return
      }
      const results = await window.desktopApi.confirmApply(ids)
      setApplyResults(results)
      setLog(`Confirm apply →\n` + JSON.stringify(results, null, 2))
      await refreshBrowser()
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function importSample() {
    setBusy(true)
    try {
      const result = await window.desktopApi.importSampleProfile()
      setLog(result.message)
      onProfileReload?.()
      if (!result.ok) onNavigate('preferences')
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runCoachCta() {
    switch (next.kind) {
      case 'import_sample':
        await importSample()
        break
      case 'open_browser':
        await openBrowser()
        break
      case 'check_sessions':
        await checkSessions()
        break
      case 'resume_pause':
        await resumeAfterPause()
        break
      case 'run_pipeline':
        await runPipeline()
        break
      case 'confirm_apply':
        await confirmApply()
        break
      case 'run_apply':
        await runApply()
        break
      case 'navigate':
        if (next.nav) onNavigate(next.nav)
        break
      default:
        break
    }
  }

  return (
    <div className="panel">
      <h2>Automation pipeline</h2>
      <p className="lede">
        Sources: <strong>{enabled.length ? enabled.join(', ') : 'none'}</strong>. Browser:{' '}
        <strong>{prefs.browser}</strong>, safety: <strong>{prefs.applySafety}</strong>. Apply fills
        profile fields and never auto-submits.
      </p>

      <NextActionCoach
        action={next}
        busy={busy}
        onCta={() => void runCoachCta()}
      />

      <PauseBanner
        pause={pause}
        busy={busy}
        onResume={() => void resumeAfterPause()}
        onDismiss={() => void dismissPause()}
        onOpenBrowser={() => void openBrowser()}
      />

      {!jobs.length && !history.length && !pause.active && next.id === 'open_browser' ? (
        <EmptyState
          title="First-run checklist"
          body="The coach above always points at the next needed action. Typical path:"
          steps={[
            'Open browser → sign into LinkedIn / Indeed in the automation window if you need live results.',
            'Check sessions — LinkedIn/login/captcha pauses show a Resume banner here.',
            'Run search → match → notify (falls back to fixtures when a board blocks scraping).',
            `Apply stays in ${prefs.applySafety} mode — confirm never auto-submits.`
          ]}
        />
      ) : null}

      <div className="actions actions-secondary" aria-label="Manual pipeline controls">
        <button
          className="btn"
          disabled={busy || !avail.openBrowser}
          hidden={!avail.openBrowser && Boolean(browser?.open)}
          onClick={() => void openBrowser()}
        >
          Open browser
        </button>
        <button
          className="btn"
          disabled={busy || !avail.checkSessions}
          onClick={() => void checkSessions()}
        >
          Check sessions
        </button>
        <button
          className="btn"
          disabled={busy || !avail.closeBrowser}
          hidden={!browser?.open}
          onClick={() => void closeBrowser()}
        >
          Close browser
        </button>
      </div>

      <div className="actions actions-secondary" aria-label="Search and apply controls">
        <button
          className="btn"
          disabled={busy || !avail.runPipeline}
          onClick={() => void runPipeline()}
        >
          Run search → match → notify
        </button>
        <button className="btn" disabled={busy || !avail.runSearch} onClick={() => void runSearch()}>
          Search
        </button>
        <button className="btn" disabled={busy || !avail.runMatch} onClick={() => void runMatch()}>
          Match
        </button>
        <button className="btn" disabled={busy || !avail.runNotify} onClick={() => void runNotify()}>
          Notify
        </button>
        <button className="btn" disabled={busy || !avail.runApply} onClick={() => void runApply()}>
          Apply / fill
        </button>
        <button
          className="btn"
          disabled={busy || !avail.confirmApply}
          hidden={!avail.confirmApply && !applyResults.length}
          onClick={() => void confirmApply()}
        >
          Confirm apply
        </button>
      </div>

      {browser ? (
        <p className="hint" style={{ marginTop: '0.75rem' }}>
          Browser: {browser.open ? `open (${browser.channel})` : 'closed'}
          {browser.profileDir ? ` · ${browser.profileDir}` : ''}
        </p>
      ) : null}

      {meta ? (
        <p className="hint">
          Last search: {meta.query} @ {meta.location}
          {meta.usedFixture ? ' · fixture fallback used' : ' · live scrape'} ·{' '}
          {meta.sources.map((s) => `${s.source}:${s.jobCount}`).join(', ')}
        </p>
      ) : null}

      {sessions.length ? (
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.source}>
              <span className={`pill ${s.ready ? 'ok' : 'bad'}`}>
                <span className="dot" />
                {s.source}
                {s.pauseKind ? ` · ${s.pauseKind}` : ''}
              </span>{' '}
              {s.message}
            </li>
          ))}
        </ul>
      ) : null}

      {history.length ? (
        <div className="job-list">
          <h3>Search history</h3>
          <ul>
            {history.slice(0, 8).map((h) => (
              <li key={h.id}>
                <strong>{h.query}</strong> @ {h.location} · {h.jobCount} jobs ·{' '}
                {h.sources.join('+')} · {new Date(h.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {jobs.length ? (
        <div className="job-list">
          <h3>Job list ({jobs.length})</h3>
          <ul>
            {jobs.map((job) => {
              const match = matches.find((m) => m.jobId === job.id)
              const apply = applyResults.find((a) => a.jobId === job.id)
              return (
                <li key={job.id}>
                  <strong>{job.title}</strong> · {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                  <span className="pill">{job.source}</span>
                  {match ? (
                    <span className={`pill ${match.fits ? 'ok' : ''}`}>
                      score {match.score}
                    </span>
                  ) : null}
                  {apply ? (
                    <span className={`pill ${apply.submitted ? 'ok' : ''}`}>
                      {apply.status}
                      {apply.submitConfirmed ? ' ✓' : ''}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <pre className="status">{log}</pre>
    </div>
  )
}
