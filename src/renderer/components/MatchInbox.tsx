import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { JobListing, MatchResult } from '../../shared/types'
import EmptyState from './EmptyState'

interface Props {
  prefs: AppPreferences
  onImproveMatch?: (jobId: string) => void
  /** After queueing Fill, parent should switch to Apply. */
  onFillQueued?: (jobId: string) => void
}

function scoreTone(score: number): string {
  if (score >= 70) return '#16a34a'
  if (score >= 45) return '#d97706'
  return '#dc2626'
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Strong match'
  if (score >= 45) return 'Decent match: tailoring can help'
  return 'Low match: tailor your resume for this one'
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <div
      className="score-ring"
      style={{ '--p': pct, '--c': scoreTone(pct) } as CSSProperties}
      role="img"
      aria-label={`Match ${pct}%`}
    >
      <b>{pct}%</b>
    </div>
  )
}

export default function MatchInbox({ prefs, onImproveMatch, onFillQueued }: Props) {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState<'fits' | 'all'>('fits')
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})

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
    return list
      .filter((r) => r.job && !dismissed[r.job.id])
      .sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
  }, [jobs, matches, filter, dismissed])

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

  async function openPosting(jobId: string) {
    setBusy(true)
    try {
      const result = await window.desktopApi.openJobPosting(jobId)
      setMsg(result.message)
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
      const summary = results.map((r) => `${r.status}: ${r.message}`).join('\n')
      setMsg(summary)
      onFillQueued?.(jobId)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel wide">
      <h2>Matches</h2>
      <p className="lede">
        Extension-style match cards: score ring, keyword coverage, and Improve match. Threshold{' '}
        {prefs.matchThreshold}.
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

      <div className="card-list match-card-list">
        {rows.length === 0 ? (
          <EmptyState
            title="No matches yet"
            body="Score jobs against your local profile. Best fits can notify you and queue for Fill."
            steps={[
              'Pipeline → Run search → match → notify (or Search, then Score jobs here).',
              `Fits use threshold ${prefs.matchThreshold} — lower it in Settings if everything scores shy.`,
              'Open a posting, Improve match (Resume), or Fill this application when a card looks right.'
            ]}
          />
        ) : (
          rows.map(({ job, match }) => {
            if (!job) return null
            const matched = match?.matched || []
            const missing = match?.missing || []
            const total = matched.length + missing.length
            const matchedCount = matched.length
            const score = match?.score ?? 0
            return (
              <article key={job.id} className="match-card inbox-card">
                <button
                  type="button"
                  className="match-dismiss"
                  aria-label="Dismiss match card"
                  onClick={() => setDismissed((d) => ({ ...d, [job.id]: true }))}
                >
                  ×
                </button>
                <div className="match-card-body">
                  {match ? <ScoreRing score={score} /> : <div className="score-ring unscored"><b>—</b></div>}
                  <div className="match-card-main">
                    <div className="inbox-head" style={{ paddingRight: '1.5rem' }}>
                      <div>
                        <h3>{match?.title || job.title}</h3>
                        <p>
                          {match?.company || job.company}
                          {job.location ? ` · ${job.location}` : ''}
                        </p>
                      </div>
                      <span className="pill">{job.source}</span>
                    </div>
                    {match ? (
                      <>
                        <p className="match-coverage">
                          Matches {matchedCount} of {total || '—'} keywords
                        </p>
                        <p className="hint">{scoreLabel(score)}</p>
                      </>
                    ) : (
                      <p className="hint">Unscored — run Score jobs.</p>
                    )}
                    {missing.length ? (
                      <div className="kw-block">
                        <div className="kw-label">Missing from your resume</div>
                        <div className="kw">
                          {missing.slice(0, 8).map((k) => (
                            <span key={k} className="miss">
                              {k}
                            </span>
                          ))}
                          {missing.length > 8 ? (
                            <span className="miss">+{missing.length - 8}</span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {matched.length ? (
                      <div className="kw-block">
                        <div className="kw-label">Already in your resume</div>
                        <div className="kw">
                          {matched.slice(0, 8).map((k) => (
                            <span key={k}>{k}</span>
                          ))}
                          {matched.length > 8 ? <span>+{matched.length - 8}</span> : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="actions" style={{ marginTop: '0.75rem' }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => void openPosting(job.id)}
                      >
                        Open posting
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => onImproveMatch?.(job.id)}
                      >
                        Improve my match
                      </button>
                      <button
                        className="btn primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void queueApply(job.id)}
                      >
                        Fill this application
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}
