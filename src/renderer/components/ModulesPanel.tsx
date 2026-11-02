const MODULES = [
  {
    name: 'browser-controller',
    path: 'electron/main/browser-controller.ts',
    badge: 'm2',
    summary:
      'Playwright persistent Chrome/Edge profiles, Open browser + Check sessions (Indeed/LinkedIn/Google).'
  },
  {
    name: 'search',
    path: 'src/modules/search',
    badge: 'm3',
    summary:
      'Indeed + Google Jobs + LinkedIn + company career URL stubs. Source toggles, rate limit, search history, fixtures.'
  },
  {
    name: 'match',
    path: 'src/modules/match',
    badge: 'm2',
    summary: 'Port of extension lib/match.js + threshold prefs against imported profile.'
  },
  {
    name: 'notify',
    path: 'src/modules/notify',
    badge: 'm2',
    summary: 'Desktop notifications for best-fit jobs (session dedupe by job id).'
  },
  {
    name: 'apply',
    path: 'src/modules/apply',
    badge: 'm3',
    summary:
      'Profile autofill (Greenhouse/Lever/Ashby/LinkedIn/generic patterns). Confirm vs unattended; never auto-submits.'
  },
  {
    name: 'import',
    path: 'src/modules/import',
    badge: 'm1',
    summary:
      'Importers for job-apply-profile.json and kind: job-apply-assistant-backup.'
  },
  {
    name: 'ollama',
    path: 'electron/main/ollama.ts',
    badge: 'm1',
    summary: 'Local Ollama reachability check.'
  }
] as const

export default function ModulesPanel() {
  return (
    <div className="panel">
      <h2>Modules</h2>
      <p className="lede">
        Milestone 3 expands search sources and wires apply-fill with apply-safety prefs.
      </p>
      <div className="module-list">
        {MODULES.map((m) => (
          <article key={m.name} className="module">
            <h3>
              {m.name}
              <span className="badge">{m.badge}</span>
            </h3>
            <p>
              <code>{m.path}</code> — {m.summary}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
