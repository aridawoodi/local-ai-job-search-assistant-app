import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { JobListing, MatchResult } from '../../shared/types'
import type { CoverLength } from '../../modules/ai/cover'
import type { RefineMode } from '../../modules/ai/refine'

interface Props {
  prefs: AppPreferences
  initialJobId?: string
}

const REFINE_CHIPS: Array<{ mode: RefineMode; label: string }> = [
  { mode: 'shorter', label: 'Shorter' },
  { mode: 'technical', label: 'More technical' },
  { mode: 'enthusiastic', label: 'More enthusiastic' },
  { mode: 'polish', label: 'Polish' },
  { mode: 'more_specific', label: 'More specific' }
]

function scoreTone(score: number): string {
  if (score >= 70) return '#16a34a'
  if (score >= 45) return '#d97706'
  return '#dc2626'
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)))
  return (
    <div
      className="score-ring"
      style={{ '--p': pct, '--c': scoreTone(pct) } as CSSProperties}
      role="img"
      aria-label={`Match ${pct}%`}
    >
      <b>{pct}%</b>
    </div>
  )
}

export default function AiAssistPanel({ prefs, initialJobId }: Props) {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [jobId, setJobId] = useState(initialJobId || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tailorOut, setTailorOut] = useState('')
  const [coverOut, setCoverOut] = useState('')
  const [refineIn, setRefineIn] = useState('')
  const [refineOut, setRefineOut] = useState('')
  const [refineQuestion, setRefineQuestion] = useState('')
  const [coverLen, setCoverLen] = useState<CoverLength>('standard')
  const [refineMode, setRefineMode] = useState<RefineMode>('polish')
  const [flags, setFlags] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void (async () => {
      const [j, m] = await Promise.all([
        window.desktopApi.getLastJobs(),
        window.desktopApi.getLastMatches()
      ])
      setJobs(j)
      setMatches(m)
      if (initialJobId && j.some((x) => x.id === initialJobId)) {
        setJobId(initialJobId)
      } else if (j[0] && !jobId) {
        setJobId(j[0].id)
      }
    })()
  }, [initialJobId])

  const selected = jobs.find((j) => j.id === jobId)
  const match = useMemo(
    () => matches.find((m) => m.jobId === jobId),
    [matches, jobId]
  )
  const matched = match?.matched || []
  const missing = match?.missing || []
  const total = matched.length + missing.length

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
    await window.desktopApi.applyTailorToProfile(summary, skillsMatch?.[1] || '')
    setMsg(`Saved tailored summary/skills to profile.`)
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

  async function runRefine(mode: RefineMode = refineMode) {
    setBusy(true)
    setFlags([])
    setCopied(false)
    setRefineMode(mode)
    try {
      const r = await window.desktopApi.aiRefine(
        refineIn,
        mode,
        refineQuestion.trim() || undefined
      )
      setMsg(r.message)
      setRefineOut(r.text)
      setFlags([...r.blocked, ...r.warnings])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyRefined() {
    if (!refineOut) return
    try {
      await navigator.clipboard.writeText(refineOut)
      setCopied(true)
      setMsg('Refined answer copied to clipboard — paste into the application form.')
    } catch {
      setMsg('Could not copy — select the result text manually.')
    }
  }

  function useRefinedAsInput() {
    if (!refineOut) return
    setRefineIn(refineOut)
    setMsg('Moved refined text into the editor for another pass.')
  }

  async function saveToAnswerBank() {
    if (!refineOut.trim()) return
    setBusy(true)
    try {
      const result = await window.desktopApi.upsertAnswerBank([
        {
          q: refineQuestion.trim() || 'Refined application answer',
          a: refineOut.trim(),
          source: `refine:${refineMode}`
        }
      ])
      setMsg(
        result.added > 0
          ? `Saved to answer bank (+${result.added}, ${result.bank.length} total).`
          : result.updated > 0
            ? `Merged into answer bank (${result.updated} updated, ${result.bank.length} total).`
            : `Answer bank unchanged (${result.bank.length} entries).`
      )
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel wide">
      <h2>Resume</h2>
      <p className="lede">
        Extension panel <strong>Resume</strong> tab: match summary, tailor, cover letter, and refine
        chips. Fact checks block invented numbers/tools. Ollama:{' '}
        <code>{prefs.ollamaUrl}</code>
        {prefs.ollamaModel ? ` · ${prefs.ollamaModel}` : ''}.
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
        <p className="hint">Run a search first if this list is empty. Improve my match from Matches lands here.</p>
      </div>

      <section className="resume-match-summary inbox-card">
        {match ? (
          <div className="match-card-body">
            <ScoreRing score={match.score} />
            <div className="match-card-main">
              <p className="match-coverage">
                Matches {matched.length} of {total || '—'} keywords
              </p>
              <p className="hint">
                {match.score >= 70
                  ? 'Strong match'
                  : match.score >= 45
                    ? 'Decent match: tailoring can help'
                    : 'Low match: tailor your resume for this one'}
              </p>
              {missing.length ? (
                <div className="kw-block">
                  <div className="kw-label">Missing from your resume</div>
                  <div className="kw">
                    {missing.slice(0, 10).map((k) => (
                      <span key={k} className="miss">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {matched.length ? (
                <div className="kw-block">
                  <div className="kw-label">Already in your resume</div>
                  <div className="kw">
                    {matched.slice(0, 10).map((k) => (
                      <span key={k}>{k}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            No match score for this job yet — score jobs under Matches, then return here to tailor.
          </p>
        )}
      </section>

      <div className="split-cols">
        <section>
          <h3>Tailor resume</h3>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn primary" disabled={busy} onClick={() => void runTailor()}>
              Improve my match
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

      <section className="refine-panel" style={{ marginTop: '1.25rem' }}>
        <h3>Refine answer</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Extension refine toolbar chips — paste a draft, pick a tone, copy back into the form.
        </p>
        <div className="field">
          <label htmlFor="refineQ">Application question (optional)</label>
          <input
            id="refineQ"
            type="text"
            value={refineQuestion}
            onChange={(e) => setRefineQuestion(e.target.value)}
            placeholder="e.g. Why do you want this role?"
            style={{
              width: '100%',
              padding: '0.5rem 0.7rem',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)'
            }}
          />
        </div>
        <div className="refine-chips" role="group" aria-label="Refine modes">
          {REFINE_CHIPS.map((c) => (
            <button
              key={c.mode}
              type="button"
              className={`refine-chip ${refineMode === c.mode ? 'active' : ''}`}
              disabled={busy || !refineIn.trim()}
              onClick={() => void runRefine(c.mode)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="actions" style={{ marginTop: '0.65rem' }}>
          <button
            className="btn"
            disabled={busy || !refineOut}
            onClick={() => void copyRefined()}
          >
            {copied ? 'Copied' : 'Copy result'}
          </button>
          <button className="btn" disabled={busy || !refineOut} onClick={useRefinedAsInput}>
            Use as next input
          </button>
          <button
            className="btn"
            disabled={busy || !refineOut.trim()}
            onClick={() => void saveToAnswerBank()}
          >
            Save to answer bank
          </button>
        </div>
        <div className="refine-split">
          <div>
            <p className="hint">Draft</p>
            <textarea
              className="ai-out"
              rows={7}
              placeholder="Paste a long-form application answer…"
              value={refineIn}
              onChange={(e) => setRefineIn(e.target.value)}
            />
          </div>
          <div>
            <p className="hint">Result</p>
            <textarea
              className="ai-out"
              rows={7}
              value={refineOut}
              readOnly
              placeholder="Refined text appears here…"
            />
          </div>
        </div>
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
