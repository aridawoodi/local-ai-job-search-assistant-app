import { useEffect, useState } from 'react'
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
import PauseBanner from './PauseBanner'

interface Props {
  prefs: AppPreferences
}

export default function PipelinePanel({ prefs }: Props) {
  const [log, setLog] = useState(
    'Open the automation browser, optionally check sessions, then Run search → match → notify. Apply fills forms with safety prefs (never auto-submits).'
  )
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [meta, setMeta] = useState<SearchMeta | null>(null)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [browser, setBrowser] = useState<BrowserRuntimeStatus | null>(null)
  const [sessions, setSessions] = useState<SessionCheckResult[]>([])
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([])
  const [pause, setPause] = useState<PipelinePause>(emptyPause())
  const [busy, setBusy] = useState(false)

  const enabled = [
    prefs.enabledSources.indeed && 'Indeed',
    prefs.enabledSources.google && 'Google',
    prefs.enabledSources.linkedin && 'LinkedIn',
    prefs.enabledSources.companySites && 'Company sites'
  ].filter(Boolean)

  async function refreshBrowser() {
    setBrowser(await window.desktopApi.browserStatus())
  }

  async function refreshPause() {
    setPause(await window.desktopApi.getPipelinePause())
  }

  useEffect(() => {
    void refreshBrowser()
    void refreshPause()
    void window.desktopApi.getSearchHistory().then(setHistory)
  }, [prefs.browser])

  async function openBrowser() {
    setBusy(true)
    try {
      const status = await window.desktopApi.openBrowser()
      setBrowser(status)
      setLog(
        `Browser open (${status.channel})\nProfile: ${status.profileDir}\n${status.profileNote}\n\nLog into sites manually in that window if needed, then Check sessions.`
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
      setPause(result.pause)
      await refreshBrowser()
      setLog(
        result.pause.active
          ? `Still paused: ${result.pause.title}\n${result.pause.message}`
          : 'Resume OK — sessions clear. You can re-run Search or Apply.'
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
      await refreshPause()
      setLog(
        `Demo pipeline complete\n${result.meta.message}\nJobs: ${result.jobs.length} · Fits: ${result.matches.filter((m) => m.fits).length} · Notified: ${result.notified}\n\n` +
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

  return (
    <div className="panel">
      <h2>Automation pipeline</h2>
      <p className="lede">
        Sources: <strong>{enabled.length ? enabled.join(', ') : 'none'}</strong>. Browser:{' '}
        <strong>{prefs.browser}</strong>, safety: <strong>{prefs.applySafety}</strong>. Apply fills
        profile fields and never auto-submits.
      </p>

      <PauseBanner
        pause={pause}
        busy={busy}
        onResume={() => void resumeAfterPause()}
        onDismiss={() => void dismissPause()}
        onOpenBrowser={() => void openBrowser()}
      />

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void openBrowser()}>
          Open browser
        </button>
        <button className="btn" disabled={busy} onClick={() => void checkSessions()}>
          Check sessions
        </button>
        <button className="btn" disabled={busy} onClick={() => void closeBrowser()}>
          Close browser
        </button>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void runPipeline()}>
          Run search → match → notify
        </button>
        <button className="btn" disabled={busy} onClick={() => void runSearch()}>
          Search
        </button>
        <button className="btn" disabled={busy} onClick={() => void runMatch()}>
          Match
        </button>
        <button className="btn" disabled={busy} onClick={() => void runNotify()}>
          Notify
        </button>
        <button className="btn" disabled={busy} onClick={() => void runApply()}>
          Apply / fill
        </button>
        <button className="btn" disabled={busy} onClick={() => void confirmApply()}>
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
