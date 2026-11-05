import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DesktopDiagnostics } from '../../shared/ipc'

const DESKTOP_REPO = 'https://github.com/aridawoodi/local-ai-job-search-assistant-app'
const CATS = [
  'Not supported site',
  'Filled incorrectly',
  'Bug',
  'Feature request',
  'Question'
] as const

function yes(v: boolean | undefined): string {
  return v ? 'yes' : 'no'
}

function issueBody(dg: DesktopDiagnostics, cat: string, desc: string): string {
  const lines = [
    `**Category:** ${cat}`,
    '',
    '**What happened**',
    desc.trim() || '(no description)',
    '',
    '**Diagnostics** (collected by the desktop app; no personal data)',
    `- App: ${dg.version}`,
    `- OS: ${[dg.platform, dg.arch].filter(Boolean).join(' ')}`,
    `- Browser automation: ${dg.browserOpen ? 'open' : 'idle'}${
      dg.browserChannel ? ` (${dg.browserChannel})` : ''
    }`,
    dg.lastFill
      ? `- Last fill: ${dg.lastFill.filled} filled, ${dg.lastFill.needsYou} needs you, ${dg.lastFill.skipped} skipped`
      : '- Last fill: not run yet',
    `- Local AI: ${dg.useLlm ? 'preferred model set' : 'default / unset'} · Ollama reachable: ${yes(
      dg.ollamaReachable
    )} · models: ${dg.ollamaModelCount}`,
    `- Profile complete: ${yes(dg.profileComplete)}${
      dg.profileMissing.length ? ` (missing: ${dg.profileMissing.join(', ')})` : ''
    } · resume saved: ${yes(dg.resumeSaved)}`
  ]
  return lines.join('\n')
}

export default function ReportPanel() {
  const [diag, setDiag] = useState<DesktopDiagnostics | null>(null)
  const [cat, setCat] = useState<string>(CATS[2])
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    setMsg('')
    try {
      setDiag(await window.desktopApi.getDiagnostics())
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const preview = useMemo(() => {
    if (!diag) return ''
    const title = `[${cat}] Desktop: ${desc.trim().slice(0, 60) || cat}`
    return `Title: ${title}\n\n${issueBody(diag, cat, desc)}`
  }, [diag, cat, desc])

  function openIssue() {
    if (!diag) return
    const title = `[${cat}] Desktop: ${desc.trim().slice(0, 60) || cat}`
    const body = issueBody(diag, cat, desc)
    const url = `${DESKTOP_REPO}/issues/new?title=${encodeURIComponent(
      title
    )}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent(
      cat.toLowerCase().replace(/ /g, '-')
    )}`
    window.open(url, '_blank', 'noopener')
  }

  const li = (ok: boolean, text: string, fix?: string) => (
    <li key={text}>
      {ok ? '✅ ' : '⚠️ '}
      {text}
      {fix ? (
        <div className="hint" style={{ marginLeft: 22 }}>
          {fix}
        </div>
      ) : null}
    </li>
  )

  return (
    <div className="panel">
      <h2>Report</h2>
      <p className="lede">
        Diagnostics + a prefilled GitHub issue draft — same idea as the extension Report tab. No
        personal profile fields are included.
      </p>

      <section className="profile-section">
        <h3>Before you report: quick check</h3>
        {!diag ? (
          <p className="hint">{busy ? 'Checking…' : 'No diagnostics yet.'}</p>
        ) : (
          <ul className="diag-list">
            {li(
              true,
              `Desktop app ${diag.version} · ${[diag.platform, diag.arch].filter(Boolean).join(' ')}`
            )}
            {li(
              diag.ollamaReachable,
              diag.ollamaReachable
                ? 'Local AI (Ollama) is running'
                : "Local AI (Ollama) isn't reachable",
              diag.ollamaReachable ? undefined : 'Start the Ollama app, or check Settings → Local AI.'
            )}
            {diag.ollamaReachable
              ? li(
                  diag.ollamaModelCount > 0,
                  diag.ollamaModelCount
                    ? `At least one model is downloaded${
                        diag.ollamaModelHint ? ` (${diag.ollamaModelHint})` : ''
                      }`
                    : 'No models downloaded yet',
                  diag.ollamaModelCount
                    ? undefined
                    : 'Pull a model in Ollama, then set it in Settings → Local AI.'
                )
              : null}
            {li(
              diag.profileComplete,
              diag.profileComplete
                ? 'Profile complete'
                : `Profile is missing: ${diag.profileMissing.join(', ')}`,
              diag.profileComplete ? undefined : 'Open Profile and fill the basics.'
            )}
            {li(
              diag.resumeSaved,
              diag.resumeSaved ? 'Resume saved' : 'No resume imported yet',
              diag.resumeSaved ? undefined : 'Profile → Import resume (PDF/DOCX).'
            )}
            {li(
              true,
              diag.browserOpen
                ? `Automation browser open (${diag.browserChannel || 'browser'})`
                : 'Automation browser idle'
            )}
            {diag.lastFill
              ? li(
                  diag.lastFill.needsYou === 0,
                  `Last fill: ${diag.lastFill.filled} filled, ${diag.lastFill.needsYou} needs you, ${diag.lastFill.skipped} skipped`
                )
              : li(true, 'Last fill: not run yet')}
          </ul>
        )}
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void load()}>
            Refresh checks
          </button>
        </div>
      </section>

      <section className="profile-section">
        <h3>Tell us what happened</h3>
        <label className="hint" htmlFor="report-cat">
          Category
        </label>
        <select
          id="report-cat"
          className="field"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          {CATS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="hint" htmlFor="report-desc" style={{ display: 'block', marginTop: 8 }}>
          Description
        </label>
        <textarea
          id="report-desc"
          className="field"
          rows={4}
          placeholder="What did you expect, and what happened instead? Please don't include personal details (name, email, answers)."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <p className="hint" style={{ marginTop: 8 }}>
          Exactly what will be included (nothing else is sent; GitHub opens with this text and you
          press “Submit new issue” yourself):
        </p>
        <pre className="report-preview">{preview || '…'}</pre>
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <button className="btn primary" type="button" disabled={!diag} onClick={openIssue}>
            Open a GitHub issue (you review it there)
          </button>
        </div>
        {msg ? <p className="hint">{msg}</p> : null}
      </section>
    </div>
  )
}
