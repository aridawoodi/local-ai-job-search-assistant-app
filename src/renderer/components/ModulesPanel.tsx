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
    badge: 'm3+',
    summary:
      'Indeed + Google Jobs + hardened LinkedIn + Greenhouse/Lever/Ashby company crawl. Schedule optional.'
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
    summary: 'Desktop notifications for best-fit jobs + tracker reminder alerts.'
  },
  {
    name: 'apply',
    path: 'src/modules/apply',
    badge: 'm6',
    summary:
      'Profile autofill + gated submit: confirm never submits; unattended submits only when allowAutoSubmit is on.'
  },
  {
    name: 'ai',
    path: 'src/modules/ai',
    badge: 'm7',
    summary: 'Ollama tailor / cover / refine with fact checks (extension AI parity).'
  },
  {
    name: 'resume',
    path: 'src/modules/resume',
    badge: 'm7',
    summary: 'Local PDF/DOCX parse + deterministic profile patch (EEO never inferred).'
  },
  {
    name: 'answer-bank',
    path: 'src/shared/answer-bank.ts',
    badge: 'm7',
    summary: 'Similarity merge ≥85% + NEVER_LEARN filters.'
  },
  {
    name: 'tracker',
    path: 'src/modules/tracker',
    badge: 'm6',
    summary:
      'Extension-compatible stages/status/jobKey, notes, reminders, CSV export, import from backups.'
  },
  {
    name: 'import',
    path: 'src/modules/import',
    badge: 'm1',
    summary:
      'Importers for job-apply-profile.json and kind: job-apply-assistant-backup (incl. applications).'
  },
  {
    name: 'packaging',
    path: 'scripts/package.mjs + electron-builder',
    badge: 'm1/m7',
    summary: 'Mac universal dmg/zip + Windows nsis/zip via npm run dist / dist:mac / dist:win.'
  }
] as const

export default function ModulesPanel() {
  return (
    <div className="panel">
      <h2>Modules</h2>
      <p className="lede">
        Packaging + AI parity + resume/answer-bank + gated submit on top of post-M3 tracker/search.
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
