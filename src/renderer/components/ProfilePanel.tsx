import { useEffect, useState, type ReactNode } from 'react'
import type {
  AnswerBankEntry,
  EducationEntry,
  ProjectEntry,
  StoredProfileBundle,
  UserProfile,
  WorkHistoryEntry
} from '../../shared/profile'
import { EMPTY_PROFILE } from '../../shared/profile'
import {
  DEGREES,
  EDU_STATUS,
  EEO_CHOICES,
  YN,
  emptyEducationEntry,
  emptyProjectEntry,
  emptyWorkEntry,
  prepareProfileForSave,
  splitLines,
  splitList
} from '../../shared/profile-helpers'
import {
  RESUME_REVIEW_DEFAULTS,
  type ResumeReviewKey
} from '../../shared/resume-review'

/** Subset of resume import patch used by the review UI (avoids bundling Node parsers). */
type ReviewPatch = {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  summary?: string
  skills?: string[]
  workHistory?: unknown[]
  education?: unknown[]
  projects?: unknown[]
  certifications?: string[]
  languages?: string[]
  dropped?: string[]
}

interface Props {
  bundle: StoredProfileBundle
  onReload?: () => Promise<void>
}

type Draft = UserProfile

function cloneProfile(p: UserProfile): Draft {
  return prepareProfileForSave({
    ...EMPTY_PROFILE,
    ...p,
    education: { ...EMPTY_PROFILE.education, ...(p.education || {}) },
    eeo: { ...EMPTY_PROFILE.eeo, ...(p.eeo || {}) },
    workHistory: (p.workHistory || []).map((j) => ({
      ...j,
      bullets: [...(j.bullets || [])]
    })),
    educationList: (p.educationList || []).map((e) => ({ ...e })),
    projects: (p.projects || []).map((x) => ({
      ...x,
      bullets: [...(x.bullets || [])],
      tech: [...(x.tech || [])]
    })),
    skills: [...(p.skills || [])],
    certifications: [...(p.certifications || [])],
    languages: [...(p.languages || [])]
  })
}

function Field({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Choose… (not set)'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const opts = [...options]
  if (value && !opts.includes(value)) opts.unshift(value)
  return (
    <Field label={label}>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  )
}

const PROFILE_NAV = [
  { id: 'identity', label: 'Contact' },
  { id: 'location', label: 'Location' },
  { id: 'links', label: 'Links' },
  { id: 'workauth', label: 'Work auth' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
  { id: 'eeo', label: 'EEO' },
  { id: 'availability', label: 'Availability' },
  { id: 'writing', label: 'Writing' },
  { id: 'resume', label: 'Resume text' },
  { id: 'bank', label: 'Answer bank' }
]

export default function ProfilePanel({ bundle, onReload }: Props) {
  const [draft, setDraft] = useState<Draft>(() => cloneProfile(bundle.profile))
  const [bank, setBank] = useState<AnswerBankEntry[]>(bundle.answerBank || [])
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [skillsText, setSkillsText] = useState((bundle.profile.skills || []).join(', '))
  const [certsText, setCertsText] = useState((bundle.profile.certifications || []).join('\n'))
  const [langsText, setLangsText] = useState((bundle.profile.languages || []).join(', '))
  const [review, setReview] = useState<{
    patch: ReviewPatch
    resumeText: string
    parsed: { name: string; kind: 'pdf' | 'docx' }
    selected: ResumeReviewKey[]
  } | null>(null)

  useEffect(() => {
    setDraft(cloneProfile(bundle.profile))
    setBank(bundle.answerBank || [])
    setSkillsText((bundle.profile.skills || []).join(', '))
    setCertsText((bundle.profile.certifications || []).join('\n'))
    setLangsText((bundle.profile.languages || []).join(', '))
    setDirty(false)
  }, [bundle])

  function patch(partial: Partial<UserProfile>) {
    setDraft((d) => ({ ...d, ...partial }))
    setDirty(true)
  }

  function patchEeo(key: keyof UserProfile['eeo'], value: string) {
    setDraft((d) => ({ ...d, eeo: { ...d.eeo, [key]: value } }))
    setDirty(true)
  }

  async function onSave() {
    setBusy(true)
    try {
      const next = prepareProfileForSave({
        ...draft,
        skills: splitList(skillsText),
        certifications: splitLines(certsText),
        languages: splitList(langsText)
      })
      await window.desktopApi.saveProfile(next)
      setMsg('Profile saved.')
      setDirty(false)
      await onReload?.()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onImportResume() {
    setBusy(true)
    try {
      if (dirty) {
        const next = prepareProfileForSave({
          ...draft,
          skills: splitList(skillsText),
          certifications: splitLines(certsText),
          languages: splitList(langsText)
        })
        await window.desktopApi.saveProfile(next)
      }
      const r = await window.desktopApi.importResume()
      if (r.cancelled) {
        setMsg('Cancelled.')
        return
      }
      if (!r.ok || !r.patch || !r.parsed) {
        setMsg(r.message)
        return
      }
      setReview({
        patch: r.patch,
        resumeText: r.parsed.text,
        parsed: { name: r.parsed.name, kind: r.parsed.kind },
        selected: [...RESUME_REVIEW_DEFAULTS]
      })
      setMsg(r.message)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onCommitResumeReview() {
    if (!review) return
    setBusy(true)
    try {
      const r = await window.desktopApi.commitResumeImport({
        patch: review.patch as Parameters<
          typeof window.desktopApi.commitResumeImport
        >[0]['patch'],
        resumeText: review.resumeText,
        selected: review.selected,
        parsed: review.parsed
      })
      setMsg(r.message)
      setReview(null)
      setDirty(false)
      await onReload?.()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onAiReread() {
    if (!review) return
    setBusy(true)
    try {
      const r = await window.desktopApi.rereadResumeWithAi({
        resumeText: review.resumeText,
        patch: review.patch as Parameters<
          typeof window.desktopApi.rereadResumeWithAi
        >[0]['patch']
      })
      if (r.ok && r.patch) {
        setReview((prev) =>
          prev
            ? {
                ...prev,
                patch: r.patch as typeof prev.patch
              }
            : prev
        )
      }
      setMsg(r.message)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleReviewKey(key: ResumeReviewKey) {
    setReview((prev) => {
      if (!prev) return prev
      const has = prev.selected.includes(key)
      return {
        ...prev,
        selected: has ? prev.selected.filter((k) => k !== key) : [...prev.selected, key]
      }
    })
  }

  async function onAddAnswer() {
    if (!q.trim() || !a.trim()) return
    setBusy(true)
    try {
      const r = await window.desktopApi.upsertAnswerBank([
        { q: q.trim(), a: a.trim(), source: 'manual' }
      ])
      setBank(r.bank)
      setMsg(
        `Answer bank: +${r.added} added, ${r.updated} updated, ${r.skipped} skipped (similarity ≥85% / never-learn).`
      )
      setQ('')
      setA('')
      await onReload?.()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(i: number) {
    const next = await window.desktopApi.deleteAnswerBank(i)
    setBank(next)
    await onReload?.()
  }

  function setJob(i: number, partial: Partial<WorkHistoryEntry>) {
    setDraft((d) => {
      const workHistory = d.workHistory.map((j, k) => (k === i ? { ...j, ...partial } : j))
      if (partial.current === true) {
        workHistory[i] = { ...workHistory[i], end: 'Present', current: true }
      } else if (partial.current === false && workHistory[i].end === 'Present') {
        workHistory[i] = { ...workHistory[i], end: '', current: false }
      }
      return { ...d, workHistory }
    })
    setDirty(true)
  }

  function setEdu(i: number, partial: Partial<EducationEntry>) {
    setDraft((d) => {
      let educationList = d.educationList.map((e, k) => (k === i ? { ...e, ...partial } : e))
      if (partial.highest) {
        educationList = educationList.map((e, k) => ({ ...e, highest: k === i }))
      }
      return { ...d, educationList }
    })
    setDirty(true)
  }

  function setProj(i: number, partial: Partial<ProjectEntry>) {
    setDraft((d) => ({
      ...d,
      projects: d.projects.map((p, k) => (k === i ? { ...p, ...partial } : p))
    }))
    setDirty(true)
  }

  const p = draft

  return (
    <div className="panel wide profile-editor">
      <div className="profile-editor-head">
        <div>
          <h2>Profile</h2>
          <p className="lede">
            Same sections as the extension Options → Profile. EEO is user-set only — never filled
            from a resume or local AI.
          </p>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn" disabled={busy} onClick={() => void onImportResume()}>
            Import resume (PDF/DOCX)
          </button>
          <button
            className="btn primary"
            disabled={busy || !dirty}
            onClick={() => void onSave()}
          >
            {dirty ? 'Save profile' : 'Saved'}
          </button>
        </div>
      </div>
      {msg ? <p className="hint">{msg}</p> : null}

      {review ? (
        <section className="profile-section resume-review" id="resume-review">
          <h3>Resume import review</h3>
          <p className="hint">
            Parsed <strong>{review.parsed.name}</strong> ({review.parsed.kind}). Choose what to
            apply — same idea as the extension importer. EEO / work auth are never imported.
            Start with the rules-only extract; optionally re-read with local AI (facts must appear
            in the resume text).
          </p>
          <div className="review-grid">
            {(
              [
                ['identity', 'Name, email, phone, years'],
                ['links', 'LinkedIn / GitHub / portfolio'],
                ['location', 'Location'],
                ['summary', 'Summary'],
                ['skills', `Skills (${review.patch.skills?.length || 0})`],
                ['workHistory', `Work history (${review.patch.workHistory?.length || 0})`],
                ['education', `Education (${review.patch.education?.length || 0})`],
                ['projects', `Projects (${review.patch.projects?.length || 0})`],
                ['certifications', `Certifications (${review.patch.certifications?.length || 0})`],
                ['languages', `Languages (${review.patch.languages?.length || 0})`],
                ['resumeText', 'Full resume text']
              ] as Array<[ResumeReviewKey, string]>
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={review.selected.includes(key)}
                  onChange={() => toggleReviewKey(key)}
                />
                {label}
              </label>
            ))}
          </div>
          {review.patch.summary ? (
            <p className="hint" style={{ marginTop: '0.75rem' }}>
              Summary preview: {review.patch.summary.slice(0, 220)}
              {review.patch.summary.length > 220 ? '…' : ''}
            </p>
          ) : null}
          <div className="actions" style={{ marginTop: '0.85rem' }}>
            <button
              className="btn primary"
              disabled={busy || !review.selected.length}
              onClick={() => void onCommitResumeReview()}
            >
              Apply selected to profile
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => void onAiReread()}
              title="Re-read education, jobs, and projects with Ollama; only keep facts found in the resume"
            >
              Read again with AI
            </button>
            <button className="btn" disabled={busy} onClick={() => setReview(null)}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <nav className="section-nav" aria-label="Profile sections">
        {PROFILE_NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} className="section-nav-link">
            {n.label}
          </a>
        ))}
      </nav>

      <section id="identity" className="profile-section">
        <h3>Contact</h3>
        <div className="form-grid">
          <TextInput label="First name" value={p.firstName} onChange={(v) => patch({ firstName: v })} />
          <TextInput label="Last name" value={p.lastName} onChange={(v) => patch({ lastName: v })} />
          <TextInput
            label="Preferred name"
            value={p.preferredName}
            onChange={(v) => patch({ preferredName: v })}
          />
          <SelectField
            label="Pronouns"
            value={p.pronouns}
            onChange={(v) => patch({ pronouns: v })}
            options={EEO_CHOICES.pronouns}
            placeholder="Not set"
          />
          <TextInput
            label="Email"
            type="email"
            value={p.email}
            onChange={(v) => patch({ email: v })}
          />
          <TextInput
            label="Phone"
            type="tel"
            value={p.phone}
            onChange={(v) => patch({ phone: v })}
          />
        </div>
      </section>

      <section id="location" className="profile-section">
        <h3>Location</h3>
        <div className="form-grid">
          <TextInput label="City" value={p.city} onChange={(v) => patch({ city: v })} />
          <TextInput label="State" value={p.state} onChange={(v) => patch({ state: v })} />
          <TextInput label="ZIP" value={p.zip} onChange={(v) => patch({ zip: v })} />
          <TextInput label="Country" value={p.country} onChange={(v) => patch({ country: v })} />
          <TextInput
            label="Location (as written on forms)"
            value={p.location}
            onChange={(v) => patch({ location: v })}
          />
        </div>
      </section>

      <section id="links" className="profile-section">
        <h3>Links</h3>
        <div className="form-grid">
          <TextInput label="LinkedIn" value={p.linkedin} onChange={(v) => patch({ linkedin: v })} />
          <TextInput label="GitHub" value={p.github} onChange={(v) => patch({ github: v })} />
          <TextInput
            label="Portfolio"
            value={p.portfolio}
            onChange={(v) => patch({ portfolio: v })}
          />
          <TextInput label="Website" value={p.website} onChange={(v) => patch({ website: v })} />
        </div>
      </section>

      <section id="workauth" className="profile-section">
        <h3>Work authorization</h3>
        <p className="hint">Never filled from a resume — set these yourself.</p>
        <div className="form-grid">
          <SelectField
            label="Authorized to work in the US?"
            value={p.workAuthorizedUS}
            onChange={(v) => patch({ workAuthorizedUS: v })}
            options={[...YN].filter(Boolean)}
          />
          <SelectField
            label="Need sponsorship?"
            value={p.needsSponsorship}
            onChange={(v) => patch({ needsSponsorship: v })}
            options={[...YN].filter(Boolean)}
          />
          <TextInput
            label="Citizenship"
            value={p.citizenship}
            onChange={(v) => patch({ citizenship: v })}
          />
          <SelectField
            label="Over 18?"
            value={p.over18}
            onChange={(v) => patch({ over18: v })}
            options={[...YN].filter(Boolean)}
          />
        </div>
      </section>

      <section id="experience" className="profile-section">
        <h3>Work history</h3>
        <p className="hint">
          Current job is derived from end date = Present (extension parity). Mirrors:{' '}
          {[p.currentTitle, p.currentEmployer].filter(Boolean).join(' @ ') || 'none'}
        </p>
        <TextInput
          label="Years of experience"
          value={p.yearsExperience}
          onChange={(v) => patch({ yearsExperience: v })}
        />
        <div className="entry-list">
          {p.workHistory.map((job, i) => (
            <article key={i} className="entry-card">
              <div className="entry-card-head">
                <strong>Job {i + 1}</strong>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === 0}
                    onClick={() => {
                      setDraft((d) => {
                        const workHistory = [...d.workHistory]
                        ;[workHistory[i - 1], workHistory[i]] = [
                          workHistory[i],
                          workHistory[i - 1]
                        ]
                        return { ...d, workHistory }
                      })
                      setDirty(true)
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={i >= p.workHistory.length - 1}
                    onClick={() => {
                      setDraft((d) => {
                        const workHistory = [...d.workHistory]
                        ;[workHistory[i], workHistory[i + 1]] = [
                          workHistory[i + 1],
                          workHistory[i]
                        ]
                        return { ...d, workHistory }
                      })
                      setDirty(true)
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        workHistory: d.workHistory.filter((_, k) => k !== i)
                      }))
                      setDirty(true)
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <TextInput
                  label="Title"
                  value={job.title || ''}
                  onChange={(v) => setJob(i, { title: v })}
                />
                <TextInput
                  label="Company"
                  value={job.company || ''}
                  onChange={(v) => setJob(i, { company: v })}
                />
                <TextInput
                  label="Location"
                  value={job.location || ''}
                  onChange={(v) => setJob(i, { location: v })}
                />
                <TextInput
                  label="Start"
                  value={job.start || ''}
                  onChange={(v) => setJob(i, { start: v })}
                  placeholder="Jan 2021"
                />
                <TextInput
                  label="End"
                  value={job.end || ''}
                  onChange={(v) => setJob(i, { end: v, current: /present/i.test(v) })}
                  placeholder="Present or date"
                />
              </div>
              <label className="check" style={{ marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={!!job.current || /present/i.test(job.end || '')}
                  onChange={(e) => setJob(i, { current: e.target.checked })}
                />
                I currently work here
              </label>
              <Field label="Bullets (one per line)">
                <textarea
                  rows={4}
                  value={(job.bullets || []).join('\n')}
                  onChange={(e) =>
                    setJob(i, {
                      bullets: e.target.value
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </Field>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDraft((d) => ({ ...d, workHistory: [emptyWorkEntry(), ...d.workHistory] }))
            setDirty(true)
          }}
        >
          + Add a job
        </button>
      </section>

      <section id="education" className="profile-section">
        <h3>Education</h3>
        <div className="entry-list">
          {p.educationList.map((edu, i) => (
            <article key={i} className="entry-card">
              <div className="entry-card-head">
                <strong>School {i + 1}</strong>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={i === 0}
                    onClick={() => {
                      setDraft((d) => {
                        const educationList = [...d.educationList]
                        ;[educationList[i - 1], educationList[i]] = [
                          educationList[i],
                          educationList[i - 1]
                        ]
                        return { ...d, educationList }
                      })
                      setDirty(true)
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={i >= p.educationList.length - 1}
                    onClick={() => {
                      setDraft((d) => {
                        const educationList = [...d.educationList]
                        ;[educationList[i], educationList[i + 1]] = [
                          educationList[i + 1],
                          educationList[i]
                        ]
                        return { ...d, educationList }
                      })
                      setDirty(true)
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        educationList: d.educationList.filter((_, k) => k !== i)
                      }))
                      setDirty(true)
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <TextInput
                  label="School"
                  value={edu.school || ''}
                  onChange={(v) => setEdu(i, { school: v })}
                />
                <SelectField
                  label="Degree"
                  value={edu.degree || ''}
                  onChange={(v) => setEdu(i, { degree: v })}
                  options={[...DEGREES]}
                  placeholder="—"
                />
                <TextInput
                  label="Field"
                  value={edu.field || ''}
                  onChange={(v) => setEdu(i, { field: v })}
                />
                <TextInput
                  label="Location"
                  value={edu.location || ''}
                  onChange={(v) => setEdu(i, { location: v })}
                />
                <TextInput
                  label="Start"
                  value={edu.start || ''}
                  onChange={(v) => setEdu(i, { start: v })}
                />
                <TextInput
                  label="End"
                  value={edu.end || ''}
                  onChange={(v) => setEdu(i, { end: v })}
                />
                <SelectField
                  label="Status"
                  value={edu.status || 'completed'}
                  onChange={(v) => setEdu(i, { status: v })}
                  options={EDU_STATUS.map(([v]) => v)}
                  placeholder="completed"
                />
              </div>
              <label className="check" style={{ marginTop: '0.5rem' }}>
                <input
                  type="radio"
                  name="highest-degree"
                  checked={!!edu.highest}
                  onChange={() => setEdu(i, { highest: true })}
                />
                Highest degree
              </label>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDraft((d) => ({
              ...d,
              educationList: [
                ...d.educationList,
                emptyEducationEntry(d.educationList.length === 0)
              ]
            }))
            setDirty(true)
          }}
        >
          + Add school
        </button>
      </section>

      <section id="projects" className="profile-section">
        <h3>Projects</h3>
        <div className="entry-list">
          {p.projects.map((proj, i) => (
            <article key={i} className="entry-card">
              <div className="entry-card-head">
                <strong>Project {i + 1}</strong>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setDraft((d) => ({
                      ...d,
                      projects: d.projects.filter((_, k) => k !== i)
                    }))
                    setDirty(true)
                  }}
                >
                  Remove
                </button>
              </div>
              <div className="form-grid">
                <TextInput
                  label="Name"
                  value={proj.name || ''}
                  onChange={(v) => setProj(i, { name: v })}
                />
                <TextInput
                  label="Link"
                  value={proj.link || ''}
                  onChange={(v) => setProj(i, { link: v })}
                />
                <TextInput
                  label="Role"
                  value={proj.role || ''}
                  onChange={(v) => setProj(i, { role: v })}
                />
                <TextInput
                  label="Start"
                  value={proj.start || ''}
                  onChange={(v) => setProj(i, { start: v })}
                />
                <TextInput
                  label="End"
                  value={proj.end || ''}
                  onChange={(v) => setProj(i, { end: v })}
                />
              </div>
              <Field label="Description">
                <textarea
                  rows={2}
                  value={proj.description || ''}
                  onChange={(e) => setProj(i, { description: e.target.value })}
                />
              </Field>
              <Field label="Tech (comma-separated)">
                <input
                  type="text"
                  value={(proj.tech || []).join(', ')}
                  onChange={(e) => setProj(i, { tech: splitList(e.target.value) })}
                />
              </Field>
              <Field label="Bullets (one per line)">
                <textarea
                  rows={3}
                  value={(proj.bullets || []).join('\n')}
                  onChange={(e) =>
                    setProj(i, {
                      bullets: e.target.value
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </Field>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDraft((d) => ({ ...d, projects: [...d.projects, emptyProjectEntry()] }))
            setDirty(true)
          }}
        >
          + Add project
        </button>
      </section>

      <section id="skills" className="profile-section">
        <h3>Skills, certifications & languages</h3>
        <Field label="Skills (commas / semicolons)">
          <textarea
            rows={3}
            value={skillsText}
            onChange={(e) => {
              setSkillsText(e.target.value)
              setDirty(true)
            }}
          />
        </Field>
        <Field label="Certifications (one per line)">
          <textarea
            rows={3}
            value={certsText}
            onChange={(e) => {
              setCertsText(e.target.value)
              setDirty(true)
            }}
          />
        </Field>
        <Field label="Languages (commas)">
          <textarea
            rows={2}
            value={langsText}
            onChange={(e) => {
              setLangsText(e.target.value)
              setDirty(true)
            }}
          />
        </Field>
      </section>

      <section id="eeo" className="profile-section">
        <h3>Voluntary self-identification (EEO)</h3>
        <p className="hint">
          Optional. Empty = not set. Resume import and local AI never invent these.
        </p>
        <div className="form-grid">
          {(
            [
              ['gender', 'Gender'],
              ['transgender', 'Transgender'],
              ['sexualOrientation', 'Sexual orientation'],
              ['ethnicity', 'Race / ethnicity'],
              ['hispanicLatino', 'Hispanic or Latino'],
              ['veteran', 'Veteran status'],
              ['disability', 'Disability']
            ] as const
          ).map(([key, label]) => (
            <SelectField
              key={key}
              label={label}
              value={p.eeo[key] || ''}
              onChange={(v) => patchEeo(key, v)}
              options={EEO_CHOICES[key] || []}
            />
          ))}
        </div>
      </section>

      <section id="availability" className="profile-section">
        <h3>Availability & preferences</h3>
        <div className="form-grid">
          <TextInput
            label="Availability / start date"
            value={p.availability}
            onChange={(v) => patch({ availability: v })}
          />
          <TextInput
            label="Notice period"
            value={p.noticePeriod}
            onChange={(v) => patch({ noticePeriod: v })}
          />
          <TextInput
            label="Salary expectation"
            value={p.salaryExpectation}
            onChange={(v) => patch({ salaryExpectation: v })}
          />
          <SelectField
            label="Willing to relocate?"
            value={p.willingToRelocate}
            onChange={(v) => patch({ willingToRelocate: v })}
            options={[...YN].filter(Boolean)}
          />
          <TextInput
            label="How did you hear about us"
            value={p.howDidYouHear}
            onChange={(v) => patch({ howDidYouHear: v })}
          />
          <TextInput
            label="Signature"
            value={p.signature}
            onChange={(v) => patch({ signature: v })}
          />
        </div>
        <Field label="Summary">
          <textarea
            rows={4}
            value={p.summary}
            onChange={(e) => patch({ summary: e.target.value })}
          />
        </Field>
      </section>

      <section id="writing" className="profile-section">
        <h3>Writing style</h3>
        <Field label="Tone notes">
          <textarea
            rows={3}
            value={p.toneNotes}
            onChange={(e) => patch({ toneNotes: e.target.value })}
          />
        </Field>
        <Field label="Writing samples">
          <textarea
            rows={8}
            value={p.writingSamples}
            onChange={(e) => patch({ writingSamples: e.target.value })}
          />
        </Field>
      </section>

      <section id="resume" className="profile-section">
        <h3>Resume text</h3>
        <p className="hint">
          Full plain text used for matching and AI essays (filled by import, editable). Cap 20k
          chars on import.
        </p>
        <Field label="resumeText">
          <textarea
            rows={10}
            value={p.resumeText}
            onChange={(e) => patch({ resumeText: e.target.value })}
          />
        </Field>
        <div className="actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true)
                try {
                  const r = await window.desktopApi.exportProfile()
                  setMsg(r.message)
                } finally {
                  setBusy(false)
                }
              })()
            }
          >
            Export profile JSON
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true)
                try {
                  const r = await window.desktopApi.exportFullBackup()
                  setMsg(r.message)
                } finally {
                  setBusy(false)
                }
              })()
            }
          >
            Export full backup
          </button>
        </div>
      </section>

      <section id="bank" className="profile-section">
        <h3>Answer bank</h3>
        <p className="hint">
          Similarity merge ≥85% (extension parity). Sensitive / consent prompts are never learned.
        </p>
        <div className="field">
          <label htmlFor="bankQ">Question</label>
          <input id="bankQ" type="text" value={q} onChange={(e) => setQ(e.target.value)} />
          <label htmlFor="bankA">Answer</label>
          <textarea id="bankA" rows={3} value={a} onChange={(e) => setA(e.target.value)} />
          <div className="actions" style={{ marginTop: '0.5rem' }}>
            <button
              className="btn primary"
              disabled={busy || !q.trim() || !a.trim()}
              onClick={() => void onAddAnswer()}
            >
              Save to bank
            </button>
          </div>
        </div>
        {bank.length === 0 ? (
          <p className="hint">No saved answers yet.</p>
        ) : (
          <div className="card-list">
            {bank.map((entry, i) => (
              <article key={`${entry.q}-${i}`} className="inbox-card">
                <h3>{entry.q}</h3>
                <p>{entry.a}</p>
                <p className="hint">
                  {entry.source || 'saved'}
                  {entry.companySpecific ? ' · company-specific' : ''}
                </p>
                <div className="actions">
                  <button className="btn" onClick={() => void onDelete(i)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dirty ? (
        <div className="sticky-save">
          <button className="btn primary" disabled={busy} onClick={() => void onSave()}>
            Save profile changes
          </button>
        </div>
      ) : null}
    </div>
  )
}
