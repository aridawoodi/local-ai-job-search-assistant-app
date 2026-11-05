import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppPreferences } from '../../shared/preferences'
import type { ApplyFieldReport, ApplyResult, JobListing } from '../../shared/types'
import EmptyState from './EmptyState'

type ChatLine =
  | { kind: 'bot'; text: string }
  | { kind: 'me'; text: string }
  | {
      kind: 'ask'
      fieldIndex: number
      label: string
      key?: string
      detail?: string
      left: number
    }

interface Props {
  prefs: AppPreferences
  focusJobId?: string
}

type SavePrompt = {
  jobId: string
  fieldIndex: number
  label: string
  key?: string
  previous: string
  next: string
}

function groupFields(fields: ApplyFieldReport[] | undefined) {
  const list = fields || []
  const needsYou = list
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => f.status === 'needs_you' || f.status === 'missing')
  const filled = list
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => f.status === 'filled')
  const skipped = list
    .map((f, index) => ({ f, index }))
    .filter(({ f }) => f.status === 'skipped')
  return { needsYou, filled, skipped }
}

function fieldDraftValue(f: ApplyFieldReport): string {
  if (f.value != null) return f.value
  if (f.status === 'filled' && f.detail) return f.detail
  return ''
}

/** Prefer live HTTPS posting URL; fall back to fill URL. Never hide a usable link. */
function displayPostingUrl(result: ApplyResult, job?: JobListing): string {
  const candidates = [result.postingUrl, job?.url, result.url]
  for (const c of candidates) {
    if (c && /^https?:\/\//i.test(c)) return c
  }
  for (const c of candidates) {
    if (c) return c
  }
  return ''
}

function shortHost(url: string): string {
  try {
    if (url.startsWith('file://')) return 'local practice form'
    return new URL(url).host || url
  } catch {
    return url.slice(0, 64)
  }
}

function EditableFieldList({
  heading,
  items,
  tone,
  jobId,
  drafts,
  onDraftChange,
  onCommit
}: {
  heading: string
  items: Array<{ f: ApplyFieldReport; index: number }>
  tone: 'need' | 'done' | 'skip'
  jobId: string
  drafts: Record<string, string>
  onDraftChange: (draftKey: string, value: string) => void
  onCommit: (fieldIndex: number, previous: string, next: string, field: ApplyFieldReport) => void
}) {
  if (!items.length) return null
  return (
    <div className={`field-group field-group-${tone}`}>
      <div className="rvh">
        {tone === 'need' ? 'Needs you' : tone === 'done' ? 'Filled' : 'Skipped'} ({items.length})
      </div>
      <ul className="field-report field-report-edit">
        {items.slice(0, 16).map(({ f, index }) => {
          const draftKey = `${jobId}:${index}`
          const baseline = fieldDraftValue(f)
          const value = drafts[draftKey] ?? baseline
          const editable = tone !== 'skip'
          return (
            <li key={`${f.label}-${index}`}>
              <div className="field-edit-row">
                <span
                  className={`pill ${
                    tone === 'done' ? 'ok' : tone === 'need' ? 'bad' : ''
                  }`}
                >
                  {f.status}
                </span>
                <label className="field-edit-label">
                  <span>{f.label || heading}</span>
                  {editable ? (
                    <input
                      className="field-edit-input"
                      value={value}
                      placeholder={
                        tone === 'need' ? 'Type an answer for this field…' : undefined
                      }
                      onChange={(e) => onDraftChange(draftKey, e.target.value)}
                      onBlur={(e) => {
                        const next = e.currentTarget.value.trimEnd()
                        if (next !== baseline) {
                          onCommit(index, baseline, next, f)
                        }
                      }}
                    />
                  ) : (
                    <span className="hint">{f.detail ? ` — ${f.detail}` : ''}</span>
                  )}
                </label>
              </div>
              {editable && f.detail && f.status !== 'filled' ? (
                <p className="hint field-edit-hint">{f.detail}</p>
              ) : null}
            </li>
          )
        })}
        {items.length > 16 ? (
          <li className="hint">+{items.length - 16} more</li>
        ) : null}
      </ul>
    </div>
  )
}

export default function ApplyQueue({ prefs, focusJobId }: Props) {
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [results, setResults] = useState<ApplyResult[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [prompt, setPrompt] = useState<SavePrompt | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [chatAnswer, setChatAnswer] = useState('')
  const [chatJobId, setChatJobId] = useState<string | null>(null)

  async function reload() {
    const [j, a] = await Promise.all([
      window.desktopApi.getLastJobs(),
      window.desktopApi.getLastApplyResults()
    ])
    setJobs(j)
    setResults(a)
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    if (!focusJobId) return
    const el = document.getElementById(`apply-job-${focusJobId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusJobId, results])

  /** After Matches Apply lands here, raise the filled browser again (app tab steals focus). */
  const focusedBrowserFor = useRef<string | null>(null)
  useEffect(() => {
    if (!focusJobId) {
      focusedBrowserFor.current = null
      return
    }
    if (focusedBrowserFor.current === focusJobId) return
    const result = results.find((r) => r.jobId === focusJobId)
    if (
      !result ||
      (result.status !== 'filled' &&
        result.status !== 'needs_you' &&
        result.status !== 'submitted')
    ) {
      return
    }
    focusedBrowserFor.current = focusJobId
    const t = window.setTimeout(() => {
      void window.desktopApi.focusFilledForm(focusJobId).then((r) => {
        if (r.message) setMsg(r.message)
      })
    }, 350)
    return () => window.clearTimeout(t)
  }, [focusJobId, results])

  /** Extension-style chat: seed when Matches Apply focuses a fill, or when a filled result lands. */
  useEffect(() => {
    const targetId =
      focusJobId ||
      results.find(
        (r) =>
          (r.status === 'filled' || r.status === 'needs_you' || r.status === 'submitted') &&
          r.fields?.length
      )?.jobId
    if (!targetId) return
    if (chatJobId === targetId) return
    const result = results.find((r) => r.jobId === targetId)
    if (!result?.fields?.length) return
    if (
      result.status !== 'filled' &&
      result.status !== 'needs_you' &&
      result.status !== 'submitted'
    ) {
      return
    }

    const needs = result.fields
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.status === 'needs_you' || f.status === 'missing')
    const filledN = result.fields.filter((f) => f.status === 'filled').length
    const job = jobs.find((j) => j.id === targetId)
    const link = displayPostingUrl(result, job)
    const lines: ChatLine[] = [
      {
        kind: 'bot',
        text: `Filled ${filledN}${needs.length ? `, ${needs.length} need you` : ''}${
          job ? ` for ${job.title} · ${job.company}` : ''
        }. Confirm mode never presses Submit.`
      }
    ]
    if (result.usedPractice) {
      lines.push({
        kind: 'bot',
        text: link
          ? `This fill used the local practice form (fixture/demo). Listing URL is still available: ${link}`
          : 'This fill used the local practice form (fixture/demo listing).'
      })
    } else if (link) {
      lines.push({
        kind: 'bot',
        text: `Filled on the live posting (${shortHost(link)}). Review in the automation browser, then Submit on the page.`
      })
    }
    if (needs.length) {
      lines.push({
        kind: 'bot',
        text: `I couldn't fill ${needs.length} field${needs.length > 1 ? 's' : ''}. Let's do them one at a time.`
      })
      const first = needs[0]
      lines.push({
        kind: 'ask',
        fieldIndex: first.index,
        label: first.f.label || first.f.key || 'Field',
        key: first.f.key,
        detail: first.f.detail,
        left: needs.length
      })
    } else {
      lines.push({
        kind: 'bot',
        text: 'All set here — Review in browser → Submit on the page. Use Open / Focus above to jump to the filled form.'
      })
    }
    setChatJobId(targetId)
    setChat(lines)
    setChatAnswer('')
  }, [focusJobId, results, jobs, chatJobId])

  const pending = useMemo(
    () => results.filter((r) => r.status === 'pending_confirm'),
    [results]
  )
  const filled = useMemo(
    () =>
      results.filter(
        (r) =>
          r.status === 'filled' ||
          r.status === 'needs_you' ||
          r.status === 'submitted' ||
          r.submitted
      ),
    [results]
  )

  async function queueTopFits() {
    setBusy(true)
    try {
      let source = jobs
      if (!source.length) {
        const search = await window.desktopApi.runSearch()
        source = search.jobs
        setJobs(source)
      }
      const matches = await window.desktopApi.runMatch(source)
      const ids = matches
        .filter((m) => m.fits)
        .slice(0, 5)
        .map((m) => m.jobId)
      if (!ids.length) {
        setMsg('No fits to fill — lower threshold or run a broader search.')
        return
      }
      const next = await window.desktopApi.runApply(ids)
      setResults(next)
      setMsg(
        prefs.applySafety === 'confirm'
          ? `Queued ${next.filter((r) => r.status === 'pending_confirm').length} for Fill confirmation.`
          : `Unattended fill finished for ${next.length} job(s).`
      )
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmSelected(ids: string[]) {
    setBusy(true)
    try {
      const next = await window.desktopApi.confirmApply(ids)
      setResults(next)
      setMsg(
        `Filled: ${next.filter((r) => r.status === 'filled' || r.status === 'needs_you').length}` +
          (next.some((r) => r.submitted)
            ? `, ${next.filter((r) => r.submitted).length} submitted`
            : ' (submit blocked in confirm mode)') +
          '. Tracker updated.'
      )
      await reload()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function applyLocalFieldEdit(jobId: string, fieldIndex: number, value: string) {
    setResults((prev) =>
      prev.map((r) => {
        if (r.jobId !== jobId || !r.fields) return r
        const fields = r.fields.map((f, i) =>
          i === fieldIndex
            ? {
                ...f,
                value,
                detail: value || f.detail,
                status:
                  f.status === 'skipped'
                    ? f.status
                    : value.trim()
                      ? ('filled' as const)
                      : ('needs_you' as const)
              }
            : f
        )
        const needsYouCount = fields.filter(
          (f) => f.status === 'needs_you' || f.status === 'missing'
        ).length
        const filledCount = fields.filter((f) => f.status === 'filled').length
        return {
          ...r,
          fields,
          needsYouCount,
          filledCount,
          status:
            r.status === 'submitted' || r.submitted
              ? r.status
              : needsYouCount > 0
                ? ('needs_you' as const)
                : r.status === 'pending_confirm'
                  ? r.status
                  : ('filled' as const)
        }
      })
    )
  }

  function requestSavePrompt(
    jobId: string,
    fieldIndex: number,
    previous: string,
    next: string,
    field: ApplyFieldReport
  ) {
    applyLocalFieldEdit(jobId, fieldIndex, next)
    if (previous === next) return
    setPrompt({
      jobId,
      fieldIndex,
      label: field.label || field.key || 'Field',
      key: field.key,
      previous,
      next
    })
  }

  async function resolveSavePrompt(saveForFuture: boolean) {
    if (!prompt) return
    const current = prompt
    setPrompt(null)
    setBusy(true)
    try {
      const result = await window.desktopApi.saveFillAnswer({
        label: current.label,
        key: current.key,
        value: current.next,
        saveForFuture
      })
      setMsg(result.message)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function nextNeedsAsk(jobId: string, afterIndex: number): ChatLine | null {
    const result = results.find((r) => r.jobId === jobId)
    if (!result?.fields) return null
    const needs = result.fields
      .map((f, index) => ({ f, index }))
      .filter(
        ({ f, index }) =>
          index !== afterIndex && (f.status === 'needs_you' || f.status === 'missing')
      )
    if (!needs.length) return null
    const n = needs[0]
    return {
      kind: 'ask',
      fieldIndex: n.index,
      label: n.f.label || n.f.key || 'Field',
      key: n.f.key,
      detail: n.f.detail,
      left: needs.length
    }
  }

  async function submitChatAnswer(jobId: string, fieldIndex: number, label: string, key?: string) {
    const value = chatAnswer.trim()
    if (!value) return
    setChat((prev) => [...prev, { kind: 'me', text: value }])
    setChatAnswer('')
    applyLocalFieldEdit(jobId, fieldIndex, value)
    setBusy(true)
    try {
      const saved = await window.desktopApi.saveFillAnswer({
        label,
        key,
        value,
        saveForFuture: true
      })
      const ask = nextNeedsAsk(jobId, fieldIndex)
      setChat((prev) => [
        ...prev,
        {
          kind: 'bot',
          text: `✓ Filled “${label}”.${saved.savedBank || saved.savedProfile ? ' Saved for next time.' : ''}`
        },
        ...(ask
          ? [ask]
          : [
              {
                kind: 'bot' as const,
                text: 'All Needs you fields answered. Review in browser → Submit on the page (Open / Focus below).'
              }
            ])
      ])
    } catch (err) {
      setChat((prev) => [
        ...prev,
        {
          kind: 'bot',
          text: err instanceof Error ? err.message : String(err)
        }
      ])
    } finally {
      setBusy(false)
    }
  }

  function skipChatField(jobId: string, fieldIndex: number, label: string) {
    setChat((prev) => [...prev, { kind: 'me', text: `Skip “${label}”` }])
    const ask = nextNeedsAsk(jobId, fieldIndex)
    if (ask) setChat((prev) => [...prev, ask])
    else
      setChat((prev) => [
        ...prev,
        {
          kind: 'bot',
          text: 'Okay — finish anything left on the page. Use Show filled form in browser when ready.'
        }
      ])
  }

  async function focusFilled(jobId: string) {
    setBusy(true)
    try {
      const result = await window.desktopApi.focusFilledForm(jobId)
      setMsg(result.message)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function openListing(jobId: string) {
    setBusy(true)
    try {
      const result = await window.desktopApi.openJobPosting(jobId)
      setMsg(result.message)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function draftChatAnswer(label: string) {
    if (!chatAnswer.trim() && !label) return
    setBusy(true)
    try {
      const result = await window.desktopApi.aiRefine(
        chatAnswer.trim() || `Draft an answer for: ${label}`,
        'polish',
        label
      )
      if (result.ok && result.text) {
        setChatAnswer(result.text)
        setChat((prev) => [
          ...prev,
          { kind: 'bot', text: `Draft ready — edit if needed, then Fill.${result.message ? ` ${result.message}` : ''}` }
        ])
      } else {
        setChat((prev) => [
          ...prev,
          {
            kind: 'bot',
            text: result.message || 'Could not draft — type an answer or use Resume → Refine.'
          }
        ])
      }
    } catch (err) {
      setChat((prev) => [
        ...prev,
        { kind: 'bot', text: err instanceof Error ? err.message : String(err) }
      ])
    } finally {
      setBusy(false)
    }
  }

  const activeAsk = useMemo(
    () => [...chat].reverse().find((l): l is Extract<ChatLine, { kind: 'ask' }> => l.kind === 'ask'),
    [chat]
  )

  /** Always surface posting link + Focus for the focused/latest fill — never a dead-end with no URL. */
  const spotlightJobId = focusJobId || chatJobId || filled[0]?.jobId
  const spotlightResult = spotlightJobId
    ? results.find((r) => r.jobId === spotlightJobId)
    : undefined
  const spotlightJob = spotlightJobId ? jobs.find((j) => j.id === spotlightJobId) : undefined
  const spotlightLink = spotlightResult
    ? displayPostingUrl(spotlightResult, spotlightJob)
    : spotlightJob?.url || ''
  const spotlightNeeds =
    spotlightResult?.fields?.filter(
      (f) => f.status === 'needs_you' || f.status === 'missing'
    ).length ?? spotlightResult?.needsYouCount ?? 0

  return (
    <div className="panel wide">
      <h2>Apply</h2>
      <p className="lede">
        Matches <strong>Apply</strong> opens the real posting, fills like the extension, then lands
        here for <strong>Needs you</strong> chat + field review. You can also queue top fits below.
        Safety: <strong>{prefs.applySafety}</strong>
        {prefs.applySafety === 'unattended'
          ? prefs.allowAutoSubmit
            ? ' · auto-submit ON'
            : ' · fill only (auto-submit off)'
          : ' · confirm fills but never auto-submits'}
        . Daily cap {prefs.maxActionsPerDay}.
      </p>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void queueTopFits()}>
          Fill top fits
        </button>
        <button
          className="btn"
          disabled={busy || !pending.length}
          onClick={() => void confirmSelected(pending.map((p) => p.jobId))}
        >
          Confirm &amp; fill all ({pending.length})
        </button>
      </div>

      {msg ? <p className="hint" style={{ marginTop: '0.75rem' }}>{msg}</p> : null}

      {spotlightResult &&
      (spotlightResult.status === 'filled' ||
        spotlightResult.status === 'needs_you' ||
        spotlightResult.status === 'submitted' ||
        spotlightResult.submitted) ? (
        <section className="apply-posting-card apply-spotlight" aria-label="Filled posting">
          <div className="apply-chat-head">
            <h3>{spotlightNeeds > 0 ? 'Needs you' : 'Review & submit'}</h3>
            <p className="hint">
              {spotlightNeeds > 0
                ? 'Finish answers below, then Submit on the page yourself.'
                : 'Review in browser → Submit on the page. Confirm mode never presses Submit.'}
            </p>
          </div>
          <div className="apply-posting-title">
            {spotlightJob?.title || spotlightJobId}
            {spotlightJob?.company ? (
              <span className="hint"> · {spotlightJob.company}</span>
            ) : null}
          </div>
          {spotlightLink ? (
            <a
              className="apply-posting-link"
              href={spotlightLink}
              target="_blank"
              rel="noreferrer"
              title={spotlightLink}
            >
              {shortHost(spotlightLink)}
              <span className="apply-posting-url-full">{spotlightLink}</span>
            </a>
          ) : (
            <p className="hint">No posting URL on this result yet.</p>
          )}
          {spotlightResult.usedPractice ? (
            <p className="hint apply-practice-note">
              Filled on the local practice form (fixture/demo). Live jobs always keep their real URL
              above.
            </p>
          ) : null}
          <div className="actions" style={{ marginTop: '0.55rem' }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !spotlightJobId}
              onClick={() => spotlightJobId && void focusFilled(spotlightJobId)}
            >
              Show filled form in browser
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !spotlightJobId}
              onClick={() => spotlightJobId && void focusFilled(spotlightJobId)}
            >
              Focus browser
            </button>
            {spotlightLink && /^https?:\/\//i.test(spotlightLink) && spotlightJobId ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void openListing(spotlightJobId)}
              >
                Open posting
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {chat.length && chatJobId ? (
        <section className="apply-chat" aria-label="Needs you assistant">
          <div className="apply-chat-head">
            <h3>{spotlightNeeds > 0 ? 'Needs you chat' : 'Review chat'}</h3>
            <p className="hint">
              Extension-style refine — answer one field at a time. Submit stays on the page.
            </p>
          </div>
          <div className="apply-chat-log">
            {chat.map((line, i) => {
              if (line.kind === 'bot') {
                return (
                  <div key={i} className="apply-chat-bubble bot">
                    {line.text}
                  </div>
                )
              }
              if (line.kind === 'me') {
                return (
                  <div key={i} className="apply-chat-bubble me">
                    {line.text}
                  </div>
                )
              }
              const isActive = activeAsk === line
              if (!isActive) return null
              return (
                <div key={i} className="apply-chat-card">
                  <div className="kick">
                    Needs you{line.left > 1 ? ` · ${line.left} left` : ''}
                  </div>
                  <div className="lbl">{line.label}</div>
                  {line.detail ? <p className="hint">{line.detail}</p> : null}
                  <div className="ans">
                    <input
                      className="field-edit-input"
                      value={chatAnswer}
                      placeholder="Type your answer…"
                      disabled={busy}
                      onChange={(e) => setChatAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void submitChatAnswer(chatJobId, line.fieldIndex, line.label, line.key)
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy || !chatAnswer.trim()}
                      onClick={() =>
                        void submitChatAnswer(chatJobId, line.fieldIndex, line.label, line.key)
                      }
                    >
                      Fill
                    </button>
                  </div>
                  <div className="actions" style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => void draftChatAnswer(line.label)}
                    >
                      ✨ Draft it for me
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => skipChatField(chatJobId, line.fieldIndex, line.label)}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {prompt ? (
        <div className="save-answer-prompt" role="dialog" aria-labelledby="save-answer-title">
          <div>
            <p id="save-answer-title" className="save-answer-title">
              Save this answer for future applications?
            </p>
            <p className="hint">
              You changed <strong>{prompt.label}</strong>
              {prompt.previous ? (
                <>
                  {' '}
                  from <em>{prompt.previous}</em>
                </>
              ) : null}{' '}
              to <em>{prompt.next || '(empty)'}</em>. Saving updates your profile and/or answer
              bank so the next fill uses it — this application already has your edit.
            </p>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void resolveSavePrompt(false)}
            >
              Just this application
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void resolveSavePrompt(true)}
            >
              Yes, save for next time
            </button>
          </div>
        </div>
      ) : null}

      {!results.length ? (
        <EmptyState
          title="Nothing to fill yet"
          body="From Matches, press Apply on a card — or queue top fits here. Confirm mode fills but never presses Submit."
          steps={[
            'Run a search and score matches first (Pipeline or Matches).',
            'Matches → Apply opens the real posting, fills, then Needs you chat / field review.',
            prefs.applySafety === 'confirm'
              ? 'Batch “Fill top fits” still queues here until Confirm & fill; Submit stays manual.'
              : prefs.allowAutoSubmit
                ? 'Unattended + auto-submit may click Submit (daily cap applies).'
                : 'Unattended fills only — you still submit manually.'
          ]}
        />
      ) : null}

      <div className="split-cols">
        <section>
          <h3>Pending confirm</h3>
          {pending.length === 0 ? (
            <p className="hint">Nothing waiting.</p>
          ) : (
            <div className="card-list">
              {pending.map((r) => {
                const job = jobs.find((j) => j.id === r.jobId)
                const link = displayPostingUrl(r, job)
                return (
                  <article
                    key={r.jobId}
                    id={`apply-job-${r.jobId}`}
                    className={`inbox-card${focusJobId === r.jobId ? ' apply-focus' : ''}`}
                  >
                    <h3>{job?.title || r.jobId}</h3>
                    <p>
                      {job?.company || ''}
                      {job?.location ? ` · ${job.location}` : ''}
                    </p>
                    {link ? (
                      <a
                        className="apply-posting-link"
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        title={link}
                      >
                        {shortHost(link)}
                      </a>
                    ) : null}
                    <p className="hint">{r.message}</p>
                    <div className="actions">
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void confirmSelected([r.jobId])}
                      >
                        Confirm &amp; fill
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void openListing(r.jobId)}
                      >
                        Open posting
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <h3>Field review</h3>
          {filled.length === 0 ? (
            <p className="hint">
              No fills yet this session. After Confirm &amp; fill, edit answers inline below —
              no need to bounce back to Profile.
            </p>
          ) : (
            <div className="card-list">
              {filled.map((r) => {
                const job = jobs.find((j) => j.id === r.jobId)
                const submitted = r.submitted || r.status === 'submitted'
                const groups = groupFields(r.fields)
                const link = displayPostingUrl(r, job)
                return (
                  <article
                    key={r.jobId}
                    id={`apply-job-${r.jobId}`}
                    className={`inbox-card review-card${focusJobId === r.jobId ? ' apply-focus' : ''}`}
                  >
                    <div className="inbox-head">
                      <div>
                        <h3>{job?.title || r.jobId}</h3>
                        <p>{job?.company || r.adapter || ''}</p>
                      </div>
                      <span
                        className={`pill ${
                          r.status === 'needs_you' ? 'bad' : submitted ? 'ok' : ''
                        }`}
                      >
                        {r.status}
                        {r.submitConfirmed ? ' · confirmed' : ''}
                      </span>
                    </div>
                    {link ? (
                      <a
                        className="apply-posting-link"
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        title={link}
                      >
                        {shortHost(link)}
                      </a>
                    ) : (
                      <p className="hint">No posting URL available for this fill.</p>
                    )}
                    {r.usedPractice ? (
                      <p className="hint apply-practice-note">
                        Practice form fill (fixture/demo) — not a live ATS page.
                      </p>
                    ) : null}
                    <p className="hint">
                      Filled {r.filledCount ?? groups.filled.length}
                      {r.needsYouCount || groups.needsYou.length
                        ? ` · Needs you ${r.needsYouCount ?? groups.needsYou.length}`
                        : ' · Review in browser → Submit on the page'}
                      {submitted
                        ? r.submitConfirmed
                          ? ' · submit tracked'
                          : ' · submitted'
                        : ' · no auto-submit'}
                      {r.stepsAdvanced ? ` · ${r.stepsAdvanced} step(s)` : ''}
                    </p>
                    <div className="actions" style={{ marginBottom: '0.65rem' }}>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void focusFilled(r.jobId)}
                      >
                        Show filled form in browser
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void focusFilled(r.jobId)}
                      >
                        Focus browser
                      </button>
                    </div>
                    <EditableFieldList
                      heading="Needs you"
                      items={groups.needsYou}
                      tone="need"
                      jobId={r.jobId}
                      drafts={drafts}
                      onDraftChange={(k, v) => setDrafts((d) => ({ ...d, [k]: v }))}
                      onCommit={(index, previous, next, field) =>
                        requestSavePrompt(r.jobId, index, previous, next, field)
                      }
                    />
                    <EditableFieldList
                      heading="Filled"
                      items={groups.filled}
                      tone="done"
                      jobId={r.jobId}
                      drafts={drafts}
                      onDraftChange={(k, v) => setDrafts((d) => ({ ...d, [k]: v }))}
                      onCommit={(index, previous, next, field) =>
                        requestSavePrompt(r.jobId, index, previous, next, field)
                      }
                    />
                    <EditableFieldList
                      heading="Skipped"
                      items={groups.skipped}
                      tone="skip"
                      jobId={r.jobId}
                      drafts={drafts}
                      onDraftChange={(k, v) => setDrafts((d) => ({ ...d, [k]: v }))}
                      onCommit={() => undefined}
                    />
                    {!r.fields?.length ? (
                      <p className="hint">No per-field report for this fill.</p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
