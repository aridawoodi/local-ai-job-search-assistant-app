const MODULES = [
  {
    name: 'browser-controller',
    path: 'electron/main/browser-controller.ts',
    badge: 'm2',
    summary:
      'Playwright persistent Chrome/Edge profiles, Open browser + Check sessions (Indeed/LinkedIn).'
  },
  {
    name: 'search',
    path: 'src/modules/search',
    badge: 'm2',
    summary:
      'First source: Indeed job cards via real browser. LinkedIn/Google Jobs later. Fixture fallback for captcha.'
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
    badge: 'safe stub',
    summary:
      'Respects apply-safety; M2 never auto-submits (confirm queues only / unattended skipped).'
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
        Milestone 2 wires browser sessions, Indeed search, profile match, and desktop notify.
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
