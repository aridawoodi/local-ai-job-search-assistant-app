/**
 * Application tracker schema aligned with extension STAGES / STATUS / jobKey
 * (job-apply-assistant lib/defaults.js). Desktop adds score + fill metadata.
 */

export type TrackerStage =
  | 'saved'
  | 'applied'
  | 'screen'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export type TrackerStatus =
  | 'Filled'
  | 'Submitted'
  | 'Applied'
  | 'Error - not sent'
  | 'Interview'
  | 'Offer'
  | 'Rejected'
  | 'Withdrawn'

export const TRACKER_STAGES: { id: TrackerStage; label: string }[] = [
  { id: 'saved', label: 'Saved' },
  { id: 'applied', label: 'Applied' },
  { id: 'screen', label: 'Screen' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' }
]

export const TRACKER_STATUSES: TrackerStatus[] = [
  'Filled',
  'Submitted',
  'Applied',
  'Error - not sent',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn'
]

export interface ApplicationRow {
  key: string
  title: string
  company: string
  url: string
  source?: string
  location?: string
  status: TrackerStatus
  stage: TrackerStage
  notes: string
  reminderAt: string
  score?: number
  site?: string
  filledAt?: string
  appliedAt?: string
  createdAt: string
  updatedAt: string
}

export function stageFromStatus(status: TrackerStatus | string): TrackerStage {
  const s = String(status || '')
  if (s === 'Interview') return 'interview'
  if (s === 'Offer') return 'offer'
  if (s === 'Rejected') return 'rejected'
  if (s === 'Withdrawn') return 'withdrawn'
  if (s === 'Submitted' || s === 'Applied') return 'applied'
  return 'saved'
}

export function statusFromStage(stage: TrackerStage): TrackerStatus {
  switch (stage) {
    case 'applied':
    case 'screen':
      return 'Applied'
    case 'interview':
      return 'Interview'
    case 'offer':
      return 'Offer'
    case 'rejected':
      return 'Rejected'
    case 'withdrawn':
      return 'Withdrawn'
    default:
      return 'Filled'
  }
}

/** Stable id for a job posting across apply / thanks URLs (ported from extension jobKey). */
export function jobKey(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return String(url || '').toLowerCase()
  }
  const h = u.hostname.toLowerCase()
  const p = u.pathname.split('/').filter(Boolean)
  if (/(^|\.)greenhouse\.io$/.test(h)) {
    const id =
      (u.pathname.match(/\/jobs\/(\d+)/) || [])[1] ||
      u.searchParams.get('token') ||
      u.searchParams.get('gh_jid') ||
      ''
    const board = (p[0] && p[0] !== 'embed' ? p[0] : u.searchParams.get('for')) || ''
    if (id) return `greenhouse:${board.toLowerCase()}:${id}`
  }
  if (/(^|\.)(myworkdayjobs|myworkday|myworkdaysite)\.com$/.test(h)) {
    const m =
      u.pathname.match(/\/job\/[^/]+\/[^/]*?_([A-Za-z]*-?\d[\w-]*)(?=\/|$)/) ||
      u.pathname.match(/_(R-?\d+|JR-?\d+|\d{4,})(?=\/|$)/i)
    if (m) return `workday:${h.split('.')[0]}:${m[1].toLowerCase()}`
  }
  if (/(^|\.)linkedin\.com$/.test(h)) {
    const id =
      (u.pathname.match(/\/jobs\/view\/(\d+)/) || [])[1] ||
      u.searchParams.get('currentJobId')
    if (id) return `linkedin:${id}`
  }
  if (/(^|\.)lever\.co$/.test(h) && p.length >= 2) {
    return `lever:${p[0].toLowerCase()}:${p[1].toLowerCase()}`
  }
  if (/(^|\.)ashbyhq\.com$/.test(h) && p.length >= 2) {
    return `ashby:${p[0].toLowerCase()}:${p[1].toLowerCase()}`
  }
  if (/(^|\.)indeed\.com$/.test(h)) {
    const jk = u.searchParams.get('jk') || (u.pathname.match(/\/viewjob/) && u.searchParams.get('vjk'))
    if (jk) return `indeed:${jk}`
  }
  const path = u.pathname
    .replace(/\/(apply|application|thanks|thank-you|confirmation|success)\/?$/i, '')
    .replace(/\/+$/, '')
  return (h + path).toLowerCase()
}

export function normalizeApplication(raw: unknown): ApplicationRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const url = String(r.url || r.formUrl || '')
  const key = String(r.key || (url ? jobKey(url) : '') || r.id || '')
  if (!key && !url) return null
  const status = (String(r.status || 'Filled') as TrackerStatus) || 'Filled'
  const stageRaw = String(r.stage || '')
  const stage = (
    TRACKER_STAGES.some((s) => s.id === stageRaw)
      ? stageRaw
      : stageFromStatus(status)
  ) as TrackerStage
  const now = new Date().toISOString()
  return {
    key: key || jobKey(url),
    title: String(r.title || 'Untitled role'),
    company: String(r.company || 'Unknown company'),
    url: url || '',
    source: r.source != null ? String(r.source) : undefined,
    location: r.location != null ? String(r.location) : undefined,
    status: TRACKER_STATUSES.includes(status) ? status : 'Filled',
    stage,
    notes: String(r.notes || ''),
    reminderAt: String(r.reminderAt || '').slice(0, 10),
    score: typeof r.score === 'number' ? r.score : undefined,
    site: r.site != null ? String(r.site) : undefined,
    filledAt: r.filledAt != null ? String(r.filledAt) : undefined,
    appliedAt: r.appliedAt != null ? String(r.appliedAt) : undefined,
    createdAt: String(r.createdAt || now),
    updatedAt: String(r.updatedAt || now)
  }
}
