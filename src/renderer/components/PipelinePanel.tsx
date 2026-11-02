import { useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { ApplyResult, JobListing, MatchResult } from '../../shared/types'

interface Props {
  prefs: AppPreferences
}

export default function PipelinePanel({ prefs }: Props) {
  const [log, setLog] = useState('Run a stub pipeline step to exercise IPC + modules.')
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [busy, setBusy] = useState(false)

  async function runSearch() {
    setBusy(true)
    try {
      const found = await window.desktopApi.runSearch()
      setJobs(found)
      setLog(`Search stub → ${found.length} listing(s)\n` + JSON.stringify(found, null, 2))
    } finally {
      setBusy(false)
    }
  }

  async function runMatch() {
    setBusy(true)
    try {
      const source = jobs.length
        ? jobs
        : await window.desktopApi.runSearch()
      if (!jobs.length) setJobs(source)
      const scored = await window.desktopApi.runMatch(source)
      setMatches(scored)
      setLog(`Match stub → ${scored.length} result(s)\n` + JSON.stringify(scored, null, 2))
    } finally {
      setBusy(false)
    }
  }

  async function runNotify() {
    setBusy(true)
    try {
      const source =
        matches.length ||
        (await (async () => {
          const j = jobs.length ? jobs : await window.desktopApi.runSearch()
          const m = await window.desktopApi.runMatch(j)
          setJobs(j)
          setMatches(m)
          return m
        })())
      const result = await window.desktopApi.notifyBestFits(
        Array.isArray(source) ? source : matches
      )
      setLog(`Notify stub → notified ${result.notified}`)
    } finally {
      setBusy(false)
    }
  }

  async function runApply() {
    setBusy(true)
    try {
      const ids = (jobs.length ? jobs : [{ id: 'stub-1' }]).map((j) => j.id)
      const results: ApplyResult[] = await window.desktopApi.runApply(ids)
      setLog(
        `Apply stub (mode=${prefs.applySafety}) →\n` + JSON.stringify(results, null, 2)
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h2>Automation pipeline</h2>
      <p className="lede">
        Search → match → notify → apply. Browser: <strong>{prefs.browser}</strong>, safety:{' '}
        <strong>{prefs.applySafety}</strong>. Modules are stubs until browser automation is
        wired.
      </p>
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void runSearch()}>
          Search
        </button>
        <button className="btn" disabled={busy} onClick={() => void runMatch()}>
          Match
        </button>
        <button className="btn" disabled={busy} onClick={() => void runNotify()}>
          Notify
        </button>
        <button className="btn" disabled={busy} onClick={() => void runApply()}>
          Apply
        </button>
      </div>
      <pre className="status">{log}</pre>
    </div>
  )
}
