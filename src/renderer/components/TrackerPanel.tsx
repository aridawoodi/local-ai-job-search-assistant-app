import { useEffect, useMemo, useState } from 'react'
import type { ApplicationRow, TrackerStage } from '../../shared/tracker'
import { TRACKER_STAGES } from '../../shared/tracker'
import EmptyState from './EmptyState'

export default function TrackerPanel() {
  const [rows, setRows] = useState<ApplicationRow[]>([])
  const [stageFilter, setStageFilter] = useState<TrackerStage | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [reminderDraft, setReminderDraft] = useState('')

  async function reload() {
    setRows(await window.desktopApi.listApplications())
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = useMemo(
    () => (stageFilter === 'all' ? rows : rows.filter((r) => r.stage === stageFilter)),
    [rows, stageFilter]
  )

  async function setStage(key: string, stage: TrackerStage) {
    setBusy(true)
    try {
      await window.desktopApi.updateApplication(key, { stage })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function saveNotes(key: string) {
    setBusy(true)
    try {
      await window.desktopApi.updateApplication(key, {
        notes: notesDraft,
        reminderAt: reminderDraft
      })
      setEditing(null)
      await reload()
      setMsg('Saved notes / reminder.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(key: string) {
    setBusy(true)
    try {
      setRows(await window.desktopApi.deleteApplication(key))
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv() {
    setBusy(true)
    try {
      const result = await window.desktopApi.exportApplicationsCsv()
      setMsg(result.message)
    } finally {
      setBusy(false)
    }
  }

  async function checkReminders() {
    setBusy(true)
    try {
      const result = await window.desktopApi.checkReminders()
      setMsg(
        result.due.length
          ? `${result.due.length} due reminder(s); notified ${result.notified}.`
          : 'No reminders due.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel wide">
      <h2>Tracker</h2>
      <p className="lede">
        Extension-compatible application stages, notes, reminders, and CSV export. Fills from Apply
        queue write rows automatically.
      </p>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void exportCsv()}>
          Export CSV
        </button>
        <button className="btn" disabled={busy} onClick={() => void checkReminders()}>
          Check reminders
        </button>
        <button className="btn" disabled={busy} onClick={() => void reload()}>
          Refresh
        </button>
      </div>

      <div className="stage-filters">
        <button
          className={`btn ${stageFilter === 'all' ? 'primary' : ''}`}
          onClick={() => setStageFilter('all')}
        >
          All ({rows.length})
        </button>
        {TRACKER_STAGES.map((s) => {
          const count = rows.filter((r) => r.stage === s.id).length
          return (
            <button
              key={s.id}
              className={`btn ${stageFilter === s.id ? 'primary' : ''}`}
              onClick={() => setStageFilter(s.id)}
            >
              {s.label} ({count})
            </button>
          )
        })}
      </div>

      {msg ? <p className="hint" style={{ marginTop: '0.75rem' }}>{msg}</p> : null}

      <div className="card-list">
        {filtered.length === 0 ? (
          <EmptyState
            title="No applications tracked"
            body="Rows appear when Apply fills a form, or when you import an extension backup that includes applications."
            steps={[
              'Preferences → Import from file (full backup) to bring existing tracker rows.',
              'Or Matches / Apply → queue a fit and confirm fill.',
              'Stages, notes, reminders, and CSV export live here once rows exist.'
            ]}
          />
        ) : (
          filtered.map((row) => (
            <article key={row.key} className="inbox-card">
              <div className="inbox-head">
                <div>
                  <h3>{row.title}</h3>
                  <p>
                    {row.company}
                    {row.location ? ` · ${row.location}` : ''}
                    {row.source ? ` · ${row.source}` : ''}
                  </p>
                </div>
                <div className="inbox-meta">
                  <span className="pill ok">{row.stage}</span>
                  <span className="pill">{row.status}</span>
                  {row.score != null ? <span className="pill">score {row.score}</span> : null}
                </div>
              </div>

              <label className="inline-label">
                Stage
                <select
                  value={row.stage}
                  disabled={busy}
                  onChange={(e) => void setStage(row.key, e.target.value as TrackerStage)}
                >
                  {TRACKER_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              {editing === row.key ? (
                <div className="notes-edit">
                  <textarea
                    rows={3}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Notes"
                  />
                  <label className="inline-label">
                    Remind me
                    <input
                      type="date"
                      value={reminderDraft}
                      onChange={(e) => setReminderDraft(e.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() => void saveNotes(row.key)}
                    >
                      Save
                    </button>
                    <button className="btn" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="hint">
                  {row.notes || 'No notes'}
                  {row.reminderAt ? ` · reminder ${row.reminderAt}` : ''}
                </p>
              )}

              <div className="actions">
                {row.url ? (
                  <a className="btn" href={row.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setEditing(row.key)
                    setNotesDraft(row.notes)
                    setReminderDraft(row.reminderAt)
                  }}
                >
                  Notes / reminder
                </button>
                <button className="btn" disabled={busy} onClick={() => void remove(row.key)}>
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
