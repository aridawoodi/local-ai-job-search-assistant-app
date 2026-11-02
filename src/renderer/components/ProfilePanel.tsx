import type { StoredProfileBundle } from '../../shared/profile'
import { profileDisplayName } from '../../shared/profile'

interface Props {
  bundle: StoredProfileBundle
}

export default function ProfilePanel({ bundle }: Props) {
  const p = bundle.profile
  const empty = !p.firstName && !p.email && p.skills.length === 0

  return (
    <div className="panel">
      <h2>Profile</h2>
      <p className="lede">
        Local copy imported from the Chrome extension (or empty until you import). The extension
        repo is never modified.
      </p>

      {empty ? (
        <div className="status">
          No profile loaded yet. Use Preferences or restart onboarding to import
          `job-apply-profile.json` / a full backup.
        </div>
      ) : (
        <>
          <div className="profile-grid">
            <div className="kv">
              <span className="k">Name</span>
              <span className="v">{profileDisplayName(p)}</span>
            </div>
            <div className="kv">
              <span className="k">Email</span>
              <span className="v">{p.email || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Title</span>
              <span className="v">{p.currentTitle || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Location</span>
              <span className="v">{p.location || [p.city, p.state].filter(Boolean).join(', ') || '—'}</span>
            </div>
            <div className="kv">
              <span className="k">Answer bank</span>
              <span className="v">{bundle.answerBank.length}</span>
            </div>
            <div className="kv">
              <span className="k">Imported</span>
              <span className="v">{bundle.importedAt ? new Date(bundle.importedAt).toLocaleString() : '—'}</span>
            </div>
          </div>

          <div className="field" style={{ marginTop: '1rem' }}>
            <label>Skills</label>
            <div className="skills">
              {p.skills.length ? (
                p.skills.map((s) => (
                  <span key={s} className="skill">
                    {s}
                  </span>
                ))
              ) : (
                <span className="hint">No skills in imported profile.</span>
              )}
            </div>
          </div>

          {p.summary ? (
            <div className="field" style={{ marginTop: '1rem' }}>
              <label>Summary</label>
              <p className="hint" style={{ color: 'var(--text)' }}>
                {p.summary}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
