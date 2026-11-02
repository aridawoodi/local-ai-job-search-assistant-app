/**
 * Application tracker — persist rows on fill / apply, stages, notes, reminders, CSV.
 * Schema compatible with extension applications[] for import/export round-trip.
 */
import type { ApplyResult, JobListing, MatchResult } from '../../shared/types'
import {
  jobKey,
  normalizeApplication,
  statusFromStage,
  type ApplicationRow,
  type TrackerStage,
  type TrackerStatus
} from '../../shared/tracker'

export type { ApplicationRow }

export interface TrackerUpsertInput {
  job?: JobListing
  match?: MatchResult
  apply?: ApplyResult
  url?: string
  title?: string
  company?: string
  location?: string
  source?: string
  status?: TrackerStatus
  stage?: TrackerStage
  notes?: string
  reminderAt?: string
  score?: number
  site?: string
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function upsertApplication(
  applications: unknown[],
  input: TrackerUpsertInput
): { applications: ApplicationRow[]; row: ApplicationRow } {
  const list = parseApplications(applications)
  const url = input.url || input.job?.url || input.apply?.url || ''
  const key =
    (input.job?.id && String(input.job.id)) ||
    (url ? jobKey(url) : '') ||
    `row_${Date.now().toString(36)}`

  const existing = list.find((a) => a.key === key || (url && a.url && jobKey(a.url) === jobKey(url)))
  const now = new Date().toISOString()
  const status =
    input.status ||
    (input.apply?.submitted || input.apply?.status === 'submitted'
      ? 'Submitted'
      : input.apply?.status === 'failed'
        ? 'Error - not sent'
        : input.apply?.status === 'filled' || input.apply?.status === 'needs_you'
          ? 'Filled'
          : existing?.status || 'Filled')
  const stage =
    input.stage ||
    (input.apply?.submitted || input.apply?.status === 'submitted'
      ? 'applied'
      : existing?.stage || 'saved')

  const row: ApplicationRow = {
    key: existing?.key || key,
    title: input.title || input.job?.title || existing?.title || 'Untitled role',
    company: input.company || input.job?.company || existing?.company || 'Unknown company',
    url: url || existing?.url || '',
    source: input.source || input.job?.source || existing?.source,
    location: input.location || input.job?.location || existing?.location,
    status,
    stage,
    notes: input.notes != null ? input.notes : existing?.notes || '',
    reminderAt: input.reminderAt != null ? input.reminderAt : existing?.reminderAt || '',
    score: input.score ?? input.match?.score ?? existing?.score,
    site: input.site || input.apply?.adapter || existing?.site,
    filledAt:
      input.apply?.status === 'filled' || input.apply?.status === 'needs_you'
        ? now
        : existing?.filledAt,
    appliedAt: stage === 'applied' || status === 'Applied' || status === 'Submitted'
      ? existing?.appliedAt || now
      : existing?.appliedAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }

  const next = existing
    ? list.map((a) => (a.key === existing.key ? row : a))
    : [row, ...list]

  return { applications: next, row }
}

export function updateApplication(
  applications: unknown[],
  key: string,
  patch: Partial<
    Pick<
      ApplicationRow,
      'stage' | 'status' | 'notes' | 'reminderAt' | 'title' | 'company' | 'location'
    >
  >
): { applications: ApplicationRow[]; row: ApplicationRow | null } {
  const list = parseApplications(applications)
  const idx = list.findIndex((a) => a.key === key)
  if (idx < 0) return { applications: list, row: null }
  const prev = list[idx]
  const stage = patch.stage ?? prev.stage
  const status =
    patch.status ??
    (patch.stage ? statusFromStage(patch.stage) : prev.status)
  const row: ApplicationRow = {
    ...prev,
    ...patch,
    stage,
    status,
    updatedAt: new Date().toISOString(),
    appliedAt:
      stage === 'applied' && !prev.appliedAt
        ? new Date().toISOString()
        : prev.appliedAt
  }
  const next = list.slice()
  next[idx] = row
  return { applications: next, row }
}

export function deleteApplication(
  applications: unknown[],
  key: string
): ApplicationRow[] {
  return parseApplications(applications).filter((a) => a.key !== key)
}

export function parseApplications(raw: unknown[]): ApplicationRow[] {
  if (!Array.isArray(raw)) return []
  const out: ApplicationRow[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const row = normalizeApplication(item)
    if (!row || seen.has(row.key)) continue
    seen.add(row.key)
    out.push(row)
  }
  return out
}

export function applicationsToCsv(applications: unknown[]): string {
  const rows = parseApplications(applications)
  const header = [
    'key',
    'company',
    'title',
    'stage',
    'status',
    'location',
    'source',
    'score',
    'url',
    'notes',
    'reminderAt',
    'filledAt',
    'appliedAt',
    'updatedAt'
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.key,
        r.company,
        r.title,
        r.stage,
        r.status,
        r.location || '',
        r.source || '',
        r.score != null ? String(r.score) : '',
        r.url,
        r.notes,
        r.reminderAt,
        r.filledAt || '',
        r.appliedAt || '',
        r.updatedAt
      ]
        .map(csvEscape)
        .join(',')
    )
  }
  return lines.join('\n') + '\n'
}

export function dueReminders(
  applications: unknown[],
  onOrBeforeIsoDate = new Date().toISOString().slice(0, 10)
): ApplicationRow[] {
  return parseApplications(applications).filter(
    (a) => a.reminderAt && a.reminderAt <= onOrBeforeIsoDate
  )
}

/** Record fill/apply outcomes into the tracker. */
export function recordApplyResults(
  applications: unknown[],
  jobs: JobListing[],
  results: ApplyResult[],
  matches?: MatchResult[]
): { applications: ApplicationRow[]; written: number } {
  let list = parseApplications(applications)
  let written = 0
  for (const result of results) {
    if (
      result.status !== 'filled' &&
      result.status !== 'needs_you' &&
      result.status !== 'failed'
    ) {
      continue
    }
    const job = jobs.find((j) => j.id === result.jobId)
    const match = matches?.find((m) => m.jobId === result.jobId)
    const upserted = upsertApplication(list, {
      job,
      match,
      apply: result,
      url: result.url || job?.url,
      status: result.status === 'failed' ? 'Error - not sent' : 'Filled',
      stage: 'saved'
    })
    list = upserted.applications
    written++
  }
  return { applications: list, written }
}
