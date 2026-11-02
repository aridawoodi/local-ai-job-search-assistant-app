import { useCallback, useEffect, useState } from 'react'
import type { AppPreferences } from '../shared/preferences'
import { DEFAULT_PREFERENCES } from '../shared/preferences'
import type { StoredProfileBundle } from '../shared/profile'
import { emptyBundle } from '../shared/profile'
import type { OllamaStatus } from '../shared/ollama'
import PreferencesPanel from './preferences/PreferencesPanel'
import PipelinePanel from './components/PipelinePanel'
import ModulesPanel from './components/ModulesPanel'
import ProfilePanel from './components/ProfilePanel'
import Onboarding from './components/Onboarding'
import MatchInbox from './components/MatchInbox'
import ApplyQueue from './components/ApplyQueue'
import TrackerPanel from './components/TrackerPanel'
import AiAssistPanel from './components/AiAssistPanel'

type Tab =
  | 'home'
  | 'matches'
  | 'apply'
  | 'ai'
  | 'tracker'
  | 'profile'
  | 'preferences'
  | 'modules'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [bundle, setBundle] = useState<StoredProfileBundle>(emptyBundle())
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [ready, setReady] = useState(false)

  const reloadProfile = useCallback(async () => {
    setBundle(await window.desktopApi.getProfile())
  }, [])

  useEffect(() => {
    void (async () => {
      const [p, profile, o] = await Promise.all([
        window.desktopApi.getPreferences(),
        window.desktopApi.getProfile(),
        window.desktopApi.checkOllama()
      ])
      setPrefs(p)
      setBundle(profile)
      setOllama(o)
      setReady(true)
    })()
  }, [])

  async function savePrefs(partial: Partial<AppPreferences>) {
    const next = await window.desktopApi.setPreferences(partial)
    setPrefs(next)
  }

  if (!ready) {
    return (
      <div className="app">
        <main className="content">
          <div className="panel">
            <p className="lede">Loading…</p>
          </div>
        </main>
      </div>
    )
  }

  if (!prefs.onboardingComplete) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden />
            <div>
              <h1>Job Search Assistant</h1>
              <span>Desktop · Mac &amp; Windows</span>
            </div>
          </div>
        </header>
        <main className="content">
          <Onboarding
            onDone={(next) => {
              setPrefs(next)
              void reloadProfile()
            }}
          />
        </main>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'Pipeline' },
    { id: 'matches', label: 'Matches' },
    { id: 'apply', label: 'Apply' },
    { id: 'ai', label: 'AI' },
    { id: 'tracker', label: 'Tracker' },
    { id: 'profile', label: 'Profile' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'modules', label: 'Modules' }
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden />
          <div>
            <h1>Job Search Assistant</h1>
            <span>Electron · Playwright · Ollama</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {ollama ? (
            <span className={`pill ${ollama.reachable ? 'ok' : 'bad'}`} title={ollama.url}>
              <span className="dot" />
              Ollama {ollama.reachable ? 'up' : 'down'}
            </span>
          ) : null}
          <nav className="tabs" aria-label="Primary">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="content">
        {tab === 'home' ? (
          <PipelinePanel prefs={prefs} />
        ) : tab === 'matches' ? (
          <MatchInbox prefs={prefs} />
        ) : tab === 'apply' ? (
          <ApplyQueue prefs={prefs} />
        ) : tab === 'ai' ? (
          <AiAssistPanel prefs={prefs} />
        ) : tab === 'tracker' ? (
          <TrackerPanel />
        ) : tab === 'profile' ? (
          <ProfilePanel bundle={bundle} onReload={reloadProfile} />
        ) : tab === 'preferences' ? (
          <PreferencesPanel
            prefs={prefs}
            onChange={savePrefs}
            onPrefsReload={setPrefs}
            onProfileReload={reloadProfile}
          />
        ) : (
          <ModulesPanel />
        )}
      </main>
    </div>
  )
}
