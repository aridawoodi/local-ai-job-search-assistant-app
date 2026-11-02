import { useEffect, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type {
  ApplyResult,
  BrowserRuntimeStatus,
  JobListing,
  MatchResult,
  SearchMeta,
  SessionCheckResult
} from '../../shared/types'

interface Props {
  prefs: AppPreferences
}

export default function PipelinePanel({ prefs }: Props) {
  const [log, setLog] = useState(
    'Open the automation browser, optionally check sessions, then Run search → match → notify.'
  )
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [meta, setMeta] = useState<SearchMeta | null>(null)
  const [browser, setBrowser] = useState<BrowserRuntimeStatus | null>(null)
  const [sessions, setSessions] = useState<SessionCheckResult[]>([])
  const [busy, setBusy] = useState(false)

  async function refreshBrowser() {
    setBrowser(await window.desktopApi.browserStatus())
  }

  useEffect(() => {
    void refreshBrowser()
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
      setLog('Session check\n' + JSON.stringify(results, null, 2))
    } catch (err) {
      setLog(err instanceof Error ? err.message : String(err))
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
      setMatches([])
      setLog(
        `${result.meta.message}\nQuery: ${result.meta.query} @ ${result.meta.location}\nFixture: ${result.meta.usedFixture}\n\n` +
          JSON.stringify(result.jobs, null, 2)
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
      const ids = (jobs.length ? jobs : []).map((j) => j.id)
      if (!ids.length) {
        setLog('No jobs loaded — run Search first. Apply does not auto-submit in M2.')
        return
      }
      const results: ApplyResult[] = await window.desktopApi.runApply(ids)
      setLog(
        `Apply (mode=${prefs.applySafety}, M2 no submit) →\n` + JSON.stringify(results, null, 2)
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h2>Automation pipeline</h2>
      <p className="lede">
        First source: <strong>Indeed</strong> (live browser scrape). Browser:{' '}
        <strong>{prefs.browser}</strong>, safety: <strong>{prefs.applySafety}</strong>. M2 does
        search → match → desktop notify; apply never auto-submits.
      </p>

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
          Apply (safe stub)
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
          {meta.usedFixture ? ' · fixture fallback' : ' · live Indeed'}
        </p>
      ) : null}

      {sessions.length ? (
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.source}>
              <span className={`pill ${s.ready ? 'ok' : 'bad'}`}>
                <span className="dot" />
                {s.source}
              </span>{' '}
              {s.message}
            </li>
          ))}
        </ul>
      ) : null}

      {jobs.length ? (
        <div className="job-list">
          <h3>Job list ({jobs.length})</h3>
          <ul>
            {jobs.map((job) => {
              const match = matches.find((m) => m.jobId === job.id)
              return (
                <li key={job.id}>
                  <strong>{job.title}</strong> · {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                  {match ? (
                    <span className={`pill ${match.fits ? 'ok' : ''}`}>
                      score {match.score}
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
