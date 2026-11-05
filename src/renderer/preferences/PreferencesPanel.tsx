import { useEffect, useState } from 'react'
import type {
  AppPreferences,
  ApplySafetyMode,
  BrowserPreference
} from '../../shared/preferences'
import type { OllamaStatus } from '../../shared/ollama'
import { FIELD_GROUPS, defaultFieldToggles } from '../../shared/field-groups'

interface Props {
  prefs: AppPreferences
  onChange: (partial: Partial<AppPreferences>) => Promise<void>
  onPrefsReload: (prefs: AppPreferences) => void
  onProfileReload: () => Promise<void>
}

const SETTINGS_NAV = [
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'fields', label: 'Fields' },
  { id: 'style', label: 'Writing style' },
  { id: 'bank', label: 'Answer bank' },
  { id: 'browser', label: 'Browser' },
  { id: 'sites', label: 'Sources' },
  { id: 'ai', label: 'Local AI' },
  { id: 'tailoring', label: 'Tailoring' },
  { id: 'backups', label: 'Backups' },
  { id: 'io', label: 'Import / export' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'schedule', label: 'Schedule' }
]

export default function PreferencesPanel({
  prefs,
  onChange,
  onPrefsReload,
  onProfileReload
}: Props) {
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const [scheduleMsg, setScheduleMsg] = useState('')
  const [practiceMsg, setPracticeMsg] = useState('')
  const [careerUrlsText, setCareerUrlsText] = useState(
    (prefs.companyCareerUrls || []).join('\n')
  )
  const toggles = prefs.fieldToggles || defaultFieldToggles()

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
    <div className="panel wide settings-panel">
      <h2>Settings</h2>
      <p className="lede">
        Grouped like the extension Options page (Behaviour, Local AI, Sources, Backups, Import).
        Profile fields live under <strong>Profile</strong>; this hub is setup and behaviour.
      </p>

      <nav className="section-nav" aria-label="Settings sections">
        {SETTINGS_NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} className="section-nav-link">
            {n.label}
          </a>
        ))}
      </nav>

      <section id="behaviour" className="profile-section">
        <h3>Behaviour</h3>
        <p className="hint">
          Desktop apply safety maps to the extension’s confirm / auto-fill behaviour. Confirm mode
          never auto-submits.
        </p>
        <div className="field">
          <label htmlFor="applySafety">Apply safety</label>
          <select
            id="applySafety"
            value={prefs.applySafety}
            onChange={(e) =>
              void onChange({ applySafety: e.target.value as ApplySafetyMode })
            }
          >
            <option value="confirm">Confirm before apply</option>
            <option value="unattended">Unattended apply</option>
          </select>
          <label className="check" style={{ marginTop: '0.65rem' }}>
            <input
              type="checkbox"
              checked={prefs.allowAutoSubmit}
              disabled={prefs.applySafety === 'confirm'}
              onChange={(e) => void onChange({ allowAutoSubmit: e.target.checked })}
            />
            Allow auto-submit (unattended only)
          </label>
          <label className="check" style={{ marginTop: '0.65rem' }}>
            <input
              type="checkbox"
              checked={prefs.allowAdvanceSteps}
              onChange={(e) => void onChange({ allowAdvanceSteps: e.target.checked })}
            />
            Advance multi-step / Easy Apply (Next/Continue)
          </label>
          <label htmlFor="maxFormSteps" style={{ marginTop: '0.5rem' }}>
            Max form steps
          </label>
          <input
            id="maxFormSteps"
            type="number"
            min={1}
            max={20}
            value={prefs.maxFormSteps}
            onChange={(e) =>
              void onChange({ maxFormSteps: Math.max(1, Number(e.target.value) || 1) })
            }
          />
          <label htmlFor="maxActions" style={{ marginTop: '0.5rem' }}>
            Max actions per day
          </label>
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
          <label htmlFor="threshold" style={{ marginTop: '0.5rem' }}>
            Match threshold ({prefs.matchThreshold})
          </label>
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
          <label className="check" style={{ marginTop: '0.65rem' }}>
            <input
              type="checkbox"
              checked={prefs.rememberAnswers}
              onChange={(e) => void onChange({ rememberAnswers: e.target.checked })}
            />
            Remember my answers (merge typed answers into the answer bank when available)
          </label>
          <div className="actions" style={{ marginTop: '0.85rem' }}>
            <button
              className="btn"
              type="button"
              onClick={() =>
                void (async () => {
                  const r = await window.desktopApi.openPracticeTour()
                  setPracticeMsg(r.message)
                })()
              }
            >
              Take the practice tour
            </button>
          </div>
          {practiceMsg ? <p className="hint">{practiceMsg}</p> : null}
        </div>
      </section>

      <section id="fields" className="profile-section">
        <h3>Fields to fill</h3>
        <p className="hint">
          Untick anything you&apos;d rather fill yourself. Turned-off fields stay empty during Fill
          (consent boxes are never ticked).
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <button
            className="btn"
            type="button"
            onClick={() => void onChange({ fieldToggles: defaultFieldToggles() })}
          >
            Turn all on
          </button>
        </div>
        <div className="field-tree">
          {FIELD_GROUPS.map(([group, items]) => (
            <div key={group} className="field-tree-group">
              <h4>{group}</h4>
              <div className="review-grid">
                {items.map(([key, label]) => (
                  <label key={key} className="check">
                    <input
                      type="checkbox"
                      checked={toggles[key] !== false}
                      onChange={(e) =>
                        void onChange({
                          fieldToggles: { ...toggles, [key]: e.target.checked }
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="style" className="profile-section">
        <h3>Writing style</h3>
        <p className="hint">
          Tone notes and writing samples live on the <strong>Profile</strong> tab (Writing section) —
          same fields as extension Options → Writing style.
        </p>
      </section>

      <section id="bank" className="profile-section">
        <h3>Answer bank</h3>
        <p className="hint">
          Reusable Q&amp;A entries are edited under <strong>Profile → Answer bank</strong>. Similarity
          merge (≥85%) and never-learn rules match the extension.
        </p>
      </section>

      <section id="browser" className="profile-section">
        <h3>Browser</h3>
        <div className="field">
          <label htmlFor="browser">Browser to drive</label>
          <p className="hint">
            Dedicated persistent profile under userData (Chrome and Edge are separate folders).
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
      </section>

      <section id="sites" className="profile-section">
        <h3>Sources / sites</h3>
        <p className="hint">
          Desktop equivalent of Options → Sites: which job sources to scrape (no board APIs).
        </p>
        <div className="field">
          <label>Search sources</label>
          <p className="hint">Rate limit between sources: {prefs.sourceRateLimitMs}ms.</p>
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
          <label htmlFor="searchQuery" style={{ marginTop: '0.75rem' }}>
            Search query
          </label>
          <input
            id="searchQuery"
            type="text"
            placeholder="e.g. Data Engineer Python"
            value={prefs.searchQuery}
            onChange={(e) => void onChange({ searchQuery: e.target.value })}
          />
          <label htmlFor="searchLocation" style={{ marginTop: '0.5rem' }}>
            Search location
          </label>
          <input
            id="searchLocation"
            type="text"
            placeholder="e.g. Remote or Chicago, IL"
            value={prefs.searchLocation}
            onChange={(e) => void onChange({ searchLocation: e.target.value })}
          />
          <label htmlFor="careerUrls" style={{ marginTop: '0.5rem' }}>
            Company career URLs
          </label>
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
      </section>

      <section id="ai" className="profile-section">
        <h3>Local AI</h3>
        <div className="field">
          <label htmlFor="ollamaUrl">Ollama URL</label>
          <input
            id="ollamaUrl"
            type="text"
            value={prefs.ollamaUrl}
            onChange={(e) => void onChange({ ollamaUrl: e.target.value })}
          />
          <label htmlFor="ollamaModel" style={{ marginTop: '0.5rem' }}>
            Ollama model (optional)
          </label>
          <input
            id="ollamaModel"
            type="text"
            placeholder="e.g. qwen2.5:3b — empty = first available"
            value={prefs.ollamaModel}
            onChange={(e) => void onChange({ ollamaModel: e.target.value })}
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
      </section>

      <section id="tailoring" className="profile-section">
        <h3>Tailoring</h3>
        <div className="field">
          <label htmlFor="preferredResumeFormat">Preferred resume format</label>
          <select
            id="preferredResumeFormat"
            value={prefs.preferredResumeFormat}
            onChange={(e) =>
              void onChange({
                preferredResumeFormat: e.target.value as AppPreferences['preferredResumeFormat']
              })
            }
          >
            <option value="both">Both (PDF + Word)</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
          </select>
          <label htmlFor="tailorRules" style={{ marginTop: '0.65rem' }}>
            Tailoring rules (one per line)
          </label>
          <p className="hint">Same idea as extension Options → Tailoring rules.</p>
          <textarea
            id="tailorRules"
            rows={4}
            value={(prefs.tailoringRules || []).join('\n')}
            onChange={(e) =>
              void onChange({
                tailoringRules: e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
              })
            }
          />
        </div>
      </section>

      <section id="backups" className="profile-section">
        <h3>Backups</h3>
        <p className="hint">
          Export a full <code>kind: job-apply-assistant-backup</code> snapshot anytime. Profile-only
          export is under Import / export.
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <button
            className="btn primary"
            type="button"
            onClick={() =>
              void (async () => {
                const r = await window.desktopApi.exportFullBackup()
                setExportMsg(r.message)
              })()
            }
          >
            Export full backup
          </button>
        </div>
        {exportMsg ? <p className="hint">{exportMsg}</p> : null}
      </section>

      <section id="io" className="profile-section">
        <h3>Import / export</h3>
        <div className="field">
          <label>Extension profile import / export</label>
          <p className="hint">
            Round-trip <code>job-apply-profile.json</code>. Status:{' '}
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
            <button
              className="btn"
              type="button"
              onClick={() =>
                void (async () => {
                  const r = await window.desktopApi.exportProfile()
                  setExportMsg(r.message)
                })()
              }
            >
              Export profile
            </button>
          </div>
          {importMsg ? <p className="hint">{importMsg}</p> : null}
        </div>
      </section>

      <section id="tracker" className="profile-section">
        <h3>Tracker</h3>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.reminderNotifications}
              onChange={(e) => void onChange({ reminderNotifications: e.target.checked })}
            />
            Desktop notifications for tracker reminders
          </label>
          <p className="hint">
            Application rows live under the Tracker tab (extension Options → Tracker).
          </p>
        </div>
      </section>

      <section id="schedule" className="profile-section">
        <h3>Scheduled search</h3>
        <p className="hint">Desktop-only: interval search while the app is open.</p>
        <div className="field">
          <label htmlFor="schedule">Interval (minutes; 0 = manual only)</label>
          <input
            id="schedule"
            type="number"
            min={0}
            max={1440}
            value={prefs.scheduledSearchMinutes}
            onChange={(e) =>
              void onChange({ scheduledSearchMinutes: Number(e.target.value) || 0 })
            }
          />
          <label className="check" style={{ marginTop: '0.65rem' }}>
            <input
              type="checkbox"
              checked={prefs.scheduledIncludeApply}
              onChange={(e) => void onChange({ scheduledIncludeApply: e.target.checked })}
            />
            Include unattended apply on schedule (best-fit jobs)
          </label>
          <div className="actions" style={{ marginTop: '0.5rem' }}>
            <button
              className="btn"
              type="button"
              onClick={() =>
                void (async () => {
                  setScheduleMsg('Running scheduled pipeline…')
                  const r = await window.desktopApi.runScheduledNow()
                  setScheduleMsg(r.message)
                })()
              }
            >
              Run scheduled pipeline now
            </button>
          </div>
          {scheduleMsg ? <p className="hint">{scheduleMsg}</p> : null}
        </div>
      </section>
    </div>
  )
}
