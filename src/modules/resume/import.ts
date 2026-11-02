/**
 * Local PDF/DOCX resume import — Node ports of extension lib/resume.js patterns.
 * Parses on-device; never uploads. EEO fields are never inferred from a resume.
 */

import { readFileSync } from 'fs'
import { extname } from 'path'
import JSZip from 'jszip'
import { createRequire } from 'module'
import type { UserProfile, WorkHistoryEntry } from '../../shared/profile'

const require = createRequire(import.meta.url)
// pdf-parse ships CJS; prefer require for Electron main / node builds.
const pdfParse = require('pdf-parse') as (
  data: Buffer
) => Promise<{ text: string; numpages?: number }>
import { EMPTY_PROFILE } from '../../shared/profile'

export interface ResumeParseResult {
  kind: 'pdf' | 'docx'
  name: string
  text: string
  pages?: number
}

export interface ResumeImportPatch {
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
  summary?: string
  skills?: string[]
  workHistory?: WorkHistoryEntry[]
  currentEmployer?: string
  currentTitle?: string
  yearsExperience?: string
  dropped: string[]
}

export interface ResumeImportResult {
  ok: boolean
  message: string
  parsed?: ResumeParseResult
  patch?: ResumeImportPatch
  profile?: UserProfile
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3}[\s.-]?\d{3,4}\b/
const URL_RE =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|dev|me|net|org|app|ai|co|so|xyz|tech|site|page|info|us|uk|de|ca)(?:\/[^\s|,;)]*)?/gi

async function parseDocx(buf: Buffer): Promise<{ text: string }> {
  const zip = await JSZip.loadAsync(buf)
  const doc = zip.file('word/document.xml')
  if (!doc) throw new Error('Invalid DOCX — missing word/document.xml')
  const xml = await doc.async('string')
  // Preserve paragraph breaks from <w:p>; strip other tags.
  const withBreaks = xml
    .replace(/<\/w:p>/gi, '\n')
    .replace(/<w:tab[^/]*\/>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  const text = withBreaks
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  return { text }
}

async function parsePdf(buf: Buffer): Promise<{ text: string; pages?: number }> {
  const data = await pdfParse(buf)
  return { text: String(data.text || '').trim(), pages: data.numpages }
}

export async function parseResumeFile(
  filePath: string,
  originalName?: string
): Promise<ResumeParseResult> {
  const name = originalName || filePath.split(/[/\\]/).pop() || 'resume'
  const ext = extname(name).toLowerCase()
  const buf = readFileSync(filePath)
  if (ext === '.pdf') {
    const r = await parsePdf(buf)
    if (r.text.replace(/\s/g, '').length < 80) {
      throw new Error(
        'This PDF has almost no selectable text (it may be a scan). Use a DOCX or a text-based PDF.'
      )
    }
    return { kind: 'pdf', name, text: r.text, pages: r.pages }
  }
  if (ext === '.docx') {
    const r = await parseDocx(buf)
    if (r.text.replace(/\s/g, '').length < 80) {
      throw new Error('This Word file looks empty.')
    }
    return { kind: 'docx', name, text: r.text }
  }
  throw new Error('Please choose a PDF or Word (.docx) file.')
}

function squash(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]+/g, '')
}

function inText(value: string, text: string): boolean {
  const v = squash(value)
  return Boolean(v) && squash(text).includes(v)
}

function deterministicContact(text: string) {
  const out: Partial<ResumeImportPatch> = { dropped: [] }
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

function extractSkills(text: string): string[] {
  const m = text.match(/(?:^|\n)\s*skills?\s*[:\-]?\s*\n?([\s\S]{0,800}?)(?:\n\s*\n|\n[A-Z][A-Za-z ]{2,30}\s*\n|$)/i)
  const body = m ? m[1] : ''
  const source = body || text
  const parts = source
    .split(/[,;|•·\n]/)
    .map((s) => s.replace(/^[\s\-*]+/, '').trim())
    .filter((s) => s.length > 1 && s.length <= 40 && !/^(experience|education|projects)$/i.test(s))
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    if (!inText(p, text) && body && !inText(p, body)) continue
    seen.add(k)
    out.push(p)
    if (out.length >= 40) break
  }
  return out
}

function extractSummary(text: string): string {
  const m = text.match(
    /(?:^|\n)\s*(summary|profile|about(?: me)?|objective)\s*[:\-]?\s*\n([\s\S]{40,900}?)(?:\n\s*\n|\n(?:experience|work history|employment|skills|education)\b)/i
  )
  return m ? m[2].replace(/\s+/g, ' ').trim().slice(0, 1200) : ''
}

/** Build a conservative patch from plain resume text (deterministic, no model required). */
export function extractPatchFromText(text: string): ResumeImportPatch {
  const contact = deterministicContact(text)
  const name = guessName(text)
  const skills = extractSkills(text)
  const summary = extractSummary(text)
  const dropped: string[] = []

  const loc = text.match(
    /\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2})\b/
  )

  const patch: ResumeImportPatch = {
    ...contact,
    ...name,
    skills,
    summary: summary || undefined,
    dropped
  }
  if (loc) {
    patch.location = `${loc[1]}, ${loc[2]}`
    patch.city = loc[1]
    patch.state = loc[2]
  }

  // Never touch EEO — explicitly documented.
  return patch
}

/**
 * Apply resume patch onto profile without wiping empty lists / EEO.
 * Lists replace only when the patch has items.
 */
export function applyResumePatch(
  profile: UserProfile,
  patch: ResumeImportPatch,
  resumeText: string
): UserProfile {
  const p: UserProfile = {
    ...EMPTY_PROFILE,
    ...profile,
    education: { ...EMPTY_PROFILE.education, ...profile.education },
    eeo: { ...profile.eeo }, // never overwrite from resume
    workHistory: [...(profile.workHistory || [])],
    educationList: [...(profile.educationList || [])],
    projects: [...(profile.projects || [])],
    skills: [...(profile.skills || [])],
    certifications: [...(profile.certifications || [])],
    languages: [...(profile.languages || [])]
  }

  const assignStr = (key: keyof UserProfile, value: string | undefined) => {
    if (typeof value === 'string' && value.trim()) {
      ;(p as unknown as Record<string, unknown>)[key] = value
    }
  }
  assignStr('firstName', patch.firstName)
  assignStr('lastName', patch.lastName)
  assignStr('email', patch.email)
  assignStr('phone', patch.phone)
  assignStr('linkedin', patch.linkedin)
  assignStr('github', patch.github)
  assignStr('portfolio', patch.portfolio)
  assignStr('location', patch.location)
  assignStr('city', patch.city)
  assignStr('state', patch.state)
  assignStr('summary', patch.summary)
  assignStr('currentEmployer', patch.currentEmployer)
  assignStr('currentTitle', patch.currentTitle)
  assignStr('yearsExperience', patch.yearsExperience)
  if (patch.skills?.length) p.skills = patch.skills
  if (patch.workHistory?.length) p.workHistory = patch.workHistory
  p.resumeText = resumeText.slice(0, 20000)
  if (!p.signature && p.firstName) {
    p.signature = [p.firstName, p.lastName].filter(Boolean).join(' ')
  }
  return p
}

export async function importResumeFromPath(
  filePath: string,
  current: UserProfile,
  originalName?: string
): Promise<ResumeImportResult> {
  try {
    const parsed = await parseResumeFile(filePath, originalName)
    const patch = extractPatchFromText(parsed.text)
    const profile = applyResumePatch(current, patch, parsed.text)
    const bits = [
      patch.firstName || patch.lastName ? 'name' : '',
      patch.email ? 'email' : '',
      patch.skills?.length ? `${patch.skills.length} skills` : '',
      patch.summary ? 'summary' : ''
    ].filter(Boolean)
    return {
      ok: true,
      message: `Imported ${parsed.name} (${parsed.kind}). Updated: ${bits.join(', ') || 'resume text only'}. EEO left untouched.`,
      parsed,
      patch,
      profile
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}
