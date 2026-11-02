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
        setMessage('Import cancelled.')
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
        <h2>Job Search Assistant</h2>
        <p className="lede">
          Desktop search → match → notify → apply via a real browser. Import your Job Apply
          Assistant profile now, or skip and set up later.
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn primary" disabled={busy} onClick={() => void importFile()}>
            Import extension profile
          </button>
          <button className="btn" disabled={busy} onClick={() => void importSample()}>
            Load sample profile
          </button>
          <button className="btn" disabled={busy} onClick={() => void skip()}>
            Skip for now
          </button>
        </div>
        {message ? <pre className="status">{message}</pre> : null}
      </div>
    </div>
  )
}
