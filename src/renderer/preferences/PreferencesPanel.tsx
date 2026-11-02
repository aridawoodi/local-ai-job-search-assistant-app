import { useEffect, useState } from 'react'
import type {
  AppPreferences,
  ApplySafetyMode,
  BrowserPreference
} from '../../shared/preferences'
import type { OllamaStatus } from '../../shared/ollama'

interface Props {
  prefs: AppPreferences
  onChange: (partial: Partial<AppPreferences>) => Promise<void>
  onPrefsReload: (prefs: AppPreferences) => void
  onProfileReload: () => Promise<void>
}

export default function PreferencesPanel({
  prefs,
  onChange,
  onPrefsReload,
  onProfileReload
}: Props) {
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [importMsg, setImportMsg] = useState('')

  async function refreshOllama() {
    setOllama(await window.desktopApi.checkOllama())
  }

  useEffect(() => {
    void refreshOllama()
  }, [prefs.ollamaUrl])

  async function onImport() {
    const result = await window.desktopApi.importExtensionProfile()
    if (result.cancelled) {
      setImportMsg('Import cancelled.')
      return
    }
    setImportMsg(result.message)
    onPrefsReload(await window.desktopApi.getPreferences())
    await onProfileReload()
  }

  async function onSample() {
    const result = await window.desktopApi.importSampleProfile()
    setImportMsg(result.message)
    onPrefsReload(await window.desktopApi.getPreferences())
    await onProfileReload()
  }

  async function onSkipImport() {
    onPrefsReload(await window.desktopApi.skipExtensionImport())
    setImportMsg('Import skipped — you can import anytime.')
  }

  return (
    <div className="panel">
      <h2>Preferences</h2>
      <p className="lede">
        User-controlled settings. Defaults are safe; nothing is hard-locked to one mode.
      </p>

      <div className="grid">
        <div className="field">
          <label htmlFor="applySafety">Apply safety</label>
          <p className="hint">Confirm before each submit, or run unattended after setup.</p>
          <select
            id="applySafety"
            value={prefs.applySafety}
            onChange={(e) =>
              void onChange({ applySafety: e.target.value as ApplySafetyMode })
            }
          >
            <option value="confirm">Confirm before apply</option>
            <option value="unattended">Unattended after setup</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="browser">Browser to drive</label>
          <p className="hint">
            Playwright will use a dedicated persistent Chrome/Edge profile (Milestone 2). No
            job-board APIs.
          </p>
          <select
            id="browser"
            value={prefs.browser}
            onChange={(e) =>
              void onChange({ browser: e.target.value as BrowserPreference })
            }
          >
            <option value="either">Either (prefer available)</option>
            <option value="chrome">Chrome</option>
            <option value="edge">Edge</option>
          </select>
        </div>

        <div className="field">
          <label>Extension profile import</label>
          <p className="hint">
            Day-one support for <code>job-apply-profile.json</code> and{' '}
            <code>kind: job-apply-assistant-backup</code>. Status:{' '}
            <strong>{prefs.extensionImportStatus.replace('_', ' ')}</strong>
          </p>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn primary" type="button" onClick={() => void onImport()}>
              Import from file
            </button>
            <button className="btn" type="button" onClick={() => void onSample()}>
              Load sample
            </button>
            <button className="btn" type="button" onClick={() => void onSkipImport()}>
              Skip for now
            </button>
          </div>
          {importMsg ? <p className="hint">{importMsg}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="ollamaUrl">Ollama URL</label>
          <p className="hint">Soft dependency — local AI for drafts/match refine later.</p>
          <input
            id="ollamaUrl"
            type="text"
            value={prefs.ollamaUrl}
            onChange={(e) => void onChange({ ollamaUrl: e.target.value })}
          />
          <div className="actions" style={{ marginTop: '0.5rem' }}>
            <button className="btn" type="button" onClick={() => void refreshOllama()}>
              Check Ollama
            </button>
            {ollama ? (
              <span className={`pill ${ollama.reachable ? 'ok' : 'bad'}`}>
                <span className="dot" />
                {ollama.message}
              </span>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label htmlFor="threshold">Match threshold ({prefs.matchThreshold})</label>
          <p className="hint">Minimum score (0–100) before notify / apply.</p>
          <input
            id="threshold"
            type="number"
            min={0}
            max={100}
            value={prefs.matchThreshold}
            onChange={(e) =>
              void onChange({ matchThreshold: Number(e.target.value) || 0 })
            }
          />
        </div>

        <div className="field">
          <label htmlFor="maxActions">Max actions per day</label>
          <p className="hint">Soft cap on automated apply/fill actions.</p>
          <input
            id="maxActions"
            type="number"
            min={1}
            max={500}
            value={prefs.maxActionsPerDay}
            onChange={(e) =>
              void onChange({ maxActionsPerDay: Number(e.target.value) || 1 })
            }
          />
        </div>
      </div>
    </div>
  )
}
