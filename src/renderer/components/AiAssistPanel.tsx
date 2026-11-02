import { useEffect, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { JobListing } from '../../shared/types'
import type { CoverLength } from '../../modules/ai/cover'
import type { RefineMode } from '../../modules/ai/refine'

interface Props {
  prefs: AppPreferences
}

export default function AiAssistPanel({ prefs }: Props) {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [jobId, setJobId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tailorOut, setTailorOut] = useState('')
  const [coverOut, setCoverOut] = useState('')
  const [refineIn, setRefineIn] = useState('')
  const [refineOut, setRefineOut] = useState('')
  const [coverLen, setCoverLen] = useState<CoverLength>('standard')
  const [refineMode, setRefineMode] = useState<RefineMode>('polish')
  const [flags, setFlags] = useState<string[]>([])

  useEffect(() => {
    void (async () => {
      const j = await window.desktopApi.getLastJobs()
      setJobs(j)
      if (j[0] && !jobId) setJobId(j[0].id)
    })()
  }, [])

  const selected = jobs.find((j) => j.id === jobId)

  async function runTailor() {
    setBusy(true)
    setFlags([])
    try {
      const r = await window.desktopApi.aiTailor({
        jobId: selected?.id,
        title: selected?.title,
        company: selected?.company,
        description: selected?.snippet
      })
      setMsg(r.message)
      setTailorOut(r.tailoredText || `${r.summary}\n\nSkills: ${r.skillsLine}`)
      setFlags([...r.blocked, ...r.warnings])
      if (r.ok && r.summary) {
        // leave apply-to-profile as explicit user action
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveTailor() {
    if (!tailorOut) return
    const summary = tailorOut.split(/\n\nSkills:/i)[0]?.trim() || tailorOut
    const skillsMatch = tailorOut.match(/Skills:\s*([^\n]+)/i)
    const bundle = await window.desktopApi.applyTailorToProfile(
      summary,
      skillsMatch?.[1] || ''
    )
    setMsg(`Saved tailored summary/skills to profile (${bundle.profile.skills.length} skills).`)
  }

  async function runCover() {
    setBusy(true)
    setFlags([])
    try {
      const r = await window.desktopApi.aiCover(
        {
          jobId: selected?.id,
          title: selected?.title,
          company: selected?.company,
          description: selected?.snippet
        },
        coverLen
      )
      setMsg(r.message)
      setCoverOut(r.text)
      setFlags([...r.blocked, ...r.warnings])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function runRefine() {
    setBusy(true)
    setFlags([])
    try {
      const r = await window.desktopApi.aiRefine(refineIn, refineMode)
      setMsg(r.message)
      setRefineOut(r.text)
      setFlags([...r.blocked, ...r.warnings])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel wide">
      <h2>AI assist</h2>
      <p className="lede">
        Local Ollama flows for resume tailor, cover letter, and answer refine. Fact checks block
        invented numbers/tools. Ollama URL: <code>{prefs.ollamaUrl}</code>
        {prefs.ollamaModel ? ` · model ${prefs.ollamaModel}` : ''}.
      </p>

      <div className="field">
        <label htmlFor="aiJob">Target job (from last search)</label>
        <select
          id="aiJob"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          style={{ minWidth: '20rem', maxWidth: '100%' }}
        >
          <option value="">No job selected</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} — {j.company}
            </option>
          ))}
        </select>
        <p className="hint">Run a search first if this list is empty.</p>
      </div>

      <div className="split-cols">
        <section>
          <h3>Tailor resume</h3>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn primary" disabled={busy} onClick={() => void runTailor()}>
              Tailor with Ollama
            </button>
            <button className="btn" disabled={busy || !tailorOut} onClick={() => void saveTailor()}>
              Save summary/skills to profile
            </button>
          </div>
          {tailorOut ? (
            <textarea className="ai-out" rows={12} value={tailorOut} readOnly />
          ) : (
            <p className="hint">Rewrites summary + skills line; work history stays as-is.</p>
          )}
        </section>

        <section>
          <h3>Cover letter</h3>
          <div className="actions" style={{ marginTop: 0 }}>
            <select
              value={coverLen}
              onChange={(e) => setCoverLen(e.target.value as CoverLength)}
              aria-label="Cover length"
            >
              <option value="short">Short</option>
              <option value="standard">Standard</option>
              <option value="long">Long</option>
            </select>
            <button className="btn primary" disabled={busy} onClick={() => void runCover()}>
              Draft cover
            </button>
          </div>
          {coverOut ? (
            <textarea className="ai-out" rows={12} value={coverOut} readOnly />
          ) : (
            <p className="hint">Fact-checked draft from resume text only.</p>
          )}
        </section>
      </div>

      <section style={{ marginTop: '1.25rem' }}>
        <h3>Refine answer</h3>
        <div className="actions" style={{ marginTop: 0 }}>
          <select
            value={refineMode}
            onChange={(e) => setRefineMode(e.target.value as RefineMode)}
            aria-label="Refine mode"
          >
            <option value="polish">Polish</option>
            <option value="shorter">Shorter</option>
            <option value="longer">Longer</option>
            <option value="more_specific">More specific</option>
          </select>
          <button
            className="btn primary"
            disabled={busy || !refineIn.trim()}
            onClick={() => void runRefine()}
          >
            Refine
          </button>
        </div>
        <textarea
          className="ai-out"
          rows={5}
          placeholder="Paste a long-form application answer…"
          value={refineIn}
          onChange={(e) => setRefineIn(e.target.value)}
        />
        {refineOut ? (
          <>
            <p className="hint">Result</p>
            <textarea className="ai-out" rows={5} value={refineOut} readOnly />
          </>
        ) : null}
      </section>

      {msg ? <p className="hint" style={{ marginTop: '0.75rem' }}>{msg}</p> : null}
      {flags.length ? (
        <ul className="field-report">
          {flags.map((f) => (
            <li key={f}>
              <span className="pill bad">check</span> {f}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
