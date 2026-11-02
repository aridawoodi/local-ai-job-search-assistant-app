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
  const [careerUrlsText, setCareerUrlsText] = useState(
    (prefs.companyCareerUrls || []).join('\n')
  )

  async function refreshOllama() {
    setOllama(await window.desktopApi.checkOllama())
  }

  useEffect(() => {
    void refreshOllama()
  }, [prefs.ollamaUrl])

  useEffect(() => {
    setCareerUrlsText((prefs.companyCareerUrls || []).join('\n'))
  }, [prefs.companyCareerUrls])

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

  function toggleSource(
    key: keyof AppPreferences['enabledSources'],
    value: boolean
  ) {
    void onChange({
      enabledSources: { ...prefs.enabledSources, [key]: value }
    })
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
          <p className="hint">
            Confirm before each fill, or unattended fill after setup. Neither mode auto-submits
            applications in this milestone.
          </p>
          <select
            id="applySafety"
            value={prefs.applySafety}
            onChange={(e) =>
              void onChange({ applySafety: e.target.value as ApplySafetyMode })
            }
          >
            <option value="confirm">Confirm before apply</option>
            <option value="unattended">Unattended fill (no auto-submit)</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="browser">Browser to drive</label>
          <p className="hint">
            Dedicated persistent profile under userData (Chrome and Edge are separate folders —
            switching browsers means logging in again). No job-board APIs.
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
          <label>Search sources</label>
          <p className="hint">Toggle drivers. Rate limit between sources: {prefs.sourceRateLimitMs}ms.</p>
          <div className="source-toggles">
            {(
              [
                ['indeed', 'Indeed'],
                ['google', 'Google Jobs'],
                ['linkedin', 'LinkedIn'],
                ['companySites', 'Company career sites']
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={prefs.enabledSources[key]}
                  onChange={(e) => toggleSource(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="searchQuery">Search query</label>
          <p className="hint">Empty → derive from profile title + top skills.</p>
          <input
            id="searchQuery"
            type="text"
            placeholder="e.g. Data Engineer Python"
            value={prefs.searchQuery}
            onChange={(e) => void onChange({ searchQuery: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="searchLocation">Search location</label>
          <p className="hint">Empty → profile location or Remote.</p>
          <input
            id="searchLocation"
            type="text"
            placeholder="e.g. Remote or Chicago, IL"
            value={prefs.searchLocation}
            onChange={(e) => void onChange({ searchLocation: e.target.value })}
          />
        </div>

        <div className="field">
          <label htmlFor="careerUrls">Company career URLs</label>
          <p className="hint">One listing URL per line (Greenhouse boards, Lever, careers pages).</p>
          <textarea
            id="careerUrls"
            rows={4}
            value={careerUrlsText}
            onChange={(e) => setCareerUrlsText(e.target.value)}
            onBlur={() =>
              void onChange({
                companyCareerUrls: careerUrlsText
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
              })
            }
          />
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
