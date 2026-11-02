const MODULES = [
  {
    name: 'search',
    path: 'src/modules/search',
    summary:
      'Playwright-driven search across Google, LinkedIn, Indeed, and career sites (Milestone 3).'
  },
  {
    name: 'match',
    path: 'src/modules/match',
    summary: 'Port of extension lib/match.js + threshold prefs (Milestone 4).'
  },
  {
    name: 'notify',
    path: 'src/modules/notify',
    summary: 'Desktop notifications for best-fit jobs (Milestone 4).'
  },
  {
    name: 'apply',
    path: 'src/modules/apply',
    summary: 'Fill/submit in Chrome/Edge per apply-safety preference (Milestones 5–6).'
  },
  {
    name: 'import',
    path: 'src/modules/import',
    summary:
      'Day-one importers for job-apply-profile.json and kind: job-apply-assistant-backup (Milestone 1).'
  },
  {
    name: 'browser-controller',
    path: 'electron/main/browser-controller.ts',
    summary: 'Persistent Chrome/Edge profiles via Playwright (Milestone 2 stub).'
  },
  {
    name: 'ollama',
    path: 'electron/main/ollama.ts',
    summary: 'Local Ollama reachability check (Milestone 1).'
  }
] as const

export default function ModulesPanel() {
  return (
    <div className="panel">
      <h2>Modules</h2>
      <p className="lede">
        Scaffold entry points for the full pipeline. Milestone 1 ships shell, prefs, profile
        import, and Ollama status; later milestones replace stubs.
      </p>
      <div className="module-list">
        {MODULES.map((m) => (
          <article key={m.name} className="module">
            <h3>
              {m.name}
              <span className="badge">
                {m.name === 'import' || m.name === 'ollama' ? 'm1' : 'stub'}
              </span>
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
