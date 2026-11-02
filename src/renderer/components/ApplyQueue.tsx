import { useEffect, useMemo, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { ApplyResult, JobListing } from '../../shared/types'

interface Props {
  prefs: AppPreferences
}

export default function ApplyQueue({ prefs }: Props) {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [results, setResults] = useState<ApplyResult[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function reload() {
    const [j, a] = await Promise.all([
      window.desktopApi.getLastJobs(),
      window.desktopApi.getLastApplyResults()
    ])
    setJobs(j)
    setResults(a)
  }

  useEffect(() => {
    void reload()
  }, [])

  const pending = useMemo(
    () => results.filter((r) => r.status === 'pending_confirm'),
    [results]
  )
  const filled = useMemo(
    () =>
      results.filter(
        (r) =>
          r.status === 'filled' ||
          r.status === 'needs_you' ||
          r.status === 'submitted' ||
          r.submitted
      ),
    [results]
  )

  async function queueTopFits() {
    setBusy(true)
    try {
      let source = jobs
      if (!source.length) {
        const search = await window.desktopApi.runSearch()
        source = search.jobs
        setJobs(source)
      }
      const matches = await window.desktopApi.runMatch(source)
      const ids = matches
        .filter((m) => m.fits)
        .slice(0, 5)
        .map((m) => m.jobId)
      if (!ids.length) {
        setMsg('No fits to queue — lower threshold or run a broader search.')
        return
      }
      const next = await window.desktopApi.runApply(ids)
      setResults(next)
      setMsg(
        prefs.applySafety === 'confirm'
          ? `Queued ${next.filter((r) => r.status === 'pending_confirm').length} for confirmation.`
          : `Unattended fill finished for ${next.length} job(s).`
      )
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmSelected(ids: string[]) {
    setBusy(true)
    try {
      const next = await window.desktopApi.confirmApply(ids)
      setResults(next)
      setMsg(
        `Confirmed fill: ${next.filter((r) => r.status === 'filled' || r.status === 'needs_you').length} filled` +
          (next.some((r) => r.submitted) ? `, ${next.filter((r) => r.submitted).length} submitted` : ' (submit blocked in confirm mode)') +
          '. Tracker updated.'
      )
      await reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel wide">
      <h2>Apply queue</h2>
      <p className="lede">
        Safety: <strong>{prefs.applySafety}</strong>
        {prefs.applySafety === 'unattended'
          ? prefs.allowAutoSubmit
            ? ' · auto-submit ON'
            : ' · fill only (auto-submit off)'
          : ' · confirm required; auto-submit blocked'}
        . Daily cap {prefs.maxActionsPerDay}.
      </p>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void queueTopFits()}>
          Queue top fits
        </button>
        <button
          className="btn"
          disabled={busy || !pending.length}
          onClick={() => void confirmSelected(pending.map((p) => p.jobId))}
        >
          Confirm all pending ({pending.length})
        </button>
      </div>

      {msg ? <p className="hint" style={{ marginTop: '0.75rem' }}>{msg}</p> : null}

      <div className="split-cols">
        <section>
          <h3>Pending confirm</h3>
          {pending.length === 0 ? (
            <p className="hint">Nothing waiting.</p>
          ) : (
            <div className="card-list">
              {pending.map((r) => {
                const job = jobs.find((j) => j.id === r.jobId)
                return (
                  <article key={r.jobId} className="inbox-card">
                    <h3>{job?.title || r.jobId}</h3>
                    <p>
                      {job?.company || ''}
                      {job?.location ? ` · ${job.location}` : ''}
                    </p>
                    <p className="hint">{r.message}</p>
                    <div className="actions">
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void confirmSelected([r.jobId])}
                      >
                        Confirm &amp; fill
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <h3>Filled / submitted / needs you</h3>
          {filled.length === 0 ? (
            <p className="hint">No fills yet this session.</p>
          ) : (
            <div className="card-list">
              {filled.map((r) => {
                const job = jobs.find((j) => j.id === r.jobId)
                const submitted = r.submitted || r.status === 'submitted'
                return (
                  <article key={r.jobId} className="inbox-card">
                    <div className="inbox-head">
                      <div>
                        <h3>{job?.title || r.jobId}</h3>
                        <p>{job?.company || r.adapter || ''}</p>
                      </div>
                      <span
                        className={`pill ${
                          r.status === 'needs_you' ? 'bad' : submitted ? 'ok' : ''
                        }`}
                      >
                        {r.status}
                        {r.submitConfirmed ? ' · confirmed' : ''}
                      </span>
                    </div>
                    <p className="hint">
                      Filled {r.filledCount ?? 0}
                      {r.needsYouCount ? ` · needs you ${r.needsYouCount}` : ''}
                      {submitted
                        ? r.submitConfirmed
                          ? ' · submit tracked'
                          : ' · submitted'
                        : ' · no auto-submit'}
                      {r.stepsAdvanced ? ` · ${r.stepsAdvanced} step(s)` : ''}
                    </p>
                    {r.fields?.length ? (
                      <ul className="field-report">
                        {r.fields.slice(0, 8).map((f, i) => (
                          <li key={`${r.jobId}-${i}`}>
                            <span className={`pill ${f.status === 'filled' ? 'ok' : 'bad'}`}>
                              {f.status}
                            </span>{' '}
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
