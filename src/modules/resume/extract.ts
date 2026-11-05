/**
 * Deterministic resume → profile extraction (rules-only port of extension
 * lib/extract.js + lib/resume.js patterns). Never invents; never fills EEO.
 */

import type {
  EducationEntry,
  ProjectEntry,
  WorkHistoryEntry
} from '../../shared/profile'
import {
  highestEducation,
  isPresentEnd,
  normalizeJob,
  sortJobs
} from '../../shared/profile-helpers'

export const DATE_RANGE_RE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d\d)\s*(?:[-–—]|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d\d|present|current|now|today)/i

const TITLE_RE =
  /\b(engineer|developer|programmer|manager|analyst|administrator|director|intern|consultant|designer|scientist|lead|specialist|instructor|teacher|tutor|assistant|architect|officer|coordinator|associate|technician|representative|supervisor|founder|co-founder|owner|researcher|professor|recruiter|strategist|executive|staff|principal|chief|sre|devops)\b/i

const SCHOOL_RE =
  /\b(university|college|institute|school|academy|polytechnic|conservatory)\b/i

const SECTION_HEAD =
  /^(summary|profile|about(?: me)?|objective|skills|technical skills|experience|work experience|work history|employment|education|projects?|certifications?|licenses?|languages?|awards?)\s*$/i

const LANGS = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Arabic',
  'Kurdish',
  'Turkish',
  'Persian',
  'Farsi',
  'Mandarin',
  'Cantonese',
  'Chinese',
  'Japanese',
  'Korean',
  'Vietnamese',
  'Hindi',
  'Russian',
  'Ukrainian',
  'Polish',
  'Hebrew',
  'Dutch',
  'Swedish',
  'American Sign Language',
  'ASL'
]

function str(v: unknown): string {
  return (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim()
}

function squash(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, '')
}

export function inText(value: string, text: string): boolean {
  const v = squash(value)
  return Boolean(v) && squash(text).includes(v)
}

export function wordsInText(value: string, text: string, share = 0.8): boolean {
  const words = String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 2)
  if (!words.length) return false
  const T =
    ' ' +
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, ' ') +
    ' '
  const hit = words.filter(
    (w) => T.includes(' ' + w.replace(/\.$/, '') + ' ') || T.includes(w)
  ).length
  return hit / words.length >= share
}

type SectionKey =
  | 'header'
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'other'

function normalizeHeading(h: string): SectionKey {
  const t = h.toLowerCase().replace(/[^a-z ]/g, '').trim()
  if (/^(summary|profile|about|objective)/.test(t)) return 'summary'
  if (/^skills|technical skills/.test(t)) return 'skills'
  if (/experience|work history|employment/.test(t)) return 'experience'
  if (/^education/.test(t)) return 'education'
  if (/^project/.test(t)) return 'projects'
  if (/certif|license/.test(t)) return 'certifications'
  if (/^language/.test(t)) return 'languages'
  return 'other'
}

function splitSections(text: string): Record<SectionKey, string> {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
  const out: Record<SectionKey, string[]> = {
    header: [],
    summary: [],
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    languages: [],
    other: []
  }
  let cur: SectionKey = 'header'
  for (const line of lines) {
    if (!line) {
      out[cur].push('')
      continue
    }
    if (SECTION_HEAD.test(line) || (/^[A-Z][A-Za-z &/]{2,40}$/.test(line) && normalizeHeading(line) !== 'other' && line.length < 40)) {
      const key = normalizeHeading(line)
      if (key !== 'other' || SECTION_HEAD.test(line)) {
        cur = key === 'other' ? cur : key
        continue
      }
    }
    out[cur].push(line)
  }
  const joined = {} as Record<SectionKey, string>
  for (const k of Object.keys(out) as SectionKey[]) {
    joined[k] = out[k].join('\n').trim()
  }
  return joined
}

function datesOf(text: string): { raw: string; start: string; end: string } | null {
  const m = String(text || '').match(DATE_RANGE_RE)
  if (!m) return null
  const cap = (s: string) =>
    s.replace(/^(present|current|now|today)$/i, 'Present')
  return {
    raw: m[0],
    start: str((m[1] || '') + m[2]),
    end: cap(str((m[3] || '') + m[4]))
  }
}

function splitEntries(body: string): string[] {
  const lines = body.split('\n')
  const chunks: string[][] = []
  let cur: string[] = []
  for (const line of lines) {
    if (!line.trim()) {
      if (cur.length) {
        chunks.push(cur)
        cur = []
      }
      continue
    }
    // New entry when a date range appears and we already have content
    if (cur.length && DATE_RANGE_RE.test(line) && cur.some((l) => /[A-Za-z]/.test(l))) {
      // date may be on same entry's last line — keep if previous was short header
      const prev = cur[cur.length - 1]
      if (DATE_RANGE_RE.test(prev) || TITLE_RE.test(line) || /—|–|-/.test(line)) {
        // still same entry if line is mostly dates
      }
    }
    // Start new entry on lines that look like "Title — Company" after bullets
    if (
      cur.length >= 2 &&
      !/^[•\-\*]/.test(line) &&
      (TITLE_RE.test(line) || /—|–|\s-\s/.test(line)) &&
      cur.some((l) => /^[•\-\*]/.test(l) || DATE_RANGE_RE.test(l))
    ) {
      chunks.push(cur)
      cur = [line]
      continue
    }
    cur.push(line)
  }
  if (cur.length) chunks.push(cur)
  return chunks.map((c) => c.join('\n')).filter((t) => t.replace(/\s/g, '').length > 3)
}

function degreeOf(text: string): string {
  const t = String(text || '')
  if (/\b(doctor of|doctorate|doctoral|ph\.?\s?d)\b/i.test(t)) return 'Doctorate'
  if (/\bmaster(['']?s)?\b|\bmba\b/i.test(t)) return "Master's"
  if (/\bbachelor(['']?s)?\b|\bbaccalaureate\b/i.test(t)) return "Bachelor's"
  if (/\bassociate(['']?s)?\s+(degree|of|in)\b/i.test(t)) return "Associate's"
  if (/\bboot ?camp\b/i.test(t)) return 'Bootcamp'
  if (/\b(high school|secondary school|ged)\b/i.test(t)) return 'High School'
  if (/\b(certificate|diploma)\b/i.test(t)) return 'Certificate'
  if (/\b(B\.?S\.?|B\.?A\.?|BS|BA)\b/.test(t)) return "Bachelor's"
  if (/\b(M\.?S\.?|M\.?A\.?|MS|MA|MBA)\b/.test(t)) return "Master's"
  return ''
}

function parseJobEntry(block: string): WorkHistoryEntry | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return null
  const bullets = lines
    .filter((l) => /^[•\-\*]/.test(l) || /^[•·]/.test(l))
    .map((l) => l.replace(/^[•\-\*·]\s*/, '').trim())
    .filter(Boolean)
  const headerLines = lines.filter((l) => !/^[•\-\*·]/.test(l))
  const header = headerLines.join(' | ')
  const dr = datesOf(header) || datesOf(block)
  let rest = header
  if (dr) rest = rest.replace(dr.raw, ' ')
  const parts = rest
    .split(/\s*[|·•]\s*|\s+—\s+|\s+–\s+|\s+-\s+/)
    .map(str)
    .filter(Boolean)
  let title = parts.find((p) => TITLE_RE.test(p)) || ''
  let company = parts.find((p) => p !== title && !/^(remote|hybrid)$/i.test(p)) || ''
  if (!title && parts[0]) title = parts[0]
  if (!company && parts[1]) company = parts[1]
  // "Title — Company" already split; "Title at Company"
  if ((!company || !title) && parts[0]) {
    const m = parts[0].split(/\s+at\s+|\s+@\s+/i)
    if (m.length >= 2) {
      title = title || m[0]
      company = company || m.slice(1).join(' ')
    }
  }
  let location = ''
  const loc = header.match(
    /\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2})\b/
  )
  if (loc) location = `${loc[1]}, ${loc[2]}`
  if (!company && !title) return null
  const end = dr ? dr.end : ''
  return normalizeJob({
    title,
    company,
    location,
    start: dr ? dr.start : '',
    end: isPresentEnd(end) ? 'Present' : end,
    bullets: bullets.slice(0, 25)
  })
}

function parseEducationEntry(block: string): EducationEntry | { certification: string } | null {
  const text = block.replace(/\n/g, ' | ')
  const dr = datesOf(text)
  let status = 'completed'
  if (dr && isPresentEnd(dr.end)) status = 'in progress'
  if (/\bcredits?\b|\bcoursework\b|\bincomplete\b/i.test(text)) status = 'attended'
  const degree = degreeOf(text)
  const schoolMatch = text.split(/\s*[|·•]\s*|\s+—\s+/).map(str).find((t) => SCHOOL_RE.test(t))
  const school = schoolMatch || ''
  if (!school && !degree) {
    if (/\bcertif|license|aws|cka|pmp\b/i.test(text)) return { certification: str(text.replace(/\s*\|\s*/g, ' — ')) }
    return null
  }
  if (!school && degree === 'Certificate') return { certification: str(text.replace(/\s*\|\s*/g, ' — ')) }
  const fieldParts = text
    .split(/\s*[|·•]\s*/)
    .map(str)
    .filter((t) => t !== school && !DATE_RANGE_RE.test(t) && degreeOf(t) !== degree)
  const field =
    fieldParts.find((t) => /\bin\b|science|engineering|arts|business|computer/i.test(t)) ||
    ''
  return {
    school,
    degree,
    degreeText: degree ? text : '',
    field: field.replace(/^.*?in\s+/i, '').slice(0, 80),
    start: dr ? dr.start : '',
    end: dr ? (isPresentEnd(dr.end) ? 'Present' : dr.end) : '',
    location: '',
    status,
    highest: false
  }
}

function parseProjectEntry(block: string): ProjectEntry | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return null
  const bullets = lines
    .filter((l) => /^[•\-\*·]/.test(l))
    .map((l) => l.replace(/^[•\-\*·]\s*/, '').trim())
  const header = lines.filter((l) => !/^[•\-\*·]/.test(l))
  const dr = datesOf(header.join(' '))
  let name = header[0] || ''
  if (dr) name = name.replace(dr.raw, '').trim()
  name = name.split(/\s*[|·—–]\s*/)[0].trim()
  const url = block.match(
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|,;)]*)?/i
  )
  let link = url ? url[0].replace(/[.)]+$/, '') : ''
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link
  if (!name) return null
  return {
    name,
    link,
    start: dr ? dr.start : '',
    end: dr ? dr.end : '',
    role: '',
    description: header.slice(1).join(' · ').slice(0, 500),
    bullets: bullets.slice(0, 15),
    tech: []
  }
}

function splitSkillText(body: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of body + ',') {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === ';' || ch === '•' || ch === '|') && !depth) {
      const t = cur.trim().replace(/\.$/, '')
      if (t && t.length <= 60) out.push(t)
      cur = ''
    } else cur += ch
  }
  return out
}

export interface DeterministicExtract {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  linkedin?: string
  github?: string
  portfolio?: string
  location?: string
  city?: string
  state?: string
  country?: string
  summary?: string
  yearsExperience?: string
  currentEmployer?: string
  currentTitle?: string
  currentStartDate?: string
  workHistory: WorkHistoryEntry[]
  education: EducationEntry[]
  projects: ProjectEntry[]
  skills: string[]
  certifications: string[]
  languages: string[]
  dropped: string[]
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3}[\s.-]?\d{3,4}\b/
const URL_RE =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|dev|me|net|org|app|ai|co|so|xyz|tech|site|page|info|us|uk|de|ca)(?:\/[^\s|,;)]*)?/gi

function contactFrom(text: string) {
  const out: Partial<DeterministicExtract> = {}
  const em = text.match(EMAIL_RE)
  if (em) out.email = em[0]
  const ph = text.replace(EMAIL_RE, ' ').match(PHONE_RE)
  if (ph && ph[0].replace(/\D/g, '').length >= 9) out.phone = ph[0].trim()
  const urls = (text.replace(EMAIL_RE, ' ').match(URL_RE) || []).map((u) =>
    u.replace(/[.)]+$/, '')
  )
  const seen = new Set<string>()
  for (let u of urls) {
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    const k = u.toLowerCase().replace(/\/$/, '')
    if (seen.has(k)) continue
    seen.add(k)
    if (/linkedin\.com\/in\//i.test(u)) out.linkedin = out.linkedin || u
    else if (/github\.com\/[^/\s]+/i.test(u)) out.github = out.github || u
    else if (!out.portfolio) out.portfolio = u
  }
  return out
}

function guessName(text: string): { firstName?: string; lastName?: string } {
  const firstLine = text
    .split(/\n/)
    .map((l) => l.trim())
    .find(Boolean)
  if (!firstLine) return {}
  const s = firstLine.split(/[|\t,·•]/)[0].trim()
  if (/^[A-Za-z'’.-]+(\s+[A-Za-z'’.-]+){1,3}$/.test(s) && !/@|\d/.test(s)) {
    const parts = s.split(/\s+/)
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
  }
  return {}
}

/**
 * Rules-only extraction matching extension applyToProfile field set.
 * EEO / work-auth / salary / availability are never set here.
 */
export function extractDeterministic(text: string): DeterministicExtract {
  const sections = splitSections(text)
  const contact = contactFrom(sections.header || text.slice(0, 800))
  const name = guessName(sections.header || text)
  const dropped: string[] = []

  const loc =
    (sections.header || text.slice(0, 400)).match(
      /\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2})\b/
    ) || null

  const skills = splitSkillText(sections.skills || '')
    .filter((s) => s.length > 1)
    .slice(0, 60)

  const workHistory = sortJobs(
    splitEntries(sections.experience)
      .map(parseJobEntry)
      .filter((j): j is WorkHistoryEntry => Boolean(j))
      .filter((j) => {
        const ok =
          (!j.company || inText(j.company, text)) &&
          (!j.title || wordsInText(j.title, text, 0.7) || inText(j.title, text))
        if (!ok) dropped.push(`job: ${j.title} @ ${j.company}`)
        return ok
      })
      .slice(0, 15)
  )

  const education: EducationEntry[] = []
  const certifications: string[] = []
  for (const block of splitEntries(sections.education + '\n\n' + sections.certifications)) {
    const e = parseEducationEntry(block)
    if (!e) continue
    if ('certification' in e) {
      certifications.push(e.certification)
      continue
    }
    if (e.school && !wordsInText(e.school, text, 0.7) && !inText(e.school, text)) {
      dropped.push(`school: ${e.school}`)
      continue
    }
    education.push(e)
  }
  const top = highestEducation(education)
  education.forEach((e) => {
    e.highest = top
      ? e.school === top.school && e.degree === top.degree && e.field === top.field
      : false
  })

  const projects = splitEntries(sections.projects)
    .map(parseProjectEntry)
    .filter((p): p is ProjectEntry => Boolean(p))
    .filter((p) => inText(p.name || '', text) || wordsInText(p.name || '', text, 0.7))
    .slice(0, 15)

  const languages: string[] = []
  const langSrc = sections.languages || text
  for (const L of LANGS) {
    if (new RegExp('\\b' + L + '\\b').test(langSrc) && !languages.includes(L)) {
      languages.push(L)
    }
  }

  let summary = ''
  if (sections.summary) {
    summary = sections.summary.replace(/\s+/g, ' ').trim().slice(0, 1200)
  }

  const current = workHistory.find((j) => j && j.current)
  const years = workHistory
    .map((j) => {
      const m = String(j.start || '').match(/(19|20)\d\d/)
      return m ? Number(m[0]) : 0
    })
    .filter((y) => y > 0)
  const yearsExperience = years.length
    ? String(Math.max(0, new Date().getFullYear() - Math.min(...years)))
    : undefined

  const out: DeterministicExtract = {
    ...contact,
    ...name,
    summary: summary || undefined,
    workHistory,
    education,
    projects,
    skills,
    certifications: certifications.slice(0, 25),
    languages: languages.slice(0, 10),
    dropped,
    currentEmployer: current ? current.company || '' : '',
    currentTitle: current
      ? String(current.title || '').split(/\s+[·|•]\s+|\s+\/\s+/)[0]
      : '',
    currentStartDate: current ? current.start || '' : '',
    yearsExperience
  }

  if (loc) {
    out.location = `${loc[1]}, ${loc[2]}`
    out.city = loc[1]
    out.state = loc[2]
    out.country = 'United States'
  }

  // Validate name appears in text
  if (out.firstName && !inText(out.firstName, text)) {
    dropped.push('firstName: ' + out.firstName)
    delete out.firstName
  }
  if (out.lastName && !inText(out.lastName, text)) {
    dropped.push('lastName: ' + out.lastName)
    delete out.lastName
  }

  return out
}
