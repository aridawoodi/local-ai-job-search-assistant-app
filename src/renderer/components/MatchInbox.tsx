import { useEffect, useMemo, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { JobListing, MatchResult } from '../../shared/types'

interface Props {
  prefs: AppPreferences
}

export default function MatchInbox({ prefs }: Props) {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState<'fits' | 'all'>('fits')

  async function reload() {
    const [j, m] = await Promise.all([
      window.desktopApi.getLastJobs(),
      window.desktopApi.getLastMatches()
    ])
    setJobs(j)
    setMatches(m)
  }

  useEffect(() => {
    void reload()
  }, [])

  const rows = useMemo(() => {
    const scored = matches.length
      ? matches
          .map((m) => {
            const job = jobs.find((j) => j.id === m.jobId)
            return { match: m, job }
          })
          .filter((r) => r.job)
      : jobs.map((job) => ({
          job,
          match: undefined as MatchResult | undefined
        }))
    const list =
      filter === 'fits'
        ? scored.filter((r) => (r.match ? r.match.fits : false))
        : scored
    return list.sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
  }, [jobs, matches, filter])

  async function runMatch() {
    setBusy(true)
    try {
      let source = jobs
      if (!source.length) {
        const result = await window.desktopApi.runSearch()
        source = result.jobs
        setJobs(source)
      }
      const scored = await window.desktopApi.runMatch(source)
      setMatches(scored)
      setMsg(
        `${scored.filter((m) => m.fits).length}/${scored.length} meet threshold ${prefs.matchThreshold}.`
      )
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function notifyFits() {
    setBusy(true)
    try {
      let scored = matches
      if (!scored.length) {
        await runMatch()
        scored = await window.desktopApi.getLastMatches()
        setMatches(scored)
      }
      const result = await window.desktopApi.notifyBestFits(scored)
      setMsg(
        `Notified ${result.notified}` +
          (result.skippedDuplicate ? ` (${result.skippedDuplicate} dupes skipped)` : '')
      )
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function queueApply(jobId: string) {
    setBusy(true)
    try {
      const results = await window.desktopApi.runApply([jobId])
      setMsg(results.map((r) => `${r.status}: ${r.message}`).join('\n'))
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel wide">
      <h2>Match inbox</h2>
      <p className="lede">
        Scored postings vs your profile (threshold {prefs.matchThreshold}). Best fits can notify
        and queue for apply-fill.
      </p>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void runMatch()}>
          Score jobs
        </button>
        <button className="btn" disabled={busy} onClick={() => void notifyFits()}>
          Notify best fits
        </button>
        <button
          className={`btn ${filter === 'fits' ? 'primary' : ''}`}
          disabled={busy}
          onClick={() => setFilter('fits')}
        >
          Fits only
        </button>
        <button
          className={`btn ${filter === 'all' ? 'primary' : ''}`}
          disabled={busy}
          onClick={() => setFilter('all')}
        >
          All scored
        </button>
      </div>

      {msg ? <p className="hint" style={{ marginTop: '0.75rem' }}>{msg}</p> : null}

      <div className="card-list">
        {rows.length === 0 ? (
          <p className="hint">No matches yet — run Search on Pipeline, then Score jobs.</p>
        ) : (
          rows.map(({ job, match }) =>
            job ? (
              <article key={job.id} className="inbox-card">
                <div className="inbox-head">
                  <div>
                    <h3>{match?.title || job.title}</h3>
                    <p>
                      {match?.company || job.company}
                      {job.location ? ` · ${job.location}` : ''}
                    </p>
                  </div>
                  <div className="inbox-meta">
                    <span className={`pill ${match?.fits ? 'ok' : ''}`}>
                      {match ? `score ${match.score}` : 'unscored'}
                    </span>
                    <span className="pill">{job.source}</span>
                  </div>
                </div>
                {match?.matched?.length || match?.missing?.length || match?.reasons?.length ? (
                  <div className="kw-row">
                    {match.matched?.length ? (
                      <span className="hint">
                        Covered: {match.matched.slice(0, 8).join(', ')}
                      </span>
                    ) : null}
                    {match.missing?.length ? (
                      <span className="hint warn-text">
                        Missing: {match.missing.slice(0, 6).join(', ')}
                      </span>
                    ) : null}
                    {!match.matched?.length && match.reasons?.length ? (
                      <span className="hint">{match.reasons.slice(0, 3).join(' · ')}</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="actions" style={{ marginTop: '0.65rem' }}>
                  <a className="btn" href={job.url} target="_blank" rel="noreferrer">
                    Open posting
                  </a>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void queueApply(job.id)}
                  >
                    Queue apply / fill
                  </button>
                </div>
              </article>
            ) : null
          )
        )}
      </div>
    </div>
  )
}
