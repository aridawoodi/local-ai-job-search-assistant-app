import { useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'

interface Props {
  onDone: (prefs: AppPreferences) => void
}

export default function Onboarding({ onDone }: Props) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function importFile() {
    setBusy(true)
    try {
      const result = await window.desktopApi.importExtensionProfile()
      if (result.cancelled) {
        setMessage('Import cancelled — pick a file, load the sample, or skip.')
        return
      }
      setMessage(result.message)
      if (result.ok) onDone(await window.desktopApi.getPreferences())
    } finally {
      setBusy(false)
    }
  }

  async function importSample() {
    setBusy(true)
    try {
      const result = await window.desktopApi.importSampleProfile()
      setMessage(result.message)
      if (result.ok) onDone(await window.desktopApi.getPreferences())
    } finally {
      setBusy(false)
    }
  }

  async function skip() {
    setBusy(true)
    try {
      onDone(await window.desktopApi.skipExtensionImport())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="mark" aria-hidden />
        <h2>Fill job applications in minutes, privately</h2>
        <p className="lede">
          Same assistant as the Chrome extension — plus desktop search → match → notify → apply in a
          real Chrome/Edge window. Defaults stay safe: confirm-before-apply, no auto-submit.
        </p>

        <ol className="onboarding-steps">
          <li>
            <strong>Import your resume / profile</strong> — extension export, sample, or skip and
            import later under Settings.
          </li>
          <li>
            <strong>Open the automation browser</strong> — log into LinkedIn/etc. once in that
            window (never typed by the app).
          </li>
          <li>
            <strong>Use Pipeline or Apply</strong> — search → match → notify, then fill with
            confirmation (you still press Submit when you want).
          </li>
        </ol>

        <div className="choice-stack">
          <button className="btn primary choice" disabled={busy} onClick={() => void importFile()}>
            <span className="choice-title">Import extension profile</span>
            <span className="choice-hint">
              Open <code>job-apply-profile.json</code> or a full backup from Job Apply Assistant.
            </span>
          </button>
          <button className="btn choice" disabled={busy} onClick={() => void importSample()}>
            <span className="choice-title">Load sample profile</span>
            <span className="choice-hint">
              Uses <code>fixtures/sample-profile.json</code> (Jordan Rivera) for a safe walkthrough.
            </span>
          </button>
          <button className="btn choice" disabled={busy} onClick={() => void skip()}>
            <span className="choice-title">Skip for now</span>
            <span className="choice-hint">
              Continue empty — import anytime under Settings or Profile → resume.
            </span>
          </button>
        </div>

        {message ? <pre className="status">{message}</pre> : null}
      </div>
    </div>
  )
}
