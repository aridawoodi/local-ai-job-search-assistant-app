/**
 * Local PDF/DOCX resume import — Node ports of extension lib/resume.js + extract.js.
 * Parses on-device; never uploads. EEO fields are never inferred from a resume.
 */

import { readFileSync } from 'fs'
import { extname } from 'path'
import JSZip from 'jszip'
import { createRequire } from 'module'
import type {
  EducationEntry,
  ProjectEntry,
  UserProfile,
  WorkHistoryEntry
} from '../../shared/profile'
import { EMPTY_PROFILE } from '../../shared/profile'
import {
  normalizeJob,
  sortJobs,
  syncCurrent,
  syncEducation
} from '../../shared/profile-helpers'
import { extractDeterministic } from './extract'

const require = createRequire(import.meta.url)
// pdf-parse ships CJS; prefer require for Electron main / node builds.
const pdfParse = require('pdf-parse') as (
  data: Buffer
) => Promise<{ text: string; numpages?: number }>

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
  country?: string
  summary?: string
  skills?: string[]
  workHistory?: WorkHistoryEntry[]
  /** Maps to educationList via applyResumePatch (extension applyToProfile). */
  education?: EducationEntry[]
  projects?: ProjectEntry[]
  certifications?: string[]
  languages?: string[]
  currentEmployer?: string
  currentTitle?: string
  currentStartDate?: string
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

async function parseDocx(buf: Buffer): Promise<{ text: string }> {
  const zip = await JSZip.loadAsync(buf)
  const doc = zip.file('word/document.xml')
  if (!doc) throw new Error('Invalid DOCX — missing word/document.xml')
  const xml = await doc.async('string')
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

/** Build a conservative patch from plain resume text (deterministic, no model required). */
export function extractPatchFromText(text: string): ResumeImportPatch {
  const d = extractDeterministic(text)
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    linkedin: d.linkedin,
    github: d.github,
    portfolio: d.portfolio,
    location: d.location,
    city: d.city,
    state: d.state,
    country: d.country,
    summary: d.summary,
    skills: d.skills,
    workHistory: d.workHistory,
    education: d.education,
    projects: d.projects,
    certifications: d.certifications,
    languages: d.languages,
    currentEmployer: d.currentEmployer,
    currentTitle: d.currentTitle,
    currentStartDate: d.currentStartDate,
    yearsExperience: d.yearsExperience,
    dropped: d.dropped
  }
}

/**
 * Apply resume patch onto profile without wiping empty lists / EEO.
 * Mirrors extension JAA.resume.applyToProfile (all fields chosen).
 * Lists replace only when the patch has items. EEO never touched.
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
    eeo: { ...EMPTY_PROFILE.eeo, ...profile.eeo }, // never overwrite from resume
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
  for (const k of [
    'firstName',
    'lastName',
    'email',
    'phone',
    'linkedin',
    'github',
    'portfolio',
    'location',
    'city',
    'state',
    'country',
    'summary',
    'yearsExperience'
  ] as const) {
    assignStr(k, patch[k])
  }

  if (patch.skills?.length) p.skills = patch.skills
  if (patch.certifications?.length) p.certifications = patch.certifications
  if (patch.languages?.length) p.languages = patch.languages
  if (patch.projects?.length) p.projects = patch.projects
  if (patch.workHistory?.length) {
    p.workHistory = sortJobs(patch.workHistory.map(normalizeJob))
  }
  // current* mirrors come from syncCurrent — do not take lone patch fields as source of truth
  syncCurrent(p)

  if (patch.education?.length) {
    p.educationList = patch.education.map((e) => ({
      school: e.school || '',
      degree: e.degree || '',
      degreeText: e.degreeText || '',
      field: e.field || '',
      start: e.start || e.startYear || '',
      end: e.end || e.endYear || '',
      location: e.location || '',
      status: e.status || 'completed',
      highest: !!e.highest
    }))
    syncEducation(p)
  }

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
      patch.workHistory?.length ? `${patch.workHistory.length} jobs` : '',
      patch.education?.length ? `${patch.education.length} schools` : '',
      patch.projects?.length ? `${patch.projects.length} projects` : '',
      patch.skills?.length ? `${patch.skills.length} skills` : '',
      patch.certifications?.length ? `${patch.certifications.length} certs` : '',
      patch.languages?.length ? `${patch.languages.length} languages` : '',
      patch.summary ? 'summary' : '',
      'resumeText'
    ].filter(Boolean)
    const droppedNote = patch.dropped?.length
      ? ` Left out ${patch.dropped.length} unverified fact(s).`
      : ''
    return {
      ok: true,
      message: `Imported ${parsed.name} (${parsed.kind}). Updated: ${bits.join(', ')}. EEO left untouched.${droppedNote}`,
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
