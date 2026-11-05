/**
 * Profile helpers aligned with extension lib/defaults.js (read-only reference).
 * Sync mirrors, list parsing, EEO choices — never invent EEO values.
 */

import type {
  EducationEntry,
  EeoFields,
  UserProfile,
  WorkHistoryEntry
} from './profile'
import { EMPTY_PROFILE } from './profile'

export const NO_ANSWER = "I don't wish to answer"

export const DEGREES = [
  'High School',
  "Associate's",
  "Bachelor's",
  "Master's",
  'Doctorate',
  'Certificate',
  'Bootcamp',
  'Other'
] as const

export const EDU_STATUS: Array<[string, string]> = [
  ['completed', 'Completed'],
  ['in progress', 'In progress'],
  ['attended', 'Attended (not completed)']
]

export const EEO_KEYS: Array<keyof EeoFields> = [
  'gender',
  'transgender',
  'sexualOrientation',
  'ethnicity',
  'hispanicLatino',
  'veteran',
  'disability'
]

export const EEO_CHOICES: Record<string, string[]> = {
  gender: ['Male', 'Female', 'Non-binary', NO_ANSWER],
  transgender: ['No', 'Yes', NO_ANSWER],
  sexualOrientation: [
    'Heterosexual / straight',
    'Gay',
    'Lesbian',
    'Bisexual',
    'Queer',
    'Asexual',
    NO_ANSWER
  ],
  ethnicity: [
    'American Indian or Alaska Native',
    'Asian',
    'Black or African American',
    'Hispanic or Latino',
    'Middle Eastern or North African',
    'Native Hawaiian or Other Pacific Islander',
    'White',
    'Two or more races',
    NO_ANSWER
  ],
  hispanicLatino: ['No', 'Yes', NO_ANSWER],
  veteran: [
    'I am not a protected veteran',
    'I identify as one or more of the classifications of protected veteran',
    NO_ANSWER
  ],
  disability: [
    'No, I do not have a disability',
    'Yes, I have a disability',
    NO_ANSWER
  ],
  pronouns: ['he/him', 'she/her', 'they/them', NO_ANSWER]
}

export const YN = ['', 'Yes', 'No'] as const

const DEGREE_RANK: Record<string, number> = {
  'High School': 1,
  Certificate: 2,
  Bootcamp: 2,
  Other: 2,
  "Associate's": 3,
  "Bachelor's": 4,
  "Master's": 5,
  Doctorate: 6
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]
const PRESENT_RE =
  /^(present|current(ly)?|now|today|ongoing|to date|till date|till now)$/i

export function isPresentEnd(s: unknown): boolean {
  return PRESENT_RE.test(String(s == null ? '' : s).trim().replace(/[.)]+$/, ''))
}

function monthNo(s: string): number {
  const k = String(s || '')
    .slice(0, 3)
    .toLowerCase()
  return MONTHS.findIndex((m) => m.toLowerCase() === k) + 1
}

export function parseWhen(s: unknown): { present?: boolean; y?: number; m?: number; fuzzy?: boolean } | null {
  let t = String(s == null ? '' : s).trim()
  if (!t) return null
  if (isPresentEnd(t)) return { present: true }
  let m = t.match(/^([A-Za-z]{3,9})\.?,?\s+((?:19|20)\d\d)$/)
  if (m && monthNo(m[1])) return { y: +m[2], m: monthNo(m[1]) }
  m = t.match(/^(\d{1,2})\s*[/.-]\s*((?:19|20)\d\d)$/)
  if (m && +m[1] >= 1 && +m[1] <= 12) return { y: +m[2], m: +m[1] }
  m = t.match(/^((?:19|20)\d\d)\s*[/.-]\s*(\d{1,2})(?:[/.-]\d{1,2})?$/)
  if (m && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2] }
  m = t.match(/^((?:19|20)\d\d)$/)
  if (m) return { y: +m[1], m: 0 }
  m = t.match(/\b((?:19|20)\d\d)\b/)
  return m ? { y: +m[1], m: 0, fuzzy: true } : null
}

export function fmtWhen(w: { present?: boolean; y?: number; m?: number } | null): string {
  if (!w) return ''
  if (w.present) return 'Present'
  if (w.y) return w.m ? `${MONTHS[w.m - 1]} ${w.y}` : String(w.y)
  return ''
}

function whenKey(s: unknown, isEnd: boolean): number | null {
  const w = parseWhen(s)
  if (!w) return null
  if (w.present) return Infinity
  return (w.y || 0) * 12 + (w.m ? w.m - 1 : isEnd ? 11 : 0)
}

export function normalizeJob(j: WorkHistoryEntry | null | undefined): WorkHistoryEntry {
  const s = (v: unknown) => String(v == null ? '' : v).trim()
  const out: WorkHistoryEntry = {
    ...j,
    title: s(j?.title),
    company: s(j?.company),
    location: s(j?.location),
    start: s(j?.start),
    end: s(j?.end),
    current: false,
    bullets: (Array.isArray(j?.bullets) ? j!.bullets! : String(j?.bullets || '').split('\n'))
      .map(s)
      .filter(Boolean)
  }
  const w = parseWhen(out.start)
  if (w && !w.fuzzy && !w.present) out.start = fmtWhen(w)
  if (isPresentEnd(out.end)) {
    out.end = 'Present'
    out.current = true
  } else {
    const e = parseWhen(out.end)
    if (e && !e.fuzzy) out.end = fmtWhen(e)
  }
  return out
}

export function sortJobs(list: WorkHistoryEntry[]): WorkHistoryEntry[] {
  const k = (j: WorkHistoryEntry) => {
    const e = whenKey(j.end, true)
    return e != null ? e : whenKey(j.start, false)
  }
  return list
    .map((j, i) => ({ j, i, k: k(j) }))
    .sort((a, b) => {
      if (a.k == null && b.k == null) return a.i - b.i
      if (a.k == null) return 1
      if (b.k == null) return -1
      if (b.k !== a.k) return b.k > a.k ? 1 : -1
      return a.i - b.i
    })
    .map((x) => x.j)
}

export function syncCurrent(p: UserProfile): UserProfile {
  p.workHistory = (Array.isArray(p.workHistory) ? p.workHistory : []).map((j) => ({
    ...j,
    current: isPresentEnd(j.end)
  }))
  const c = p.workHistory.find((j) => j && j.current)
  p.currentEmployer = c ? c.company || '' : ''
  p.currentTitle = c
    ? String(c.title || '')
        .split(/\s+[·|•]\s+|\s+\/\s+/)[0]
    : ''
  p.currentStartDate = c ? c.start || '' : ''
  return p
}

export function educationListOf(p: UserProfile): EducationEntry[] {
  if (p && Array.isArray(p.educationList) && p.educationList.length) return p.educationList
  const e = (p && p.education) || {}
  return e.school
    ? [
        {
          school: e.school,
          degree: e.degree || '',
          field: e.field || '',
          start: e.startYear || '',
          end: e.endYear || '',
          location: e.location || '',
          status: 'completed',
          highest: true
        }
      ]
    : []
}

function yearOf(s: unknown): string {
  return (String(s || '').match(/(19|20)\d\d/) || [''])[0]
}

export function highestEducation(list: EducationEntry[]): EducationEntry | null {
  const filtered = (list || []).filter((e) => e && (e.school || e.degree))
  if (!filtered.length) return null
  const marked = filtered.find((e) => e.highest)
  if (marked) return marked
  const rank = (e: EducationEntry) => DEGREE_RANK[e.degree || ''] || 0
  const done = filtered.filter((e) => !e.status || e.status === 'completed')
  return (done.length ? done : filtered).slice().sort((a, b) => rank(b) - rank(a))[0]
}

export function syncEducation(p: UserProfile): UserProfile {
  const list = educationListOf(p).map((e) => ({ ...e }))
  const top = highestEducation(list)
  list.forEach((e) => {
    e.highest = top ? e === top || (e.school === top.school && e.degree === top.degree && e.field === top.field) : false
  })
  // Mark exactly one highest by index when object identity fails after map
  if (top) {
    const idx = list.findIndex(
      (e) =>
        e.school === top.school &&
        e.degree === top.degree &&
        e.field === top.field &&
        e.start === top.start &&
        e.end === top.end
    )
    list.forEach((e, i) => {
      e.highest = i === (idx >= 0 ? idx : 0)
    })
  }
  p.educationList = list
  if (top) {
    p.education = {
      ...(p.education || EMPTY_PROFILE.education),
      school: top.school || '',
      degree: top.degree || '',
      field: top.field || '',
      location: top.location || '',
      startYear: yearOf(top.start),
      endYear: top.status === 'completed' || !top.status ? yearOf(top.end) : ''
    }
  } else if (!list.length) {
    p.education = { ...EMPTY_PROFILE.education }
  }
  return p
}

/** Split "Python, AWS (Lambda, ECS); SQL" on commas/semicolons outside parentheses. */
export function splitList(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of String(s || '') + ',') {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === ';' || ch === '\n') && !depth) {
      const t = cur.trim()
      if (t) out.push(t)
      cur = ''
    } else cur += ch
  }
  return out
}

/** One certification per line; lone year lines join the previous item. */
export function splitLines(s: string): string[] {
  const out: string[] = []
  for (const raw of String(s || '').split(/\n/)) {
    const t = raw.replace(/\s+/g, ' ').trim()
    if (!t) continue
    if (
      out.length &&
      /^[(\[]?((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? )?(19|20)\d\d[)\]]?$/i.test(
        t
      )
    ) {
      out[out.length - 1] += ' — ' + t.replace(/[()[\]]/g, '')
    } else out.push(t)
  }
  return out
}

export function emptyEducationEntry(highest = false): EducationEntry {
  return {
    school: '',
    degree: '',
    field: '',
    location: '',
    start: '',
    end: '',
    status: 'completed',
    highest
  }
}

export function emptyWorkEntry(): WorkHistoryEntry {
  return {
    company: '',
    title: '',
    location: '',
    start: '',
    end: '',
    current: false,
    bullets: []
  }
}

export function emptyProjectEntry() {
  return {
    name: '',
    link: '',
    start: '',
    end: '',
    role: '',
    description: '',
    bullets: [] as string[],
    tech: [] as string[]
  }
}

/** Deep-clone profile + sync mirrors before save. */
export function prepareProfileForSave(profile: UserProfile): UserProfile {
  const p: UserProfile = {
    ...EMPTY_PROFILE,
    ...profile,
    education: { ...EMPTY_PROFILE.education, ...(profile.education || {}) },
    eeo: { ...EMPTY_PROFILE.eeo, ...(profile.eeo || {}) },
    workHistory: (profile.workHistory || []).map(normalizeJob).filter((j) => j.company || j.title),
    educationList: (profile.educationList || []).filter((e) => e.school || e.degree),
    projects: (profile.projects || []).filter((x) => x.name || x.description || x.link),
    skills: [...(profile.skills || [])],
    certifications: [...(profile.certifications || [])],
    languages: [...(profile.languages || [])]
  }
  syncEducation(p)
  syncCurrent(p)
  return p
}
