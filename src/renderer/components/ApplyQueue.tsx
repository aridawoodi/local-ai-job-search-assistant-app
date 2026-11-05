import { useEffect, useMemo, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { ApplyFieldReport, ApplyResult, JobListing } from '../../shared/types'
import EmptyState from './EmptyState'

interface Props {
  prefs: AppPreferences
}

function groupFields(fields: ApplyFieldReport[] | undefined) {
  const list = fields || []
  const needsYou = list.filter(
    (f) => f.status === 'needs_you' || f.status === 'missing'
  )
  const filled = list.filter((f) => f.status === 'filled')
  const skipped = list.filter((f) => f.status === 'skipped')
  return { needsYou, filled, skipped }
}

function FieldGroup({
  title,
  items,
  tone
}: {
  title: string
  items: ApplyFieldReport[]
  tone: 'need' | 'done' | 'skip'
}) {
  if (!items.length) return null
  return (
    <div className={`field-group field-group-${tone}`}>
      <div className="rvh">
        {tone === 'need' ? 'Needs you' : tone === 'done' ? 'Filled' : 'Skipped'} ({items.length})
      </div>
      <ul className="field-report">
        {items.slice(0, 12).map((f, i) => (
          <li key={`${f.label}-${i}`}>
            <span
              className={`pill ${
                tone === 'done' ? 'ok' : tone === 'need' ? 'bad' : ''
              }`}
            >
              {f.status}
            </span>{' '}
            {f.label}
            {f.detail ? <span className="hint"> — {f.detail}</span> : null}
          </li>
        ))}
        {items.length > 12 ? (
          <li className="hint">+{items.length - 12} more</li>
        ) : null}
      </ul>
    </div>
  )
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
        setMsg('No fits to fill — lower threshold or run a broader search.')
        return
      }
      const next = await window.desktopApi.runApply(ids)
      setResults(next)
      setMsg(
        prefs.applySafety === 'confirm'
          ? `Queued ${next.filter((r) => r.status === 'pending_confirm').length} for Fill confirmation.`
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
        `Filled: ${next.filter((r) => r.status === 'filled' || r.status === 'needs_you').length}` +
          (next.some((r) => r.submitted)
            ? `, ${next.filter((r) => r.submitted).length} submitted`
            : ' (submit blocked in confirm mode)') +
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
      <h2>Apply</h2>
      <p className="lede">
        Popup / panel Fill language: queue best fits, confirm, then review{' '}
        <strong>Needs you</strong> vs <strong>Filled</strong> fields. Safety:{' '}
        <strong>{prefs.applySafety}</strong>
        {prefs.applySafety === 'unattended'
          ? prefs.allowAutoSubmit
            ? ' · auto-submit ON'
            : ' · fill only (auto-submit off)'
          : ' · confirm required; auto-submit blocked'}
        . Daily cap {prefs.maxActionsPerDay}.
      </p>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void queueTopFits()}>
          Fill top fits
        </button>
        <button
          className="btn"
          disabled={busy || !pending.length}
          onClick={() => void confirmSelected(pending.map((p) => p.jobId))}
        >
          Confirm &amp; fill all ({pending.length})
        </button>
      </div>

      {msg ? <p className="hint" style={{ marginTop: '0.75rem' }}>{msg}</p> : null}

      {!results.length ? (
        <EmptyState
          title="Nothing to fill yet"
          body="Fill top fits opens forms in the automation browser. Confirm mode never presses Submit for you."
          steps={[
            'Run a search and score matches first (Pipeline or Matches).',
            'Fill top fits — confirm mode parks jobs here until you approve.',
            prefs.applySafety === 'confirm'
              ? 'Confirm & fill writes the tracker; Submit stays manual.'
              : prefs.allowAutoSubmit
                ? 'Unattended + auto-submit may click Submit (daily cap applies).'
                : 'Unattended fills only — you still submit manually.'
          ]}
        />
      ) : null}

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
          <h3>Field review</h3>
          {filled.length === 0 ? (
            <p className="hint">No fills yet this session.</p>
          ) : (
            <div className="card-list">
              {filled.map((r) => {
                const job = jobs.find((j) => j.id === r.jobId)
                const submitted = r.submitted || r.status === 'submitted'
                const groups = groupFields(r.fields)
                return (
                  <article key={r.jobId} className="inbox-card review-card">
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
                      Filled {r.filledCount ?? groups.filled.length}
                      {r.needsYouCount || groups.needsYou.length
                        ? ` · Needs you ${r.needsYouCount ?? groups.needsYou.length}`
                        : ''}
                      {submitted
                        ? r.submitConfirmed
                          ? ' · submit tracked'
                          : ' · submitted'
                        : ' · no auto-submit'}
                      {r.stepsAdvanced ? ` · ${r.stepsAdvanced} step(s)` : ''}
                    </p>
                    <FieldGroup title="Needs you" items={groups.needsYou} tone="need" />
                    <FieldGroup title="Filled" items={groups.filled} tone="done" />
                    <FieldGroup title="Skipped" items={groups.skipped} tone="skip" />
                    {!r.fields?.length ? (
                      <p className="hint">No per-field report for this fill.</p>
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
