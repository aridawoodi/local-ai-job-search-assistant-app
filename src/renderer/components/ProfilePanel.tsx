import { useEffect, useState } from 'react'
import type { AnswerBankEntry, StoredProfileBundle } from '../../shared/profile'
import { profileDisplayName } from '../../shared/profile'
import EmptyState from './EmptyState'

interface Props {
  bundle: StoredProfileBundle
  onReload?: () => Promise<void>
}

export default function ProfilePanel({ bundle, onReload }: Props) {
  const p = bundle.profile
  const empty = !p.firstName && !p.email && p.skills.length === 0 && !p.resumeText
  const [bank, setBank] = useState<AnswerBankEntry[]>(bundle.answerBank || [])
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBank(bundle.answerBank || [])
  }, [bundle.answerBank])

  async function onImportResume() {
    setBusy(true)
    try {
      const r = await window.desktopApi.importResume()
      if (r.cancelled) {
        setMsg('Cancelled.')
        return
      }
      setMsg(r.message)
      await onReload?.()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onAddAnswer() {
    if (!q.trim() || !a.trim()) return
    setBusy(true)
    try {
      const r = await window.desktopApi.upsertAnswerBank([
        { q: q.trim(), a: a.trim(), source: 'manual' }
      ])
      setBank(r.bank)
      setMsg(
        `Answer bank: +${r.added} added, ${r.updated} updated, ${r.skipped} skipped (similarity ≥85% / never-learn).`
      )
      setQ('')
      setA('')
      await onReload?.()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(i: number) {
    const next = await window.desktopApi.deleteAnswerBank(i)
    setBank(next)
    await onReload?.()
  }

  return (
    <div className="panel wide">
      <h2>Profile</h2>
      <p className="lede">
        Local copy from extension import and/or resume PDF/DOCX. EEO is never inferred from a resume.
      </p>

      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary" disabled={busy} onClick={() => void onImportResume()}>
          Import resume (PDF/DOCX)
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void (async () => {
              setBusy(true)
              try {
                const r = await window.desktopApi.exportProfile()
                setMsg(r.message)
              } finally {
                setBusy(false)
              }
            })()
          }
        >
          Export profile JSON
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void (async () => {
              setBusy(true)
              try {
                const r = await window.desktopApi.exportFullBackup()
                setMsg(r.message)
              } finally {
                setBusy(false)
              }
            })()
          }
        >
          Export full backup
        </button>
      </div>
      {msg ? <p className="hint">{msg}</p> : null}

      {empty ? (
        <EmptyState
          title="No profile loaded yet"
          body="Matching and apply-fill need local profile fields. EEO is never inferred from a resume."
          steps={[
            'Import resume (PDF/DOCX) here, or Settings → Import from file / Load sample.',
            'Add answer-bank Q&A for common application questions.',
            'Export profile / full backup anytime — data stays under Electron userData.'
          ]}
        />
      ) : (
        <>
          <div className="profile-grid">
            <div className="kv">
              <span className="k">Name</span>
              <span className="v">{profileDisplayName(p)}</span>
            </div>
            <div className="kv">
              <span className="k">Email</span>
              <span className="v">{p.email || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Title</span>
              <span className="v">{p.currentTitle || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Location</span>
              <span className="v">
                {p.location || [p.city, p.state].filter(Boolean).join(', ') || '—'}
              </span>
            </div>
            <div className="kv">
              <span className="k">Answer bank</span>
              <span className="v">{bank.length}</span>
            </div>
            <div className="kv">
              <span className="k">Resume text</span>
              <span className="v">{p.resumeText ? `${p.resumeText.length} chars` : '—'}</span>
            </div>
          </div>

          <div className="field" style={{ marginTop: '1rem' }}>
            <label>Skills</label>
            <div className="skills">
              {p.skills.length ? (
                p.skills.map((s) => (
                  <span key={s} className="skill">
                    {s}
                  </span>
                ))
              ) : (
                <span className="hint">No skills yet.</span>
              )}
            </div>
          </div>

          {p.summary ? (
            <div className="field" style={{ marginTop: '1rem' }}>
              <label>Summary</label>
              <p className="hint" style={{ color: 'var(--text)' }}>
                {p.summary}
              </p>
            </div>
          ) : null}
        </>
      )}

      <section style={{ marginTop: '1.5rem' }}>
        <h3>Answer bank</h3>
        <p className="hint">
          Similarity merge ≥85% (extension parity). Sensitive / consent prompts are never learned.
        </p>
        <div className="field">
          <label htmlFor="bankQ">Question</label>
          <input id="bankQ" type="text" value={q} onChange={(e) => setQ(e.target.value)} />
          <label htmlFor="bankA">Answer</label>
          <textarea id="bankA" rows={3} value={a} onChange={(e) => setA(e.target.value)} />
          <div className="actions" style={{ marginTop: '0.5rem' }}>
            <button
              className="btn primary"
              disabled={busy || !q.trim() || !a.trim()}
              onClick={() => void onAddAnswer()}
            >
              Save to bank
            </button>
          </div>
        </div>

        {bank.length === 0 ? (
          <p className="hint">No saved answers yet.</p>
        ) : (
          <div className="card-list">
            {bank.map((entry, i) => (
              <article key={`${entry.q}-${i}`} className="inbox-card">
                <h3>{entry.q}</h3>
                <p>{entry.a}</p>
                <p className="hint">
                  {entry.source || 'saved'}
                  {entry.companySpecific ? ' · company-specific' : ''}
                </p>
                <div className="actions">
                  <button className="btn" onClick={() => void onDelete(i)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
