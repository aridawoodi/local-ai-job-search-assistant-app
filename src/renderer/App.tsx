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

type NavItem = { id: Tab; label: string }
type NavGroup = { heading: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Automation',
    items: [
      { id: 'home', label: 'Pipeline' },
      { id: 'matches', label: 'Matches' },
      { id: 'apply', label: 'Apply' }
    ]
  },
  {
    heading: 'Assistant',
    items: [
      { id: 'ai', label: 'Resume' },
      { id: 'tracker', label: 'Tracker' },
      { id: 'profile', label: 'Profile' }
    ]
  },
  {
    heading: 'Setup',
    items: [
      { id: 'preferences', label: 'Settings' },
      { id: 'modules', label: 'Advanced' }
    ]
  }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [bundle, setBundle] = useState<StoredProfileBundle>(emptyBundle())
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [ready, setReady] = useState(false)
  const [resumeJobId, setResumeJobId] = useState<string | undefined>()

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
        <div className="accent-bar" aria-hidden />
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
        <div className="accent-bar" aria-hidden />
        <header className="topbar topbar-simple">
          <div className="brand">
            <div className="brand-mark" aria-hidden />
            <div>
              <h1>AI Job Application Assistant</h1>
              <span>Desktop · set up once</span>
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

  return (
    <div className="app app-shell">
      <div className="accent-bar" aria-hidden />
      <aside className="sidebar" aria-label="Primary">
        <div className="brand brand-sidebar">
          <div className="brand-mark" aria-hidden />
          <div>
            <h1>AI Job Application Assistant</h1>
            <span>Desktop</span>
          </div>
        </div>

        <nav className="side-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="nav-group">
              <div className="nav-heading">{group.heading}</div>
              {group.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`nav-link ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          {ollama ? (
            <span className={`pill ${ollama.reachable ? 'ok' : 'bad'}`} title={ollama.url}>
              <span className="dot" />
              Ollama {ollama.reachable ? 'up' : 'down'}
            </span>
          ) : null}
        </div>
      </aside>

      <main className="content">
        {tab === 'home' ? (
          <PipelinePanel prefs={prefs} />
        ) : tab === 'matches' ? (
          <MatchInbox
            prefs={prefs}
            onImproveMatch={(jobId) => {
              setResumeJobId(jobId)
              setTab('ai')
            }}
          />
        ) : tab === 'apply' ? (
          <ApplyQueue prefs={prefs} />
        ) : tab === 'ai' ? (
          <AiAssistPanel prefs={prefs} initialJobId={resumeJobId} />
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
